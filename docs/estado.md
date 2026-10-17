# Estado del proyecto

Actualizado el 17 de octubre de 2026, al cerrar la Fase 1.

## Dónde estamos

| Fase | Estado | Qué dejó |
|---|---|---|
| 0, cimientos | Terminada | Monorepo, generador aleatorio con semilla, `paso` con repetición dorada, esquemas Zod, canal de datos desde PokeAPI, lista de especies en Phaser 4 con idioma cambiable, e2e y CI |
| 1, combate | Terminada | Movimientos y sets, adaptador de `@pkmn/sim`, IA rival, combate en Web Worker, sprites con atlas, escena de combate, e2e y presupuesto de carga |
| 2, expedición | Siguiente | Mapa de nodos con semilla, tipos de nodo, runas, tienda, captura y jefe del primer bioma |
| 3 en adelante | Pendiente | Ver `docs/gdd.md` (local) o la hoja de ruta del diseño |

Qué se puede hacer hoy: abrir el juego, ver las 10 especies de Kanto en español o inglés, y lanzar un combate 3 contra 3 contra una IA, con ratón o teclado, repetible con `?semilla=`.

## Siguiente paso: Fase 2, expedición

Objetivo del diseño (sección 5 y 10): una expedición de tres pisos con mapa de nodos generado con semilla, nueve tipos de nodo, Runas Unown, tienda, captura de Pokémon salvajes y el jefe del primer bioma. Criterio de aceptación: expedición completa y una tasa de victoria entre 40 y 60 % en el simulador de balance (`tools/balance`, aún por crear).

Cómo empezar: primero un plan por tareas con criterios de aceptación (igual que en las fases 0 y 1), después tareas pequeñas con pruebas primero. Antes de tocar objetos equipables o movimientos que atrapan, resolver la deuda "sesión inconsistente" (ver abajo).

## Mapa del repositorio

- `packages/core`: reglas puras y deterministas (`crearRng`, `paso`, `reproducir`). Sin dependencias de motor.
- `packages/data`: esquemas Zod (especie, movimiento, set, manifiesto, atlas) y sus tipos.
- `packages/battle`: `Combate` sobre `@pkmn/sim`, IA rival, sesión de combate y cliente del Worker. Dos entradas: la del cliente (`@santuario/battle`, sin el simulador) y la del servidor (`@santuario/battle/servidor`).
- `tools/pipeline`: descarga con caché y pausa, recorte, unión con `@pkmn/data`, atlas de sprites, verificación sin red y presupuesto de carga.
- `packs/kanto`: datos del paquete. `trabajos.json` y `sets.json` se escriben a mano (entradas de diseño, validadas por esquema y por `pnpm data:verify`); `especies.json`, `movimientos.json`, `atlas-combate.*` y `manifest.json` (con hashes) los genera `pnpm data:build` y no se editan a mano.
- `apps/game`: juego con Phaser 4 y Vite; escenas `ListaEspecies` y `Combate`, textos en `src/i18n`.

## Decisiones técnicas vigentes

- **Determinismo.** Un combate completo es función de (semilla, equipos, elecciones del jugador). La IA usa un generador derivado de `semilla + ":ia"`. La única fuente no determinista permitida es `crypto.getRandomValues` al abrir la escena de combate sin `?semilla=`.
- **Los datos no viven en el código.** Especies, movimientos, sets y números de balance están en `packs/`. El juego no llama a PokeAPI: solo el canal de datos lo hace, con caché versionada y 1 s entre peticiones reales.
- **El simulador solo corre en el Worker.** El chunk principal no debe contenerlo; lo vigilan una prueba del código fuente, `pnpm budget` y un e2e de carga diferida.
- **Presupuesto de carga.** Se mide comprimido (gzip): chunk principal ≤ 450 KB y carga inicial < 5 MB. No hay límite sin comprimir porque Phaser solo ya pesa unos 1,4 MiB.
- **Atlas de sprites propio.** Empaquetado con `pngjs` y un empaquetador por estantes determinista (en lugar de `free-tex-packer-core`, que arrastraba dependencias sin versión fija).
- **Dependencias con versión exacta**, sin `^` ni `~`.
- **Errores tipados entre Worker y escena.** Una elección ilegal se reconoce por `Error.name === "EleccionIlegal"` (sobrevive a Comlink); todo lo demás se trata como fallo fatal con panel de error.

