import type { Aprendizaje, Movimiento, SetCombate } from "@santuario/data";
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

/** Resultado de completar las listas de aprendizaje con un ataque mínimo. */
export interface ResultadoAtaqueMinimo {
	/** Listas nuevas; las de la entrada no se reutilizan ni se mutan. */
	aprendizaje: Aprendizaje;
	/** Especies a las que se añadió un ataque de nivel 1, ordenadas. */
	cambiadas: string[];
	/** Especies sin ataque en su lista y sin ataque disponible en su set. */
	avisos: string[];
}

/**
 * Garantiza que cada especie con una lista de aprendizaje sin ningún movimiento
 * con potencia reciba a nivel 1 el primer ataque de su set de combate. Si el
 * set tampoco tiene ataques, la especie se deja igual y se avisa en el
 * resultado. El ataque se inserta respetando el orden del esquema (nivel y
 * movimiento) y nunca se duplica.
 *
 * No muta `aprendizaje`, `sets` ni `movimientos`.
 */
export function conAtaqueMinimo(
	aprendizaje: Aprendizaje,
	sets: readonly SetCombate[],
	movimientos: readonly Movimiento[],
): ResultadoAtaqueMinimo {
	const potencia = new Map(
		movimientos.map((movimiento) => [movimiento.id, movimiento.potencia ?? 0]),
	);
	const setPorEspecie = new Map<string, SetCombate>();
	for (const set of sets) {
		if (!setPorEspecie.has(set.especie)) setPorEspecie.set(set.especie, set);
	}

	const resultado: Aprendizaje = {};
	const cambiadas: string[] = [];
	const avisos: string[] = [];
	for (const especie of Object.keys(aprendizaje).sort()) {
		const lista = aprendizaje[especie] ?? [];
		const tieneAtaque = lista.some(
			(entrada) => (potencia.get(entrada.movimiento) ?? 0) > 0,
		);
		if (tieneAtaque) {
			resultado[especie] = [...lista];
			continue;
		}

		const set = setPorEspecie.get(especie);
		const ataque = set?.movimientos.find(
			(movimiento) =>
				(potencia.get(movimiento) ?? 0) > 0 &&
				!lista.some((entrada) => entrada.movimiento === movimiento),
		);
		if (ataque === undefined) {
			resultado[especie] = [...lista];
			avisos.push(
				`${especie}: sin ningún ataque disponible en su set de combate`,
			);
			continue;
		}

		resultado[especie] = [...lista, { nivel: 1, movimiento: ataque }].sort(
			porNivel,
		);
		cambiadas.push(especie);
	}
	return { aprendizaje: resultado, cambiadas, avisos };
}
