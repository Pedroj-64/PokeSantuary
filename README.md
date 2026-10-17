<p align="center"><img src="docs/branding/logo.png" alt="Logo de Ecos del Santuario" width="160" style="image-rendering: pixelated"></p>

# Ecos del Santuario

Fan game roguelike de gestión: expediciones por turnos y un santuario que cuidar. Hecho con Phaser 4 y TypeScript.

## Aviso

Este es un proyecto de fans, **no oficial**, sin fines de lucro y sin afiliación con los titulares de la propiedad intelectual. Pokémon y sus personajes, nombres y demás elementos pertenecen a Nintendo, Creatures Inc., GAME FREAK inc. y The Pokémon Company. No se usan logotipos ni música oficiales, y el proyecto no recibe dinero de ninguna forma.

## Estructura

- `packages/core`: lógica del juego sin dependencias de motor.
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
- `pnpm e2e`: pruebas de extremo a extremo.
