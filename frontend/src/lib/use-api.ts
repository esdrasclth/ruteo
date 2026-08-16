"use client";

import useSWR, { KeyedMutator, SWRConfiguration } from "swr";
import { toast } from "sonner";
import { api, ApiError } from "./api";

/**
 * Una lectura de la API, con caché entre pantallas.
 *
 * Sustituye al patrón que había repetido en cuarenta y tantos archivos:
 *
 *     const [x, setX] = useState<T | null>(null);
 *     const cargar = useCallback(async () => {
 *       try { setX(await api<T>(ruta)); } catch (e) { toast.error(...); }
 *     }, [ruta]);
 *     useEffect(() => { void cargar(); }, [cargar]);
 *
 * Ese patrón tenía tres defectos que no se ven leyendo un archivo suelto, solo
 * sumando los cuarenta:
 *
 * 1. **Nada se recordaba.** Cada montaje era una petición entera. Salir de un
 *    envío y volver lo pedía otra vez completo, con su pantalla en blanco.
 * 2. **Nada se deduplicaba.** El detalle del envío monta cinco componentes que
 *    piden a la vez; `/users/me` lo piden el armazón y la banda de verificación
 *    en cada carga del panel. Eran peticiones simultáneas e idénticas.
 * 3. **`setState` dentro del efecto.** Es lo que marcaba
 *    `react-hooks/set-state-in-effect`: cada carga era un render en cascada.
 *
 * SWR resuelve los tres con la misma pieza, porque la clave ES la ruta: dos
 * componentes que piden la misma ruta comparten petición y caché sin enterarse
 * el uno del otro.
 *
 * Se eligió SWR y no react-query porque la guía de SPAs de este Next
 * (`node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`)
 * la documenta como el camino para sembrar datos desde el servidor con
 * `<SWRConfig fallback>` **sin tocar los componentes que ya usan `useSWR`**.
 * O sea: esto no es una alternativa a mover el panel al servidor, es el paso
 * previo que lo hace posible sin reescribir las pantallas otra vez.
 */
export interface Consulta<T> {
  /** `undefined` mientras no haya nada, ni de caché ni de red. */
  datos: T | undefined;
  error: ApiError | undefined;
  /** Primera carga: no hay nada que pintar todavía. Aquí va el esqueleto. */
  cargando: boolean;
  /** Ya hay datos en pantalla y se están refrescando por detrás. */
  refrescando: boolean;
  /**
   * Vuelve a pedir. Es lo que sustituye a los `load()` / `cargar()` que las
   * pantallas pasaban a sus hijos para refrescar tras guardar algo.
   */
  recargar: KeyedMutator<T>;
}

export interface OpcionesConsulta<T> extends SWRConfiguration<T, ApiError> {
  /** Qué decir si falla. Por defecto, el mensaje que mande el backend. */
  mensajeDeError?: string;
  /**
   * No avisar si falla. `true` calla siempre; con una función se decide por
   * error, que es lo que hace falta para callar SOLO lo esperado.
   *
   * Para lo accesorio: el armazón que no puede pintar el avatar se queda con el
   * nombre de la sesión y no pasa nada. Un aviso rojo por eso es ruido que
   * enseña a ignorar los avisos que sí importan.
   *
   * El caso de la función es el 403 de «módulo no contratado»: quien no compró
   * posventa no tiene por qué ver un error rojo en cada envío que abre, pero un
   * 500 de ese mismo endpoint sí hay que enterarse de él.
   */
  silencioso?: boolean | ((error: ApiError) => boolean);
  /**
   * Tratar el 404 como «todavía no existe» en vez de como fallo.
   *
   * Hace falta donde la ausencia es un estado normal y no un error: un envío
   * sin liquidación aduanera, uno sin devolución abierta. Sin esto, entrar a un
   * envío recién creado saludaba con un aviso rojo.
   */
  nuloSi404?: boolean;
}

/**
 * Cuándo vale la pena reintentar.
 *
 * Nunca ante un error del cliente: un 404 seguirá siendo 404, y un 401 ya
 * mandó a la pantalla de entrada desde `api()` —reintentarlo solo añade
 * peticiones a una sesión que ya está muerta—. Sí ante un 5xx o un fallo de
 * red, que son los que se arreglan solos.
 */
export function conviveReintentar(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500;
  return true;
}

/**
 * Construye un hook de consulta sobre una función de petición concreta.
 *
 * Existe porque el panel de plataforma (`/admin`) habla con otra API y con otra
 * sesión, mediante `platformApi`. `prefijo` mantiene sus claves separadas de
 * las del panel: la caché de SWR es una sola para toda la aplicación, y sin
 * esto una ruta que se llamara igual en los dos sitios —`/buscar`, por
 * ejemplo— compartiría entrada y serviría los datos de una empresa en el panel
 * de plataforma, o al revés.
 */
export function crearUseApi(
  peticion: <T>(ruta: string, init?: RequestInit) => Promise<T>,
  prefijo = "",
) {
  return function useConsulta<T>(
    ruta: string | null,
    {
      mensajeDeError,
      nuloSi404,
      silencioso,
      ...config
    }: OpcionesConsulta<T> = {},
  ): Consulta<T> {
    const { data, error, isLoading, isValidating, mutate } = useSWR<T, ApiError>(
      ruta === null ? null : `${prefijo}${ruta}`,
      async (clave: string) => {
        const path = clave.slice(prefijo.length);
        try {
          return await peticion<T>(path);
        } catch (err) {
          // El 404 se convierte en dato (`null`), no en error, para que la
          // pantalla lo trate como «no hay» y no como «se rompió».
          if (nuloSi404 && err instanceof ApiError && err.status === 404) {
            return null as T;
          }
          throw err;
        }
      },
      {
        onError: (err) => {
          if (
            typeof silencioso === "function" ? silencioso(err) : silencioso
          ) {
            return;
          }
          // La sesión caducada ya se está yendo a la pantalla de entrada; un
          // aviso rojo de camino solo confunde.
          if (err.status === 401) return;
          toast.error(mensajeDeError ?? err.message);
        },
        ...config,
      },
    );

    return {
      datos: data,
      error,
      cargando: isLoading,
      refrescando: isValidating && data !== undefined,
      recargar: mutate,
    };
  };
}

/**
 * Una lectura del panel. La ruta es la que se le pasaría a `api()`, y `null`
 * significa «todavía no pidas nada» —para lo que depende de algo que aún no se
 * ha elegido, como un diálogo sin abrir.
 */
export const useApi = crearUseApi(api);
