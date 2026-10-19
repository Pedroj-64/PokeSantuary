# Estado del proyecto

Actualizado el 19 de octubre de 2026 (cierre del día): Fase 2 terminada, audio propio hecho y Fase 3 (Santuario) avanzada.

## Dónde estamos

| Fase | Estado | Qué dejó |
|---|---|---|
| 0, cimientos | Terminada | Monorepo, generador aleatorio con semilla, `paso` con repetición dorada, esquemas Zod, canal de datos desde PokeAPI, lista de especies en Phaser 4 con idioma cambiable, e2e y CI |
| 1, combate | Terminada | Movimientos y sets, adaptador de `@pkmn/sim`, IA rival, combate en Web Worker, sprites, escena de combate, e2e y presupuesto de carga |
| 2, expedición | Terminada | Mapa de nodos con semilla de tres pisos, estado de la expedición, tienda con mochila, runas, manantial, cofre y eventos, captura de salvajes y equipo de seis, Alfa y Sombrío, jefe del primer bioma con terreno de hierba, balance en datos y simulador de balance (44,8 % de victorias en 500 expediciones) |
| Audio | Hecho | Motor de cuatro canales con notación MML, siete canciones y 58 efectos; música por escena y efectos por tipo de movimiento |
| 3, Santuario | Avanzada | Hecho: núcleo puro del Santuario (jornadas, producción, obra, terreno, Especialidades, hábitats, visitantes, Charla del Alba), estado de la partida con su reductor, guardado con versión y suma de control, escena jugable con gestión (residentes, construcción, mejoras, terreno, caminos, decoración) y salida a la expedición con equipo elegido. También hechas las piezas puras de niveles (tablas, movimientos por nivel, evoluciones, progresión tras una victoria, llamas del Farol, elegir 3 de 6, naturalezas e IV). Falta: llevar niveles, IV y movimientos al combate, las llamas en la expedición, el Prólogo y el simulador de balance |
| 4 en adelante | Pendiente | Ver la hoja de ruta del diseño (local) |

Qué se puede hacer hoy: abrir el juego, ver las 10 especies de Kanto en español o inglés, lanzar un combate de prueba 3 contra 3 (tecla B) o abrir una expedición (tecla E): elegir ruta en el mapa de tres pisos, pelear (entran los tres primeros del equipo), capturar salvajes con las bolas que quedan (tecla K en combate), comprar bolas y bayas en la tienda, usar bayas en el mapa (tecla B), elegir en manantiales, cofres y eventos, y vencer a los Alfa (dan una runa) y al jefe del piso 3. Al perder, o al ganar el jefe del piso 3, sale la pantalla final con el dinero conservado y los Sombríos rescatados. Todo es repetible con `?semilla=`.

## Siguiente paso

Integrar en el combate lo que ya existe como piezas puras: nivel por Pokémon, naturaleza, IV y movimientos aprendidos (`packages/battle` y el Worker), lo que obliga a volver a fijar a propósito las semillas y el hash de los e2e. Después, las llamas del Farol en la expedición, el puente de progresión entre residentes y expedición, las ceremonias, el Prólogo y el simulador de balance con niveles y capturas.

## Decisiones de la Fase 3

