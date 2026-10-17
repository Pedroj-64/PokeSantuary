<p align="center"><img src="docs/branding/logo.png" alt="Logo de Ecos del Santuario" width="160" style="image-rendering: pixelated"></p>

# Ecos del Santuario

Fan game roguelike de gestión: expediciones por turnos y un santuario que cuidar. Hecho con Phaser 4 y TypeScript.

## Aviso

Este es un proyecto de fans, **no oficial**, sin fines de lucro y sin afiliación con los titulares de la propiedad intelectual. Pokémon y sus personajes, nombres y demás elementos pertenecen a Nintendo, Creatures Inc., GAME FREAK inc. y The Pokémon Company. No se usan logotipos ni música oficiales, y el proyecto no recibe dinero de ninguna forma.

## Estructura

- `packages/core`: lógica del juego sin dependencias de motor.
- `packages/battle`: adaptador de combate sobre @pkmn/sim, IA rival y Worker.
- `packages/data`: esquemas y paquetes de datos.
- `tools/pipeline`: generación y verificación de datos.
- `apps/game`: el juego (Phaser 4 + Vite).

## Comandos

Requiere Node y pnpm.

- `pnpm install`: instala dependencias.
- `pnpm test`: pruebas con Vitest.
- `pnpm typecheck`: comprobación de tipos (`tsc -b`).
- `pnpm lint`: Biome.
- `pnpm data:build` / `pnpm data:verify`: construir y verificar los datos.
- `pnpm dev`: servidor de desarrollo del juego.
- `pnpm build`: compila el juego en `apps/game/dist/web`.
- `pnpm budget`: comprueba el presupuesto de carga tras compilar (el simulador no debe ir en el chunk principal, que pesa menos de 450 KB comprimido; la carga inicial, menos de 5 MB).
- `pnpm e2e`: pruebas de extremo a extremo (compilan el juego y lo abren en Chromium).

## Cómo jugar el combate de prueba

1. Ejecuta `pnpm dev` y abre la dirección que indique Vite.
2. En la lista de especies pulsa `B` (o el botón de combate) para empezar un combate de 3 contra 3.
3. Controles: `1`–`4` eligen movimiento, `C` abre la lista de cambio (con `1`–`3` eliges al compañero), `Esc` vuelve atrás o sale a la lista; con el ratón basta con pulsar los botones. Cualquier tecla o clic salta el mensaje en curso.
4. Para repetir un combate idéntico añade `?semilla=` a la dirección, por ejemplo `/?semilla=abc`: la misma semilla y las mismas elecciones dan siempre el mismo combate.

## Pruebas

Antes de subir cambios, en este orden: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm data:verify`, `pnpm build`, `pnpm budget` y `pnpm e2e`. La primera vez instala el navegador con `pnpm --filter @santuario/game exec playwright install chromium`. Los e2e usan `?test=1`, que expone ganchos de prueba y acorta las pausas.
