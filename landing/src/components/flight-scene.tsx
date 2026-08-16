"use client";

import { useEffect, useRef } from "react";

// Avión de tres.js que despega, cruza y aterriza según el scroll de la landing.
// Vive en un lienzo FIJO detrás del contenido: el avión se queda quieto respecto
// a la ventana y lo que se mueve es la página, que es lo que hace que se lea
// como un vuelo y no como un adorno que se va con el primer scroll.
//
// Tres decisiones que no se ven en el código pero sostienen todo lo demás:
//
// 1. `three` se importa DENTRO del efecto. Son ~600 kB que no tienen por qué
//    entrar en el bundle inicial de una página cuyo trabajo es cargar rápido y
//    enseñar un titular; llegan después de la hidratación.
// 2. El bucle de render se APAGA cuando el avión alcanza su posición. Sin eso
//    habría un rAF girando en vacío para siempre, y el desenfoque de la barra
//    superior tendría que rehacerse en cada fotograma sobre un lienzo que no
//    cambia. Aquí no se anima nada mientras nadie hace scroll.
// 3. Con `prefers-reduced-motion` no se monta nada: ni lienzo ni WebGL.

const PUNTOS_ESTELA = 150;

// Fases del vuelo en fracción de página recorrida.
const FIN_DESPEGUE = 0.24;
const INICIO_DESCENSO = 0.7;

const ALTURA_CRUCERO = 1.6;
const ALTURA_PISTA = -3.4;