- **El tiempo del Santuario son jornadas, no reloj.** Cada jornada tiene cuatro momentos (alba, día, atardecer, noche). Lo que el jugador asigna durante el día se resuelve de golpe en el atardecer con una función pura y determinista (`resolverAtardecer`), así que no hay progreso sin conexión.
- **Necesidades.** Hambre y Ánimo de 0 a 100, Confort por zona (la isla se divide en 12 zonas de 10×10) y Armonía global calculada. No hay Energía aparte.
- **Recursos enteros.** Cada edificio guarda el resto decimal de su producción para no perderlo por redondeo.
- **Assets oficiales fuera de git.** El repositorio no contiene sprites, sonidos ni música de Pokémon. `packs/kanto/oficial.json` solo guarda las URL de los sprites de combate de un repositorio público de terceros; con `?oficial=o1` (o `VITE_OFICIAL=o1` al compilar) el juego los pide en ejecución, y por defecto (`ninguno`) dibuja una silueta original por tipo. Si un sprite no llega, usa la silueta. `pnpm data:verify` falla si git versiona algún archivo oficial.
- **Partida y guardado.** `EstadoPartida` agrupa el Santuario, la expedición en curso y lo que no cupo al volver; todo cambio pasa por `reducir`, una función pura y determinista. Se guarda en IndexedDB con versión, suma SHA-256 y copia del guardado anterior; un guardado ilegible sin copia no se sustituye por una partida vacía. Si IndexedDB no está disponible el juego sigue en memoria y avisa.
- **Carga bajo demanda.** La escena del Santuario (con el núcleo de gestión y los datos del pack) se pide solo al entrar, para mantener el chunk principal por debajo de 450 KB comprimido (hoy unos 427 KB).
- **Datos del pack para los niveles.** `niveles.json` (tablas de nivel de los rivales y de subida), `aprendizaje.json` (movimientos por nivel, generación más reciente de cada especie, hasta el nivel 50) y `evoluciones.json` (a qué evoluciona cada especie y con qué condición, y su nivel de etapa). Se generan con `pnpm data:build`.
- **Arte.** Losetas de 16 px, vista a escala entera. La paleta vive en `packs/comun/paleta.json` y una prueba exige que todo el arte original la respete (`pnpm arte:build` regenera los PNG con Aseprite).

## Decisiones tomadas al cerrar la Fase 2

- **Perder un combate acaba la expedición**, aunque haya Pokémon sanos en el banquillo. Al combate entran los tres primeros vivos (el motor admite tres por bando); el banquillo conserva sus PS. Cambiarlo (encadenar el banquillo o elegir quién entra) queda para la Fase 3.
- **Lanzar una bola no gasta turno** y siempre se usa la mejor que queda. El simulador no captura, así que el 44,8 % no refleja la captura.
- **Runas.** Solo cinco de las 28 (A, C, F, S, ?). La A (daño del primer movimiento) todavía no actúa en combate. El Alfa da una runa misterio que se revela al pasar de piso; si la mochila está llena o ya hay una, no da nada.
- **Tienda.** Solo vende bolas y bayas (25 % y 50 % de PS). Las MT y los objetos esperan a la Fase 3.
- **Eventos.** El efecto `combate` está en el esquema y se prueba, pero ningún evento lo usa porque la escena de elección aún no sabe lanzarlo.
- **Balance.** El nivel del rival escala por tipo de nodo y piso (`nivelRival` en `expedicion.json`: 22, 26 y 30; Alfa y jefe, 4 más). También hay `tamanoRival` y `curaTrasVictoriaPct`, sin uso por ahora (valores neutros). El simulador usa una política de ruta que busca manantial y tienda con el equipo herido, compra bayas y las usa; en combate, el primer movimiento con PP.
- **Semillas de e2e.** `x4` gana el primer combate con el primero a 91 %, `x17` lo gana dejando a dos debilitados y la derrota se fuerza con un Geodude solo a 1 %. Mismo procedimiento de siempre si cambian motor, sets, IA o balance: simular `x1`…`x80` con `prepararCombate` y la política fija.

## Mapa del repositorio

