import type { EstadoExpedicion, MiembroExp } from "./expedicion.js";

const MAX_EQUIPO = 6;

/** ¿Hay sitio en el equipo? */
export function equipoLleno(e: EstadoExpedicion): boolean {
	return e.equipo.length >= MAX_EQUIPO;
}

/** Valida que se pueda capturar aquí y devuelve el miembro nuevo. */
function nuevoMiembro(
	e: EstadoExpedicion,
	especie: string,
	psPct: number,
	quien: string,
): MiembroExp {
	if (e.estado !== "en-curso") {
		throw new RangeError(`${quien}(): la expedición ya terminó (${e.estado})`);
	}
	const nodo = e.mapa.capas.flat().find((n) => n.id === e.actual);
	if (nodo === undefined || nodo.tipo !== "salvaje") {
		throw new RangeError(
			`${quien}(): solo se captura en un encuentro salvaje (nodo ${e.actual ?? "ninguno"})`,
		);
	}
	if (!Number.isFinite(psPct)) {
		throw new RangeError(
			`${quien}(): 'psPct' debe ser un número (recibido ${String(psPct)})`,
		);
	}
	return {
		especie,
		// Un capturado nunca entra debilitado ni por encima de su salud máxima.
		psPct: Math.min(100, Math.max(1, Math.round(psPct))),
	};
}

/**
 * Añade al equipo el Pokémon salvaje capturado, con los PS que le quedaban.
 *
 * @throws {RangeError} Si el nodo actual no es un encuentro salvaje, si el
 * equipo ya tiene 6 (usa {@link sustituirMiembro}) o si `psPct` no es un número.
 */
export function capturar(
	e: EstadoExpedicion,
	especie: string,
	psPct: number,
): EstadoExpedicion {
	const miembro = nuevoMiembro(e, especie, psPct, "capturar");
	if (equipoLleno(e)) {
		throw new RangeError(
			`capturar(${especie}): el equipo está lleno; hay que soltar a alguien`,
		);
	}
	return { ...e, equipo: [...e.equipo, miembro] };
}

/**
 * Captura con el equipo lleno: el capturado ocupa el sitio de `indice`, que se
 * suelta.
 *
 * @throws {RangeError} Igual que {@link capturar}, y si `indice` no es un
 * miembro del equipo o si el equipo aún tiene hueco.
 */
export function sustituirMiembro(
	e: EstadoExpedicion,
	indice: number,
	especie: string,
	psPct: number,
): EstadoExpedicion {
	const miembro = nuevoMiembro(e, especie, psPct, "sustituirMiembro");
	if (!equipoLleno(e)) {
		throw new RangeError("sustituirMiembro(): aún hay hueco; usa capturar()");
	}
	if (!Number.isInteger(indice) || e.equipo[indice] === undefined) {
		throw new RangeError(
			`sustituirMiembro(): no hay miembro en la posición ${String(indice)}`,
		);
	}
	return { ...e, equipo: e.equipo.map((m, i) => (i === indice ? miembro : m)) };
}