export function FlightScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Aquí había un corte por ancho (`max-width: 767px`) que dejaba el vuelo
    // fuera del móvil por consumo. Se quita a propósito: el bucle de render se
    // apaga solo en cuanto el avión llega a su sitio (ver la nota 2 de arriba),
    // así que en reposo —que es casi todo el rato— no cuesta nada, y el
    // `import()` de three.js sigue ocurriendo después de la hidratación.
    //
    // Lo que SÍ sigue en pie es `prefers-reduced-motion`: quien lo pide no ve
    // nada, y en móvil es donde más gente lo lleva activado.
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let cancelado = false;
    let limpiar: (() => void) | undefined;

    void (async () => {
      const THREE = await import("three");
      // El usuario puede haberse ido de la página mientras cargaba el módulo.
      if (cancelado) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
        });
      } catch {
        // Sin WebGL la página se queda como estaba: el vuelo es decoración.
        return;
      }

      renderer.setClearAlpha(0);

      const escena = new THREE.Scene();
      const camara = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camara.position.set(0, 0, 9);

      // --- el avión ---------------------------------------------------------
      // MORRO HACIA +Z. En three.js `lookAt` de un objeto normal NO se comporta
      // como el de una cámara: la cámara apunta su -Z al objetivo, pero un
      // Object3D apunta su +Z (internamente invierte los argumentos de
      // `Matrix4.lookAt`). Con el morro en -Z el avión volaba de culo.
      // OPACO A PROPÓSITO. La transparencia del avión no se hace aquí sino en el
      // lienzo entero, por CSS (ver el `className` del canvas). Con materiales
      // transparentes, cada pieza se mezcla por separado con lo que tiene
      // detrás: donde el ala cruza el fuselaje se sumaban dos capas al 42 % y
      // esa zona salía notablemente más oscura, marcando las costuras del
      // modelo. Opaco, el test de profundidad tapa lo que hay detrás y el avión
      // se atenúa UNA sola vez, ya compuesto: silueta limpia y uniforme.
      const material = new THREE.MeshStandardMaterial({
        color: 0x1e4c46,
        roughness: 0.65,
        metalness: 0.05,
      });

      const geometrias: import("three").BufferGeometry[] = [];
      const avion = new THREE.Group();

      // Fuselaje de revolución. El perfil —morro romo, barril recto, cola larga
      // y afilada— es lo que separa un avión de a de verdad de una cápsula: la
      // cola de un airliner mide casi un tercio del fuselaje y sube al final.
      const seccion = [
        [0.0, -1.02],
        [0.042, -0.9],
        [0.078, -0.72],
        [0.104, -0.48],
        [0.118, -0.16],
        [0.12, 0.34],
        [0.117, 0.54],
        [0.104, 0.71],
        [0.075, 0.86],
        [0.04, 0.96],
        [0.0, 1.0],
      ].map(([r, y]) => new THREE.Vector2(r, y));

      const fuselaje = new THREE.LatheGeometry(seccion, 22);
      fuselaje.rotateX(Math.PI / 2); // el eje del torno (Y) pasa a ser Z
      geometrias.push(fuselaje);
      avion.add(new THREE.Mesh(fuselaje, material));

      // Perfiles extruidos en el plano de la forma (x = envergadura,
      // y = hacia el morro) y girados para que la cuerda caiga sobre +Z.
      const superficie = (
        puntos: [number, number][],
        grosor: number,
      ): import("three").ExtrudeGeometry => {
        const forma = new THREE.Shape();
        forma.moveTo(puntos[0][0], puntos[0][1]);
        for (let i = 1; i < puntos.length; i++) {
          forma.lineTo(puntos[i][0], puntos[i][1]);
        }
        forma.closePath();
        const geo = new THREE.ExtrudeGeometry(forma, {
          depth: grosor,
          bevelEnabled: false,
        });
        geo.translate(0, 0, -grosor / 2);
        geo.rotateX(Math.PI / 2);
        return geo;
      };

      // Ala en flecha y con estrechamiento: cuerda ancha en la raíz, angosta en
      // la punta. Una tabla de ancho constante se lee como planeador de papel.
      // Envergadura 2.32 frente a 2.02 de fuselaje: ratio 1.15, que es el de un
      // A320. A 1.4 —lo que tenía— parecía un planeador de competición.
      const ala = superficie(
        [
          [0.09, 0.32],
          [1.16, -0.18],
          [1.16, -0.38],
          [0.09, -0.42],
        ],
        0.028,
      );
      geometrias.push(ala);

      const alaDerecha = new THREE.Mesh(ala, material);
      const alaIzquierda = new THREE.Mesh(ala, material);
      alaIzquierda.scale.x = -1;
      // Diedro: las puntas suben un poco. Sin él las alas parecen pegadas.
      alaDerecha.rotation.z = 0.07;
      alaIzquierda.rotation.z = -0.07;
      avion.add(alaDerecha, alaIzquierda);

      // Estabilizador horizontal: el ala en pequeño, más atrás y más recto.
      const cola = superficie(
        [
          [0.06, -0.6],
          [0.46, -0.8],
          [0.46, -0.92],
          [0.06, -0.9],
        ],
        0.022,
      );
      geometrias.push(cola);
      const colaDerecha = new THREE.Mesh(cola, material);
      const colaIzquierda = new THREE.Mesh(cola, material);
      colaIzquierda.scale.x = -1;
      avion.add(colaDerecha, colaIzquierda);

      // Deriva: mismo perfil en flecha pero en vertical, sobre la cola alta.
      const formaDeriva = new THREE.Shape();
      formaDeriva.moveTo(-0.5, 0.02);
      formaDeriva.lineTo(-0.78, 0.46);
      formaDeriva.lineTo(-0.95, 0.46);
      formaDeriva.lineTo(-0.98, 0.02);
      formaDeriva.closePath();
      const deriva = new THREE.ExtrudeGeometry(formaDeriva, {
        depth: 0.024,
        bevelEnabled: false,
      });
      deriva.translate(0, 0, -0.012);
      // Gira sobre Y para que la cuerda de la forma caiga sobre el eje Z.
      deriva.rotateY(-Math.PI / 2);
      geometrias.push(deriva);
      avion.add(new THREE.Mesh(deriva, material));

      // Motores colgados por delante del ala. Son el detalle que más dice
      // «avión de línea» en una silueta pequeña, más que el propio fuselaje.
      const gondola = new THREE.CylinderGeometry(0.072, 0.062, 0.34, 12);
      gondola.rotateX(Math.PI / 2);
      geometrias.push(gondola);

      // El pilón tiene que MORDER el ala por arriba y la góndola por abajo. Con
      // uno más corto los motores se leían como dos cajas flotando al lado.
      const pilon = new THREE.BoxGeometry(0.045, 0.14, 0.2);
      geometrias.push(pilon);

      for (const lado of [1, -1]) {
        const motor = new THREE.Mesh(gondola, material);
        motor.position.set(lado * 0.5, -0.1, 0.16);
        avion.add(motor);

        const soporte = new THREE.Mesh(pilon, material);
        soporte.position.set(lado * 0.5, -0.035, 0.03);
        avion.add(soporte);
      }

      // Mide lo que un icono grande: se ve pasar, no se mira.
      avion.scale.setScalar(0.3);
      escena.add(avion);

      // Luces contenidas. A 2.2/2.4 el verde de marca se lavaba hasta un gris
      // casi blanco y el avión parecía translúcido aunque no lo fuera; bajarlas
      // le devuelve el color y hace que el ala se despegue del fuselaje por
      // sombra propia en vez de por contorno.
      escena.add(new THREE.AmbientLight(0xffffff, 1.15));
      const luz = new THREE.DirectionalLight(0xffffff, 1.7);
      luz.position.set(3, 5, 4);
      escena.add(luz);

      // --- la estela --------------------------------------------------------
      // Una línea de 1 px al 10 %: a la escala de la página pesa menos que las
      // reglas finas que separan las secciones, que es justo lo que se busca.
      const estelaGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array(PUNTOS_ESTELA * 3);
      estelaGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(vertices, 3),
      );
      const estelaMat = new THREE.LineBasicMaterial({
        color: 0x183a37,
        transparent: true,
        // 0.24 aquí × 0.42 del lienzo ≈ 0.10 en pantalla, que es donde estaba
        // afinada. Al mover la opacidad del canvas hay que reajustar esta.
        opacity: 0.24,
      });
      const estela = new THREE.Line(estelaGeo, estelaMat);
      escena.add(estela);

      // --- trayectoria ------------------------------------------------------
      let alcanceX = 7;

      const suaveSalida = (k: number) => 1 - Math.pow(1 - k, 3);
      const suaveEntrada = (k: number) => k * k * k;

      const posicionEn = (t: number, destino: import("three").Vector3) => {
        const x = -alcanceX + t * alcanceX * 2;

        let y: number;
        if (t < FIN_DESPEGUE) {
          const k = t / FIN_DESPEGUE;
          y = ALTURA_PISTA + suaveSalida(k) * (ALTURA_CRUCERO - ALTURA_PISTA);
        } else if (t < INICIO_DESCENSO) {
          const k = (t - FIN_DESPEGUE) / (INICIO_DESCENSO - FIN_DESPEGUE);
          // Panza suave en crucero: una recta perfecta delataba la fórmula.
          y = ALTURA_CRUCERO + Math.sin(k * Math.PI) * 0.5;
        } else {
          const k = (t - INICIO_DESCENSO) / (1 - INICIO_DESCENSO);
          y = ALTURA_CRUCERO - suaveEntrada(k) * (ALTURA_CRUCERO - ALTURA_PISTA);
        }

        // El avión se acerca en mitad del recorrido y se aleja a los extremos.
        const z = -1.4 + Math.sin(t * Math.PI) * 2.3;
        destino.set(x, y, z);
      };

      const posicion = new THREE.Vector3();
      const siguiente = new THREE.Vector3();

      const colocar = (t: number) => {
        posicionEn(t, posicion);
        posicionEn(Math.min(1, t + 0.004), siguiente);

        // En t = 1 no hay "siguiente": se mantiene el rumbo del último tramo.
        if (siguiente.distanceToSquared(posicion) < 1e-8) {
          posicionEn(Math.max(0, t - 0.004), siguiente);
          siguiente.subVectors(posicion, siguiente).add(posicion);
        }

        avion.position.copy(posicion);
        avion.lookAt(siguiente);
        // Alabeo ligado al desplazamiento lateral: el avión se inclina hacia
        // donde vira, como haría de verdad.
        avion.rotateZ(
          Math.max(-0.4, Math.min(0.4, (siguiente.z - posicion.z) * -6)),
        );

        const visibles = Math.max(2, Math.floor(t * PUNTOS_ESTELA));
        for (let i = 0; i < visibles; i++) {
          posicionEn((i / (PUNTOS_ESTELA - 1)) * t, siguiente);
          vertices[i * 3] = siguiente.x;
          vertices[i * 3 + 1] = siguiente.y;
          vertices[i * 3 + 2] = siguiente.z;
        }
        estelaGeo.setDrawRange(0, visibles);
        estelaGeo.attributes.position.needsUpdate = true;
      };

      // --- tamaño y scroll --------------------------------------------------
      const redimensionar = () => {
        // El tamaño sale del lienzo, no de la ventana: el lienzo arranca bajo la
        // barra superior (ver el comentario del `className`) y usar
        // `innerHeight` lo estiraría verticalmente.
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === 0 || h === 0) return;
        // Tope de 1.5: por encima solo crece el búfer, y el avión es una silueta
        // plana al 28 % que no gana nada con más muestras.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setSize(w, h, false);
        camara.aspect = w / h;
        camara.updateProjectionMatrix();
        // Medio ancho visible a z = 0, más un margen para entrar y salir de
        // cuadro en vez de aparecer de la nada en el borde.
        alcanceX = Math.tan((40 * Math.PI) / 360) * 9 * camara.aspect + 2;
      };

      const progreso = () => {
        const recorrible =
          document.documentElement.scrollHeight - window.innerHeight;
        if (recorrible <= 0) return 0;
        return Math.min(1, Math.max(0, window.scrollY / recorrible));
      };

      let objetivo = progreso();
      let actual = objetivo;
      let animando = false;
      let frame = 0;

      const dibujar = () => {
        colocar(actual);
        renderer.render(escena, camara);
      };

      const bucle = () => {
        // Interpolación hacia el objetivo: el avión persigue al scroll con algo
        // de inercia en vez de saltar rueda a rueda.
        actual += (objetivo - actual) * 0.12;
        dibujar();

        if (Math.abs(objetivo - actual) < 0.0002) {
          actual = objetivo;
          dibujar();
          animando = false;
          return;
        }
        frame = requestAnimationFrame(bucle);
      };

      const arrancar = () => {
        if (animando) return;
        animando = true;
        frame = requestAnimationFrame(bucle);
      };

      const alScroll = () => {
        objetivo = progreso();
        arrancar();
      };

      const alRedimensionar = () => {
        redimensionar();
        objetivo = progreso();
        arrancar();
      };

      // Con la pestaña en segundo plano el navegador deja de servir fotogramas.
      // Al volver, el scroll puede haber cambiado: se salta al sitio correcto
      // sin animar, para no ver al avión recorrer media página de golpe.
      const alCambiarVisibilidad = () => {
        if (document.visibilityState !== "visible") return;
        objetivo = progreso();
        actual = objetivo;
        dibujar();
      };

      redimensionar();
      dibujar();

      window.addEventListener("scroll", alScroll, { passive: true });
      window.addEventListener("resize", alRedimensionar);
      document.addEventListener("visibilitychange", alCambiarVisibilidad);

      limpiar = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("scroll", alScroll);
        window.removeEventListener("resize", alRedimensionar);
        document.removeEventListener("visibilitychange", alCambiarVisibilidad);
        geometrias.forEach((g) => g.dispose());
        estelaGeo.dispose();
        estelaMat.dispose();
        material.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      cancelado = true;
      limpiar?.();
    };
  }, []);

  return (
    // El lienzo empieza DEBAJO de la barra superior. Un `backdrop-filter` tiene
    // que leer lo que hay detrás en cada fotograma, y tener WebGL ahí es de las
    // combinaciones que peor se le dan a Chrome. El avión nunca sube hasta esa
    // franja, así que quitarlo de debajo no cuesta nada visualmente y evita el
    // caso malo por completo. (Precaución, no medición: ver nota al usuario.)
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // `opacity` aquí y no en el material: es el único punto donde se regula
      // cuánto pesa el avión en la página. Ver la nota del material.
      //
      // `svh` y no `vh` ni `dvh`, y la diferencia importa justo en móvil:
      //
      // - `vh` mide con la barra de direcciones recogida, así que con la barra
      //   desplegada el lienzo es más alto que la ventana y el avión aterriza
      //   por debajo del borde visible.
      // - `dvh` lo arregla pero cambia de valor MIENTRAS se scrollea, y cada
      //   cambio dispara el `resize` de aquí abajo, que reasigna el búfer de
      //   WebGL. Reasignarlo en pleno scroll es exactamente lo que no se quiere
      //   en un móvil.
      // - `svh` es el alto con la barra desplegada: nunca se queda corto y
      //   nunca cambia. Cuando la barra se recoge sobra una franja abajo, pero
      //   el lienzo es transparente y detrás está el fondo de la página, así
      //   que no se ve nada.
      className="pointer-events-none fixed left-0 right-0 top-16 z-0 h-[calc(100svh-4rem)] w-full opacity-[0.42]"
    />
  );
}