- `packages/core`: reglas puras y deterministas (`crearRng`, `paso`, `reproducir`) y las de la expedición: `generarPiso` (mapa de nodos), estado inmutable de la expedición (`iniciarExpedicion`, `entrar`, `resolverCombate`, `curar`, `liquidar`), `runas`, `tienda`, `mochila` (compras y bayas), `equipo` (captura), `eventos` (efectos de manantial, cofre y eventos), `captura` y `recompensa`. Sin dependencias de motor.
- `packages/data`: esquemas Zod (especie, movimiento, set, balance de la expedición, eventos, élites, manifiesto, `oficial.json`, balance del Santuario) y sus tipos.
- `packages/battle`: `Combate` sobre `@pkmn/sim`, IA rival, sesión de combate y cliente del Worker. También lleva la lógica de rivales y combates de nodo (`expedicion/`: `crearRival`, `prepararCombate`, `resultadoDeCombate`, `cerrarCombate`, `expedicionInicial`). Dos entradas: la del cliente (`@santuario/battle`, sin el simulador) y la del servidor (`@santuario/battle/servidor`).
- `tools/balance`: simulador de expediciones completas con `@pkmn/sim` en Node (`pnpm balance --n 500`).
- `tools/pipeline`: descarga con caché y pausa, recorte, unión con `@pkmn/data`, `oficial.json` (URL de sprites), verificación sin red y presupuesto de carga.
- `packs/kanto`: datos del paquete. `trabajos.json`, `sets.json` y `expedicion.json` (recompensas, catálogo de la tienda, tasas de captura) se escriben a mano (entradas de diseño, validadas por esquema y por `pnpm data:verify`); `especies.json`, `movimientos.json`, `oficial.json` y `manifest.json` (con hashes) los genera `pnpm data:build` y no se editan a mano.
- `apps/game`: juego con Phaser 4 y Vite; escenas `ListaEspecies`, `Combate`, `Mapa` y `FinExpedicion`, lógica de la expedición en `src/expedicion`, textos en `src/i18n`. El arte original (iconos de nodo) tiene su fuente de Aseprite en `apps/game/arte/`.

## Decisiones técnicas vigentes

- **Determinismo.** Un combate completo es función de (semilla, equipos, elecciones del jugador). La IA usa un generador derivado de `semilla + ":ia"`. La única fuente no determinista permitida es `crypto.getRandomValues` al abrir la escena de combate sin `?semilla=`.
- **Los datos no viven en el código.** Especies, movimientos, sets y números de balance están en `packs/`. El juego no llama a PokeAPI: solo el canal de datos lo hace, con caché versionada y 1 s entre peticiones reales.
- **El simulador solo corre en el Worker.** El chunk principal no debe contenerlo; lo vigilan una prueba del código fuente, `pnpm budget` y un e2e de carga diferida.
- **Presupuesto de carga.** Se mide comprimido (gzip): chunk principal ≤ 450 KB y carga inicial < 5 MB. No hay límite sin comprimir porque Phaser solo ya pesa unos 1,4 MiB.
- **Sin atlas de sprites.** Los sprites de combate ya no se empaquetan ni se versionan: se piden por URL en ejecución (ver Decisiones de la Fase 3).
- **Dependencias con versión exacta**, sin `^` ni `~`.
- **PS entre combates.** Un `MiembroEquipo` admite `psPct` (entero de 1 a 100, solo el jugador) que se fija antes del primer turno, y al terminar el resultado trae `equipoFinal` con los PS de cada miembro. Los debilitados no entran al combate siguiente.
- **Teclado sin duplicados.** Phaser puede volver a entregar teclas ya tratadas, incluso a la escena recién creada tras un `restart`. Todas las escenas escuchan con `alPulsarTecla` (`apps/game/src/teclado.ts`), que descarta lo no posterior al último evento atendido.
- **Semillas.** La del combate de un nodo es `semilla:p<piso>:<nodo>:combate`; el rival, el dinero y las runas usan sufijos propios. Solo `obtenerSemilla` (`apps/game/src/semilla.ts`) admite una semilla no determinista.
- **Audio (hecho).** Sintetizador propio de cuatro canales (dos de pulso, onda y ruido) con las canciones como datos en `packages/audio`, renderizado con `OfflineAudioContext` y reproducido con el motor de Phaser; música y efectos originales. Falta la música del Santuario y del jefe.
- **Errores tipados entre Worker y escena.** Una elección ilegal se reconoce por `Error.name === "EleccionIlegal"` (sobrevive a Comlink); todo lo demás se trata como fallo fatal con panel de error.

## Pruebas que fijan valores a propósito

