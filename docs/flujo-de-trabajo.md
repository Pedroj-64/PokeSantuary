# Forma de trabajo

Reglas del proyecto y rutina para cada cambio. Complementa `README.md` (comandos) y `docs/estado.md` (dónde vamos).

## Reglas firmes

- **Idioma.** Código, identificadores, comentarios y documentación técnica en español. Los textos del juego van siempre por claves de `apps/game/src/i18n` (es y en, con las mismas claves) y el idioma se cambia en ejecución.
- **Sin dinero ni material oficial.** Nada de anuncios, donaciones ni merchandising; ni logotipos ni música oficiales. Los sprites oficiales solo entran por el canal de datos y se cargan desde un atlas, para poder sustituirlos.
- **Los datos no van en el código.** Especies, movimientos, sets, números de balance y textos de contenido viven en `packs/` y se validan con Zod. Un JSON nuevo necesita su esquema y una prueba.
- **Nunca `Math.random()` ni la fecha en la lógica.** Todo azar sale del generador con semilla (`@santuario/core`).
- **Sin llamar a PokeAPI desde el juego.** Solo `tools/pipeline`, con la caché versionada y una pausa de 1 s entre peticiones reales.
- **Versiones exactas** en todos los `package.json` (sin `^` ni `~`).
- **Entradas no fiables.** Todo lo que viene de datos externos (slugs, URLs, tamaños de imagen, rutas del manifiesto) se valida antes de usarse.

## Rutina para cada función

1. **Plan.** Una función grande se parte en tareas pequeñas con criterios de aceptación verificables. Los planes de las fases 0 y 1 son el modelo: lista de tareas, interfaces exactas, pruebas que deben existir y orden de dependencias.
2. **Pruebas primero.** Se escribe la prueba, se ve fallar, se implementa lo mínimo y se ve pasar. Las repeticiones doradas fijan resultados a propósito (ver `docs/estado.md`).
3. **Un commit por hito**, normalmente uno por tarea, con mensaje en español: `tipo(ámbito): resumen` (`feat`, `fix`, `test`, `docs`, `ci`, `chore`).
4. **Revisión de cada tarea** antes de darla por buena: cumplimiento de lo pedido y calidad del código. Los hallazgos importantes se corrigen y se vuelven a revisar solo los cambios de la corrección.
5. **Cadena de comprobaciones completa tras la última edición**, en este orden:
   `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm data:verify`, `pnpm build`, `pnpm budget`, `pnpm e2e`.
6. **Revisión final de la fase** sobre toda la rama: criterios de aceptación, límites entre paquetes, seguridad en los bordes, higiene del repositorio y plausibilidad del CI en un ejecutor limpio.
7. **Subida.** Solo se hace `git push` cuando se pide. Si un commit ya es público no se reescribe: la corrección va en un commit nuevo.

## Pruebas

- **Unitarias (Vitest).** Reglas puras, esquemas, canal de datos y, en `packages/battle`, el combate completo. Las pruebas por propiedades usan fast-check.
- **Extremo a extremo (Playwright, Chromium).** Se abren con `?test=1`, que expone ganchos de prueba (`window.__santuario`) y acorta las pausas; sin ese parámetro los ganchos no existen. Las esperas son por condición (`expect.poll`, `waitFor`), nunca pausas fijas. Toda prueba falla si hay `pageerror` o `console.error`.
- **Presupuesto de carga (`pnpm budget`).** Falla si el simulador aparece en cualquier chunk inicial, si el chunk principal supera 450 KB comprimido o si la carga inicial supera 5 MB comprimidos.

## Cómo añadir contenido

- **Una especie nueva.** Añadir su slug a `tools/pipeline/especies.json` y escribir su set (uno por especie, 1 a 4 movimientos legales para ella y al menos uno dañino) en `packs/kanto/sets.json`; ejecutar `pnpm data:build` (con red, una vez); revisar el resultado y subir también la caché. Después `pnpm data:verify`. Cambiar el plantel cambia los combates fijados: ver "Pruebas que fijan valores a propósito" en `docs/estado.md`.
- **Un movimiento nuevo.** Añadir el slug a `tools/pipeline/movimientos.json` y usarlo en algún set; el verificador comprueba que existe, que la especie lo aprende y que cada set tiene al menos un movimiento dañino.
- **Una clave de texto.** En `es.json` y `en.json` a la vez; la prueba de paridad falla si difieren.

## Higiene del repositorio

Es público. No se versionan archivos de trabajo local ni material de apoyo (se excluyen con `.git/info/exclude`, no con `.gitignore`). Los commits van a nombre de quien los hace, sin firmas ni anotaciones añadidas.
