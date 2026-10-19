# Assets

Proyecto de fans, **no oficial** y sin fines de lucro. Pokémon y sus personajes, nombres y demás elementos pertenecen a Nintendo, Creatures Inc., GAME FREAK inc. y The Pokémon Company.

## Qué contiene este repositorio

- **Original, con todos los derechos reservados:** el logo, el arte del Santuario (losetas, edificios, protagonista, iconos), la música, los efectos de sonido y las siluetas que sustituyen a los sprites. La paleta del arte está en `packs/comun/paleta.json`.
- **Datos:** `packs/` guarda nombres, tipos, estadísticas y movimientos recortados de [PokeAPI](https://pokeapi.co) y de `@pkmn/data`. Los datos se descargan una sola vez con `tools/pipeline` (con caché y una pausa entre peticiones); el juego nunca llama a PokeAPI.
- **Nada oficial en git:** no hay sprites, gritos, efectos ni música de Pokémon. `pnpm data:verify` falla si algún archivo oficial queda versionado.

## Sprites de combate

`packs/kanto/oficial.json` solo lista las URL de los sprites de combate en el repositorio público `PokeAPI/sprites`; no contiene ningún archivo. Hay dos modos:

- `ninguno` (por defecto): el juego dibuja una silueta original del color del tipo. Se puede jugar y terminar sin ningún recurso externo.
- `o1`: el juego pide cada sprite en ejecución. Se activa con `?oficial=o1` en la dirección o compilando con `VITE_OFICIAL=o1`. Si un sprite no llega, se usa la silueta.

## Terceros

Ver [CREDITOS.md](CREDITOS.md).