- `packages/battle/test/repeticiones/victoria.json` y `derrota.json`: repeticiones doradas con el hash del registro.
- `apps/game/e2e/expedicion.spec.ts`: semillas `x4` (primer combate ganado con el primer miembro a 91 %) y `x17` (ganado con dos miembros debilitados), con la misma política; la derrota se fuerza con un Geodude solo a 1 % de PS. Mismo procedimiento si cambian motor, sets, IA o balance (ver decisiones de cierre de la Fase 2).
- `packages/core/src/mapa.test.ts`: JSON congelado de `generarPiso("dorada", 1)`; cambia si cambia el generador.
- `apps/game/e2e/combate.spec.ts`: semillas `s4` (victoria) y `s1` (derrota) con la política "primer movimiento con PP; primer compañero vivo al cambiar a la fuerza", y la constante `HASH_VICTORIA`. Si cambian el motor, los datos o la IA, estas pruebas fallan a propósito. Hay que revisar el cambio y, si es deliberado, volver a buscar semillas (recorrer `s1`…`s40` con la misma política) y actualizar el hash.

## Deuda técnica registrada

Resuelta en esta fase: la sesión de combate queda marcada como inconsistente si el simulador falla tras escribir (se cuentan las escrituras enviadas), `deshabilitado` siempre es booleano y hay prueba de que una elección ilegal no consume aleatoriedad de la IA.

Pendiente de la Fase 2 (heredada):
- Prueba de la rama de movimiento sin PP y de la propiedad de combates con equipos variados.
- IA: el mensaje del error "ningún movimiento utilizable" es engañoso si falta el Pokémon activo; la aserción del cambio forzado en `combate.test.ts` es floja.
- Datos: `aSlug` no cubre apóstrofes ni acentos cuando crezca el plantel; mensaje redundante de "sin movimiento dañino".
- Cliente del Worker: `inconsistente` no se reinicia en `abrir()` (la ruta pública no lo necesita), `registro()` sigue disponible tras una inconsistencia.
- `precioEnPiso` y `comprar` no rechazan precios negativos: hoy los cubre la validación del catálogo con Zod.
- Las aristas del mapa pueden cruzarse mucho; es cosmético y se puede afinar al pulir la escena.

Detectada al cerrar la Fase 2:
- El efecto `combate` de los eventos no se puede lanzar desde la escena; `verificar` debería rechazarlo mientras tanto.
- Esc abandona la expedición sin confirmar (importará con partidas guardadas); las escenas de elección, tienda y captura no tienen panel de error si falla un pack.
- El simulador no captura, no sustituye runas ni anota Sombríos: añadir una política más completa y volver a comprobar el 40 a 60 %.
- Validar `terreno` contra una lista en `Combate.crear` y dejarlo en el registro de entradas del simulador.
- Prueba de que cada evento y cada artículo tiene su clave i18n: ya hay una para las claves del jefe y de las canciones; falta la de eventos y artículos.
- Los e2e usan esperas fijas tras `preparar`; sustituirlas por esperas a un estado.
- Un clic más una tecla en el mismo fotograma ya no encolan dos cambios de escena en el mapa; las demás escenas de elección siguen sin cerrojo.
- El jefe de los pisos 1 y 2 sale del catálogo corriente; si debe tener set propio, va en `elites.json`.

Fase 5:
- Control de presupuesto: la exención por prefijo `worker-*`, etiquetas `<link>` solo con comillas dobles y solo se comprueba el primer chunk de Worker.
- Texto de detalle del panel de error: solo en español.
- Fuente pixel propia, animaciones de sprites, gritos y música.
- Prueba de salto de mensajes con ventana de 900 ms algo justa en un ejecutor frío: ensancharla si falla.

## Decisiones abiertas

- **Nombre del repositorio.** Se llama `PokeSantuary`; el diseño (sección 2.2) pide no usar "Pokémon" en el nombre del repositorio para reducir el riesgo de un aviso de retirada. Renombrarlo es barato porque GitHub redirige el nombre antiguo.
- **Despliegue.** La vista previa en Cloudflare queda para cuando haya cuenta; hoy solo hay CI en GitHub Actions.
- **Alcance de la Fase 3.** La versión 2.1 del diseño añade Especialidades, terreno moldeable, hábitats, peticiones y Confort (secciones 6.3 y 6.10 a 6.13); la fase pasa a 6 semanas. Al llegar ahí, `EspecieSchema` (estricto) ganará un campo y habrá que tocar esquema, canal y datos a la vez.
