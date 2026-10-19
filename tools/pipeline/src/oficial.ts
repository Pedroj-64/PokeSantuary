import { type Oficial, urlSpriteValida } from "@santuario/data";

/** Sprites de combate de Negro y Blanco de un Pokémon, con la URL ya validada. */
export function spritesDe(pokemon: unknown): {
	frente: string;
	espalda: string;
} {
	const bw = (
		pokemon as {
			sprites?: {
				versions?: Record<string, Record<string, Record<string, unknown>>>;
			};
		}
	).sprites?.versions?.["generation-v"]?.["black-white"];
	return {
		frente: urlSpriteValida(bw?.front_default),
		espalda: urlSpriteValida(bw?.back_default),
	};
}

/** `oficial.json` de un pack: especie → URLs de sus sprites, ordenado por especie. */
export function oficialDe(
	fuentes: { slug: string; pokemon: unknown }[],
): Oficial {
	const sprites: Oficial["sprites"] = {};
	for (const { slug, pokemon } of [...fuentes].sort((a, b) =>
		a.slug < b.slug ? -1 : 1,
	))
		sprites[slug] = spritesDe(pokemon);
	return { sprites };
}

// Rutas que nunca pueden estar en git (regla de assets, GDD §4.2.4).
const OFICIAL_EN_GIT = [
	/^oficial\//,
	/^tools\/pipeline\/cache\/sprites\//,
	/(^|\/)atlas-combate\.(png|json)$/,
];

/** De una lista de archivos versionados, los que son assets oficiales. */
export const oficialesVersionados = (archivos: readonly string[]): string[] =>
	archivos.filter((f) => OFICIAL_EN_GIT.some((re) => re.test(f)));
