import { gen9 } from "./unir.js";

/** Movimiento que una especie aprende al alcanzar un nivel. */
export interface AprendizajeNivel {
	nivel: number;
	movimiento: string;
}

// Fuente de aprendizaje por nivel: "9L4" (generación, "L", nivel).
const FUENTE_NIVEL = /^(\d+)L(\d+)$/;

// El juego no pasa del nivel 50 (GDD §7.2).
const NIVEL_MAXIMO = 50;

// Normaliza el nombre del movimiento al slug del repo, igual que en
// movimientos.ts (que no lo exporta; aquí no se puede tocar ese archivo).
const aSlug = (nombre: string) =>
	nombre
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

const porNivel = (a: AprendizajeNivel, b: AprendizajeNivel) =>
	a.nivel - b.nivel || (a.movimiento < b.movimiento ? -1 : 1);

// Lista de movimientos por nivel de una especie. Usa solo la generación más
// reciente (sin pasar de la 9) con entradas de nivel, para no colar movimientos
// que el juego moderno ya eliminó.
export async function aprendizajePorNivel(
	especie: string,
): Promise<AprendizajeNivel[]> {
	const datos = await gen9.learnsets.get(especie);
	const learnset = datos?.learnset;
	if (!datos?.exists || !learnset)
		throw new Error(`${especie}: sin datos de aprendizaje en @pkmn/data`);

	const porGeneracion = new Map<number, Map<string, number>>();
	for (const [idMovimiento, fuentes] of Object.entries(learnset)) {
		for (const fuente of fuentes) {
			const coincide = FUENTE_NIVEL.exec(fuente);
			if (!coincide) continue;
			const generacion = Number(coincide[1]);
			const nivel = Number(coincide[2]);
			if (generacion > 9) continue;
			const movimientos = porGeneracion.get(generacion) ?? new Map();
			const previo = movimientos.get(idMovimiento);
			if (previo === undefined || nivel < previo)
				movimientos.set(idMovimiento, nivel);
			porGeneracion.set(generacion, movimientos);
		}
	}
	if (porGeneracion.size === 0)
		throw new Error(`${especie}: sin movimientos por nivel en @pkmn/data`);

	const generacionMax = Math.max(...porGeneracion.keys());
	const entradas: AprendizajeNivel[] = [];
	for (const [idMovimiento, nivel] of porGeneracion.get(generacionMax) ?? []) {
		if (nivel > NIVEL_MAXIMO) continue;
		const movimiento = gen9.moves.get(idMovimiento);
		if (!movimiento?.exists)
			throw new Error(
				`${especie}: el movimiento ${idMovimiento} no existe en @pkmn/data`,
			);
		const slug = aSlug(movimiento.name);
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
			throw new Error(
				`${especie}: el movimiento ${idMovimiento} no da un slug válido`,
			);
		entradas.push({ nivel, movimiento: slug });
	}
	if (entradas.length === 0)
		throw new Error(
			`${especie}: sin movimientos por nivel hasta el nivel ${NIVEL_MAXIMO}`,
		);
	entradas.sort(porNivel);
	return entradas;
}
