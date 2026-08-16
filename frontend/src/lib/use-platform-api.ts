"use client";

import { crearUseApi } from "./use-api";
import { platformApi } from "./platform-api";

/**
 * La misma consulta con caché que `useApi`, pero contra la API de plataforma.
 *
 * El prefijo de la clave no es decorativo: la caché de SWR es única para toda
 * la aplicación, y el panel de empresa y el de plataforma tienen rutas que se
 * llaman igual —`/buscar`, `/audit`—. Sin separarlas, entrar al panel de
 * plataforma después de buscar en el de empresa serviría los resultados
 * equivocados desde la caché.
 */
export const usePlatformApi = crearUseApi(platformApi, "plataforma:");
