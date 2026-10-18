# Estado del proyecto

Actualizado el 17 de octubre de 2026, con la Fase 2 a mitad de camino (10 de 16 tareas).

## Dónde estamos

| Fase | Estado | Qué dejó |
|---|---|---|
| 0, cimientos | Terminada | Monorepo, generador aleatorio con semilla, `paso` con repetición dorada, esquemas Zod, canal de datos desde PokeAPI, lista de especies en Phaser 4 con idioma cambiable, e2e y CI |
| 1, combate | Terminada | Movimientos y sets, adaptador de `@pkmn/sim`, IA rival, combate en Web Worker, sprites con atlas, escena de combate, e2e y presupuesto de carga |
| 2, expedición | En curso, 10 de 16 tareas | Hecho: mapa de nodos con semilla, estado de la expedición, rivales por nodo, runas, tienda y captura (lógica), balance en datos, escena del mapa y combates encadenados con pantalla final. Falta: nodos sin combate, tienda y runas en pantalla, captura en combate, Alfa/Sombrío/jefe, simulador de balance y cierre |
| 3 en adelante | Pendiente | Ver `docs/gdd.md` (local) o la hoja de ruta del diseño |

Qué se puede hacer hoy: abrir el juego, ver las 10 especies de Kanto en español o inglés, lanzar un combate de prueba 3 contra 3 (tecla B) o abrir una expedición (tecla E): elegir ruta en el mapa de un piso y pelear los combates encadenados con los PS que arrastra el equipo. Al perder, o al ganar el jefe del piso 3, sale la pantalla final con el dinero conservado. Todo es repetible con `?semilla=`. Los nodos sin combate (tienda, manantial, evento, cofre) todavía se atraviesan sin efecto, y el jefe de los pisos 1 y 2 aún no tiene set propio.

## Siguiente paso: terminar la Fase 2

Objetivo del diseño (secciones 5 y 10): una expedición de tres pisos con mapa de nodos generado con semilla, nueve tipos de nodo, Runas Unown, tienda, captura de Pokémon salvajes y el jefe del primer bioma. Criterio de aceptación: expedición completa y una tasa de victoria entre 40 y 60 % en el simulador de balance.

Tareas que faltan, en orden:
1. Manantial, cofre y evento: datos de eventos con esquema, efectos puros y una escena de elección.
2. Tienda Kecleon y runas en pantalla (la lógica ya existe en `packages/core`).
3. Captura en combate y equipo de hasta seis.
4. Alfa (runa garantizada), Sombrío (se anota para purificar en la Fase 4) y jefe del primer bioma con su condición de fisura.
5. `tools/balance`: simulador de expediciones completas y ajuste de los números de `packs/kanto/expedicion.json` hasta el 40 a 60 % de victorias. Dato de partida: con una política fija de "primer movimiento", los combates contra entrenadores (3 contra 3) se pierden casi siempre y los salvajes casi siempre se ganan, así que el simulador necesita una política más razonable.
6. Cierre: revisión de toda la rama, esta página al día y la cadena completa en verde.

Después de la Fase 2 va un audio mínimo (ver decisiones vigentes) antes de empezar el Santuario.

## Mapa del repositorio

- `packages/core`: reglas puras y deterministas (`crearRng`, `paso`, `reproducir`) y las de la expedición: `generarPiso` (mapa de nodos), estado inmutable de la expedición (`iniciarExpedicion`, `entrar`, `resolverCombate`, `curar`, `liquidar`), `runas`, `tienda`, `captura` y `recompensa`. Sin dependencias de motor.
- `packages/data`: esquemas Zod (especie, movimiento, set, balance de la expedición, manifiesto, atlas) y sus tipos.
- `packages/battle`: `Combate` sobre `@pkmn/sim`, IA rival, sesión de combate y cliente del Worker. Dos entradas: la del cliente (`@santuario/battle`, sin el simulador) y la del servidor (`@santuario/battle/servidor`).
- `tools/pipeline`: descarga con caché y pausa, recorte, unión con `@pkmn/data`, atlas de sprites, verificación sin red y presupuesto de carga.
- `packs/kanto`: datos del paquete. `trabajos.json`, `sets.json` y `expedicion.json` (recompensas, catálogo de la tienda, tasas de captura) se escriben a mano (entradas de diseño, validadas por esquema y por `pnpm data:verify`); `especies.json`, `movimientos.json`, `atlas-combate.*` y `manifest.json` (con hashes) los genera `pnpm data:build` y no se editan a mano.
- `apps/game`: juego con Phaser 4 y Vite; escenas `ListaEspecies`, `Combate`, `Mapa` y `FinExpedicion`, lógica de la expedición en `src/expedicion`, textos en `src/i18n`. El arte original (iconos de nodo) tiene su fuente de Aseprite en `apps/game/arte/`.

## Decisiones técnicas vigentes

