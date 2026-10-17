import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import {
	type Especie,
	EspecieSchema,
	type TrabajosPorTipo,
} from "@santuario/data";
import type { Recorte } from "./recortar.js";

// Sin filtro de existencia: Machop y otras no están en la lista estándar de gen 9.
export const gen9 = new Generations(Dex, () => true).get(9);
export const especiesPkmn = gen9.species;

export function unir(
	recorte: Recorte,
	trabajosPorTipo: TrabajosPorTipo,
): Especie {
	const { id } = recorte;
	const pkmn = especiesPkmn.get(id);
	if (!pkmn?.exists) throw new Error(`${id}: no existe en @pkmn/data`);
	const tiposPkmn = pkmn.types.map((t) => t.toLowerCase());
	if (tiposPkmn.join() !== recorte.tipos.join())
		throw new Error(
			`${id}: tipos distintos (PokeAPI ${recorte.tipos.join("/")}, @pkmn/data ${tiposPkmn.join("/")})`,
		);
	if (pkmn.num !== recorte.dex)
		throw new Error(
			`${id}: dex distinto (PokeAPI ${recorte.dex}, @pkmn/data ${pkmn.num})`,
		);
	const trabajos = [
		...new Set(recorte.tipos.flatMap((t) => trabajosPorTipo[t])),
	];
	return EspecieSchema.parse({ ...recorte, trabajos });
}
