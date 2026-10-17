import {
	type Movimiento,
	MovimientoSchema,
	type SetCombate,
	type TipoId,
} from "@santuario/data";
import { gen9 } from "./unir.js";

// Solo lo que usamos de la respuesta de PokeAPI `move/{slug}`.
export type MovimientoApi = {
	name: string;
	type: { name: string };
	damage_class: { name: string };
	power: number | null;
	accuracy: number | null;
	pp: number;
	names: { language: { name: string }; name: string }[];
};

const CATEGORIAS = {
	physical: "fisico",
	special: "especial",
	status: "estado",
} as const;

export function recortarMovimiento(api: MovimientoApi): Movimiento {
	const id = api.name;
	const nombre = (idioma: string) => {
		// Se elige la última entrada del idioma, como en las especies.
		const n = api.names.filter((e) => e.language.name === idioma).at(-1);
		if (!n) throw new Error(`${id}: falta nombre en "${idioma}"`);
		return n.name.replace(/\s+/g, " ").trim();
	};
	const categoria =
		CATEGORIAS[api.damage_class.name as keyof typeof CATEGORIAS];
	if (!categoria)
		throw new Error(`${id}: categoría desconocida ${api.damage_class.name}`);
	return {
		id,
		nombre: { es: nombre("es"), en: nombre("en") },
		tipo: api.type.name as TipoId,
		categoria,
		potencia: api.power,
		precision: api.accuracy,
		pp: api.pp,
	};
}

// Une con @pkmn/data. El tipo debe coincidir (si no, falla); en lo numérico y en
// la categoría manda @pkmn/data, que es lo que usa el simulador de combate.
export function unirMovimiento(recorte: Movimiento): Movimiento {
	const { id } = recorte;
	const pkmn = gen9.moves.get(id);
	if (!pkmn?.exists) throw new Error(`${id}: no existe en @pkmn/data`);
	const tipo = pkmn.type.toLowerCase();
	if (tipo !== recorte.tipo)
		throw new Error(
			`${id}: tipo distinto (PokeAPI ${recorte.tipo}, @pkmn/data ${tipo})`,
		);
	return MovimientoSchema.parse({
		...recorte,
		categoria:
			CATEGORIAS[pkmn.category.toLowerCase() as keyof typeof CATEGORIAS],
		potencia: pkmn.basePower > 0 ? pkmn.basePower : null,
		precision: pkmn.accuracy === true ? null : pkmn.accuracy,
		pp: pkmn.pp,
	});
}

const aSlug = (nombre: string) =>
	nombre
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

// Errores de legalidad de los sets contra los datos del pack y @pkmn/data.
export async function erroresDeSets(
	sets: SetCombate[],
	ctx: { movimientos: Movimiento[]; especies: string[] },
): Promise<string[]> {
	const errores: string[] = [];
	const ids = new Set(ctx.movimientos.map((m) => m.id));
	const vistas = new Set<string>();
	for (const s of sets) {
		if (vistas.has(s.especie))
			errores.push(`set de ${s.especie}: especie con más de un set`);
		vistas.add(s.especie);
		const daño = s.movimientos.some((id) => {
			const m = ctx.movimientos.find((x) => x.id === id);
			return m && m.categoria !== "estado" && (m.potencia ?? 0) > 0;
		});
		if (!daño)
			errores.push(`set de ${s.especie}: sin ningún movimiento dañino`);
		const especie = gen9.species.get(s.especie);
		if (!ctx.especies.includes(s.especie))
			errores.push(`set de ${s.especie}: la especie no está en especies.json`);
		if (!especie?.exists) {
			errores.push(`set de ${s.especie}: la especie no existe en @pkmn/data`);
			continue;
		}
		const habilidades = Object.values(especie.abilities).map(aSlug);
		if (!habilidades.includes(s.habilidad))
			errores.push(
				`set de ${s.especie}: habilidad ${s.habilidad} no válida para la especie`,
			);
		for (const m of s.movimientos) {
			if (!ids.has(m))
				errores.push(`set de ${s.especie}: ${m} no está en movimientos.json`);
			if (!gen9.moves.get(m)?.exists)
				errores.push(`set de ${s.especie}: ${m} no existe en @pkmn/data`);
			else if (!(await gen9.learnsets.canLearn(s.especie, m)))
				errores.push(
					`set de ${s.especie}: ${s.especie} no puede aprender ${m}`,
				);
		}
	}
	for (const e of ctx.especies)
		if (!vistas.has(e)) errores.push(`${e}: la especie no tiene set`);
	return errores;
}
