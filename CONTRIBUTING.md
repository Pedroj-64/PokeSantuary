# Contribuir / Contributing

## Español

¡Gracias por el interés! Antes de empezar:

1. Abre un issue para comentar la idea, sobre todo si es un cambio grande.
2. Lee `docs/flujo-de-trabajo.md` y `docs/estado.md`.
3. Haz un fork, crea una rama y envía un PR pequeño y enfocado.
4. Antes de enviar, en este orden: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm data:verify`, `pnpm build`, `pnpm budget`, `pnpm e2e`.
5. Código, comentarios y documentación en español; los textos del juego van por claves i18n (es/en).

**Licencia de las contribuciones:** al enviar un PR aceptas que tu aporte se publique bajo la licencia del proyecto (ver `LICENSE`) y que el mantenedor pueda relicenciarlo. No envíes material que no sea tuyo ni recursos oficiales de Pokémon (sprites, música, logotipos); los datos oficiales se obtienen solo con `tools/pipeline`.

Se espera respeto a nuestro [Código de conducta](CODE_OF_CONDUCT.md).

## English

Thanks for your interest! Before you start:

1. Open an issue to discuss the idea, especially for big changes.
2. Read `docs/flujo-de-trabajo.md` and `docs/estado.md` (in Spanish).
3. Fork, create a branch and send a small, focused PR.
4. Before sending, in this order: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm data:verify`, `pnpm build`, `pnpm budget`, `pnpm e2e`.
5. Code, comments and docs are in Spanish; in-game text uses i18n keys (es/en).

**Contribution licensing:** by sending a PR you agree your contribution is released under the project license (see `LICENSE`) and that the maintainer may relicense it. Do not submit material that isn't yours or official Pokémon assets (sprites, music, logos); official data comes only from `tools/pipeline`.

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md).
