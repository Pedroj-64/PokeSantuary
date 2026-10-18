import type { MiembroEquipo } from "@santuario/battle";
import {
	crearRng,
	esNodoDeCombate,
	type Rng,
	type TipoNodo,
} from "@santuario/core";
import type { SetCombate } from "@santuario/data";

/** Especie repetida en el catálogo: se queda la primera aparición. */
function sinDuplicados(sets: readonly SetCombate[]): SetCombate[] {
	const vistos = new Set<string>();
	const unicos: SetCombate[] = [];
	for (const set of sets) {
		if (vistos.has(set.especie)) continue;
		vistos.add(set.especie);
		unicos.push(set);
	}
	return unicos;
}

/** Copia barajada (Fisher-Yates con el rng); no toca el arreglo original. */
function barajar<T>(rng: Rng, items: readonly T[]): T[] {
	const copia = [...items];
	for (let i = copia.length - 1; i > 0; i--) {
		const j = rng.entero(0, i);
		[copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
	}
	return copia;
}

/** Cuántos rivales trae cada tipo de nodo; el salvaje del piso 3 sortea 1 o 2. */
function tamanoRival(rng: Rng, tipo: TipoNodo, piso: 1 | 2 | 3): number {
	switch (tipo) {
		case "salvaje":
			return piso === 3 ? rng.entero(1, 2) : 1;
		case "entrenador":
		case "jefe":
			return 3;
		default:
			return 1;
	}
}

/**
 * Elige el equipo rival de un nodo de combate, de forma pura y determinista:
 * el rng sale de `${semilla}:p${piso}:${nodo.id}`.
 *
 * Evita repetir especie, prefiere las que no estén en `excluir` (el equipo del
 * jugador) y solo recurre a las excluidas cuando no quedan otras. Si el catálogo
 * tiene menos sets que el tamaño pedido, devuelve los que haya.
 *
 * @param semilla Semilla de la expedición.
 * @param piso Piso de la expedición, 1 a 3.
 * @param nodo Nodo del mapa que se visita (id y tipo).
 * @param sets Catálogo de sets disponibles; no se muta.
 * @param excluir Especies del equipo del jugador que se prefieren evitar.
 * @throws {RangeError} Si el tipo no es de combate, si el piso no es 1 a 3 o si
 * el catálogo está vacío.
 */
export function crearRival(
	semilla: string,
	piso: 1 | 2 | 3,
	nodo: { id: string; tipo: TipoNodo },
	sets: readonly SetCombate[],
	excluir: readonly string[],
): MiembroEquipo[] {
	if (piso !== 1 && piso !== 2 && piso !== 3) {
		throw new RangeError(
			`crearRival(): 'piso' debe ser 1, 2 o 3 (recibido ${String(piso)})`,
		);
	}
	if (!esNodoDeCombate(nodo.tipo)) {
		throw new RangeError(
			`crearRival(): el nodo ${nodo.id} es '${nodo.tipo}' y no admite combate`,
		);
	}
	if (!Array.isArray(sets) || sets.length === 0) {
		throw new RangeError(
			`crearRival(): no hay sets disponibles para el nodo ${nodo.id}`,
		);
	}

	const rng = crearRng(`${semilla}:p${piso}:${nodo.id}`);
	const tamano = tamanoRival(rng, nodo.tipo, piso);
	const catalogo = sinDuplicados(sets);
	const preferidas = barajar(
		rng,
		catalogo.filter((set) => !excluir.includes(set.especie)),
	);
	const excluidas = barajar(
		rng,
		catalogo.filter((set) => excluir.includes(set.especie)),
	);

	return [...preferidas, ...excluidas]
		.slice(0, tamano)
		.map((set) => ({ especie: set.especie, set }));
}