## Pruebas que fijan valores a propósito

- `packages/battle/test/repeticiones/victoria.json` y `derrota.json`: repeticiones doradas con el hash del registro.
- `apps/game/e2e/combate.spec.ts`: semillas `s4` (victoria) y `s1` (derrota) con la política "primer movimiento con PP; primer compañero vivo al cambiar a la fuerza", y la constante `HASH_VICTORIA`. Si cambian el motor, los datos o la IA, estas pruebas fallan a propósito. Hay que revisar el cambio y, si es deliberado, volver a buscar semillas (recorrer `s1`…`s40` con la misma política) y actualizar el hash.

## Deuda técnica registrada

Antes de añadir objetos equipables, movimientos que atrapan (Encore, Anulación) o habilidades que bloquean el cambio:
- `SesionCombate`: la marca de elección aplicada (`mutado`) se pone solo cuando termina `resolver`. Si el simulador rechaza la segunda escritura de un turno, la sesión no queda marcada como inconsistente y el jugador vería "Elección no válida" para siempre. Marcarla por lado y tratar un `|error|` del simulador como fatal.

Fase 2:
- `Combate`: `deshabilitado` puede no ser booleano; usar `!!m.disabled || m.pp === 0`.
- Prueba unitaria de que una elección ilegal no avanza el generador de la IA.
- Prueba de la rama de movimiento sin PP y de la propiedad de combates con equipos variados.
- IA: el mensaje del error "ningún movimiento utilizable" es engañoso si falta el Pokémon activo; la aserción del cambio forzado en `combate.test.ts` es floja.
- Datos: `aSlug` no cubre apóstrofes ni acentos cuando crezca el plantel; mensaje redundante de "sin movimiento dañino".
- Cliente del Worker: `inconsistente` no se reinicia en `abrir()` (la ruta pública no lo necesita), `registro()` sigue disponible tras una inconsistencia.

Fase 5:
- Control de presupuesto: la exención por prefijo `worker-*`, etiquetas `<link>` solo con comillas dobles y solo se comprueba el primer chunk de Worker.
- Descarga de sprites: validar longitud/profundidad/tipo de color de la cabecera PNG y limitar el tamaño sin `content-length` mientras se lee.
- Texto de detalle del panel de error: solo en español.
- Fuente pixel propia, animaciones de sprites, gritos y música.
- Prueba de salto de mensajes con ventana de 900 ms algo justa en un ejecutor frío: ensancharla si falla.

Estado inicial inválido del generador (`crearRng`): hoy se coacciona en silencio; conviene que lance un error antes de tener partidas guardadas (Fase 3).

## Decisiones abiertas

- **Nombre del repositorio.** Se llama `PokeSantuary`; el diseño (sección 2.2) pide no usar "Pokémon" en el nombre del repositorio para reducir el riesgo de un aviso de retirada. Renombrarlo es barato porque GitHub redirige el nombre antiguo.
- **Despliegue.** La vista previa en Cloudflare queda para cuando haya cuenta; hoy solo hay CI en GitHub Actions.
- **Alcance de la Fase 3.** La versión 2.1 del diseño añade Especialidades, terreno moldeable, hábitats, peticiones y Confort (secciones 6.3 y 6.10 a 6.13); la fase pasa a 6 semanas. Al llegar ahí, `EspecieSchema` (estricto) ganará un campo y habrá que tocar esquema, canal y datos a la vez.