- **Determinismo.** Un combate completo es función de (semilla, equipos, elecciones del jugador). La IA usa un generador derivado de `semilla + ":ia"`. La única fuente no determinista permitida es `crypto.getRandomValues` al abrir la escena de combate sin `?semilla=`.
- **Los datos no viven en el código.** Especies, movimientos, sets y números de balance están en `packs/`. El juego no llama a PokeAPI: solo el canal de datos lo hace, con caché versionada y 1 s entre peticiones reales.
- **El simulador solo corre en el Worker.** El chunk principal no debe contenerlo; lo vigilan una prueba del código fuente, `pnpm budget` y un e2e de carga diferida.
- **Presupuesto de carga.** Se mide comprimido (gzip): chunk principal ≤ 450 KB y carga inicial < 5 MB. No hay límite sin comprimir porque Phaser solo ya pesa unos 1,4 MiB.
- **Atlas de sprites propio.** Empaquetado con `pngjs` y un empaquetador por estantes determinista (en lugar de `free-tex-packer-core`, que arrastraba dependencias sin versión fija).
- **Dependencias con versión exacta**, sin `^` ni `~`.
- **PS entre combates.** Un `MiembroEquipo` admite `psPct` (entero de 1 a 100, solo el jugador) que se fija antes del primer turno, y al terminar el resultado trae `equipoFinal` con los PS de cada miembro. Los debilitados no entran al combate siguiente.
- **Teclado sin duplicados.** Phaser puede volver a entregar teclas ya tratadas, incluso a la escena recién creada tras un `restart`. Todas las escenas escuchan con `alPulsarTecla` (`apps/game/src/teclado.ts`), que descarta lo no posterior al último evento atendido.
- **Semillas.** La del combate de un nodo es `semilla:p<piso>:<nodo>:combate`; el rival, el dinero y las runas usan sufijos propios. Solo `obtenerSemilla` (`apps/game/src/semilla.ts`) admite una semilla no determinista.
- **Audio (decidido, aún sin hacer).** Sintetizador propio de cuatro canales (dos de pulso, onda y ruido) con las canciones como datos en `packs/`, renderizado con `OfflineAudioContext` y reproducido con el motor de Phaser; música y efectos originales. Audio mínimo tras cerrar la Fase 2 (motor, unos ocho efectos y tres canciones: mapa, combate y jefe); lo completo en la Fase 5.
- **Errores tipados entre Worker y escena.** Una elección ilegal se reconoce por `Error.name === "EleccionIlegal"` (sobrevive a Comlink); todo lo demás se trata como fallo fatal con panel de error.

## Pruebas que fijan valores a propósito

- `packages/battle/test/repeticiones/victoria.json` y `derrota.json`: repeticiones doradas con el hash del registro.
- `apps/game/e2e/expedicion.spec.ts`: semillas `x4` (primer combate ganado con el primer miembro a 66 %), `x1` (perdido) y `x7` (ganado con dos miembros debilitados), con la misma política. Mismo procedimiento si cambian motor, sets, IA o balance: recorrer `x1`…`x40` en un bucle e2e desechable (el rival debe jugar con su IA real, no con la política fija).
- `packages/core/src/mapa.test.ts`: JSON congelado de `generarPiso("dorada", 1)`; cambia si cambia el generador.
- `apps/game/e2e/combate.spec.ts`: semillas `s4` (victoria) y `s1` (derrota) con la política "primer movimiento con PP; primer compañero vivo al cambiar a la fuerza", y la constante `HASH_VICTORIA`. Si cambian el motor, los datos o la IA, estas pruebas fallan a propósito. Hay que revisar el cambio y, si es deliberado, volver a buscar semillas (recorrer `s1`…`s40` con la misma política) y actualizar el hash.

## Deuda técnica registrada

Resuelta en esta fase: la sesión de combate queda marcada como inconsistente si el simulador falla tras escribir (se cuentan las escrituras enviadas), `deshabilitado` siempre es booleano y hay prueba de que una elección ilegal no consume aleatoriedad de la IA.

Pendiente de la Fase 2:
- Prueba de la rama de movimiento sin PP y de la propiedad de combates con equipos variados.
- IA: el mensaje del error "ningún movimiento utilizable" es engañoso si falta el Pokémon activo; la aserción del cambio forzado en `combate.test.ts` es floja.
- Datos: `aSlug` no cubre apóstrofes ni acentos cuando crezca el plantel; mensaje redundante de "sin movimiento dañino".
- Cliente del Worker: `inconsistente` no se reinicia en `abrir()` (la ruta pública no lo necesita), `registro()` sigue disponible tras una inconsistencia.
- `precioEnPiso` y `comprar` no rechazan precios negativos: hoy los cubre la validación del catálogo con Zod.
- Las aristas del mapa pueden cruzarse mucho; es cosmético y se puede afinar al pulir la escena.

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
