<p align="center"><img src="docs/branding/logo.png" alt="Logo de Ecos del Santuario" width="160" style="image-rendering: pixelated"></p>

# Ecos del Santuario

**🇪🇸 Español** · [🇬🇧 English](#echoes-of-the-sanctuary)

![licencia](https://img.shields.io/badge/licencia-PolyForm%20Noncommercial-blue) ![Phaser 4](https://img.shields.io/badge/Phaser-4-8a2be2) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

Fan game roguelike de gestión: expediciones por turnos y un santuario que cuidar. Hecho con Phaser 4 y TypeScript.

## Licencia y comunidad

- Código: [PolyForm Noncommercial 1.0.0](LICENSE). Puedes leerlo, aprender y modificarlo para uso **no comercial**; no puedes venderlo ni monetizarlo.
- Logo y arte original: todos los derechos reservados.
- La historia y el diseño del juego son obra original del autor y no se ceden con el código.
- [Contribuir](CONTRIBUTING.md) · [Código de conducta](CODE_OF_CONDUCT.md)

## Documentación

- `docs/estado.md`: dónde estamos, qué sigue, decisiones y deuda técnica.
- `docs/flujo-de-trabajo.md`: reglas del proyecto y rutina para cada cambio.

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

---

# Echoes of the Sanctuary

[🇪🇸 Español](#ecos-del-santuario) · **🇬🇧 English**

A roguelike management fan game: turn-based expeditions and a sanctuary to take care of. Built with Phaser 4 and TypeScript.

## License and community

- Code: [PolyForm Noncommercial 1.0.0](LICENSE). You may read, learn from and modify it for **noncommercial** use; you may not sell or monetize it.
- Logo and original art: all rights reserved.
- The game's story and design are the author's original work and are not granted with the code.
- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

## Disclaimer

This is an **unofficial** fan project, non-profit and not affiliated with the rights holders. Pokémon and its characters, names and related elements belong to Nintendo, Creatures Inc., GAME FREAK inc. and The Pokémon Company. No official logos or music are used, and the project receives no money in any form.

## Structure

- `packages/core`: engine-independent game logic.
- `packages/battle`: battle adapter over @pkmn/sim, enemy AI and Worker.
- `packages/data`: schemas and data packs.
- `tools/pipeline`: data generation and verification.
- `apps/game`: the game (Phaser 4 + Vite).

## Quick start

Requires Node and pnpm.

```
pnpm install
pnpm dev     # dev server
pnpm test    # Vitest
pnpm build   # production build
pnpm e2e     # end-to-end tests (Chromium)
```

In the species list press `B` to start a test 3v3 battle. Keys `1`–`4` pick moves, `C` opens the switch list, `Esc` goes back. Add `?semilla=abc` to the URL for a reproducible battle.
