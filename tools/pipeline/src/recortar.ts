import type { TipoId } from "@santuario/data";

// Solo lo que usamos de las respuestas de PokeAPI.
type Con<T> = { language: { name: string } } & T;
export type PokemonApi = {
	name: string;
	types: { slot: number; type: { name: string } }[];
};
export type EspecieApi = {
	id: number;
	capture_rate: number;
	names: Con<{ name: string }>[];
	flavor_text_entries: Con<{ flavor_text: string }>[];
	egg_groups: { name: string }[];
};

export type Recorte = {
	id: string;
	dex: number;
	tipos: TipoId[];
	nombre: { es: string; en: string };
	descripcion: { es: string; en: string };
	gruposHuevo: string[];
	tasaCaptura: number;
};

const limpiar = (t: string) => t.replace(/\s+/g, " ").trim();

function porIdioma<T extends { language: { name: string } }>(
	lista: T[],
	idioma: string,
	campo: string,
	id: string,
): T {
	// Se elige la última entrada del idioma (la de la versión más reciente).
	const elegida = lista.filter((e) => e.language.name === idioma).at(-1);
	if (!elegida) throw new Error(`${id}: falta ${campo} en "${idioma}"`);
	return elegida;
}

export function recortar(pokemon: PokemonApi, especie: EspecieApi): Recorte {
	const id = pokemon.name;
	const nombre = (l: string) =>
		limpiar(porIdioma(especie.names, l, "nombre", id).name);
	const texto = (l: string) =>
		limpiar(
			porIdioma(especie.flavor_text_entries, l, "descripción", id).flavor_text,
		);
	return {
		id,
		dex: especie.id,
		tipos: [...pokemon.types]
			.sort((a, b) => a.slot - b.slot)
			.map((t) => t.type.name as TipoId),
		nombre: { es: nombre("es"), en: nombre("en") },
		descripcion: { es: texto("es"), en: texto("en") },
		gruposHuevo: especie.egg_groups.map((g) => g.name),
		tasaCaptura: especie.capture_rate,
	};
}
