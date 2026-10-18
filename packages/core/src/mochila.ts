import type { EstadoExpedicion } from "./expedicion.js";
import { type Articulo, comprar } from "./tienda.js";

/** Cuántas unidades de cada artículo lleva la expedición, por id. */
export type Mochila = Readonly<Record<string, number>>;

/** Puntos de PS% que cura cada baya; el resto de artículos no se gasta por ahora. */
const CURA_BAYA: Readonly<Record<string, number>> = {
	"baya-aranja": 25,
	"baya-zidra": 50,
};

/** Unidades que hay de un artículo; 0 si no lleva ninguna. */
export function cuantos(e: EstadoExpedicion, id: string): number {
	return e.mochila[id] ?? 0;
}

/** Copia de la mochila con `delta` unidades más (o menos) de `id`; sin entradas a cero. */
function conCantidad(m: Mochila, id: string, delta: number): Mochila {
	const n = (m[id] ?? 0) + delta;
	const { [id]: _quitado, ...resto } = m;
	return n > 0 ? { ...resto, [id]: n } : resto;
}

/**
 * Compra una unidad de un artículo de la tienda de este piso. Recibe el
 * artículo con su precio BASE (el del catálogo): el recargo del piso lo aplica
 * `comprar`.
 *
 * @throws {RangeError} Si no alcanza el dinero o si la expedición ya terminó.
 */
export function comprarArticulo(
	e: EstadoExpedicion,
	articulo: Articulo,
): EstadoExpedicion {
	if (e.estado !== "en-curso") {
		throw new RangeError(
			`comprarArticulo(): la expedición ya terminó (${e.estado})`,
		);
	}
	const { dinero } = comprar(e.dinero, articulo, e.piso);
	return { ...e, dinero, mochila: conCantidad(e.mochila, articulo.id, 1) };
}

/**
 * Gasta una unidad de un artículo (una bola al capturar, una baya al curar).
 *
 * @throws {RangeError} Si no queda ninguna.
 */
export function gastar(e: EstadoExpedicion, id: string): EstadoExpedicion {
	if (cuantos(e, id) < 1) {
		throw new RangeError(`gastar(${id}): no queda ninguna unidad`);
	}
	return { ...e, mochila: conCantidad(e.mochila, id, -1) };
}

/**
 * Da una baya a un miembro: cura sus PS (sin pasar de 100) y gasta la baya.
 *
 * @param indice Posición del miembro en `e.equipo`; no puede estar debilitado.
 * @throws {RangeError} Si `id` no es una baya, no hay ninguna, el miembro no
 * existe o está debilitado.
 */
export function usarBaya(
	e: EstadoExpedicion,
	id: string,
	indice: number,
): EstadoExpedicion {
	const pct = CURA_BAYA[id];
	if (pct === undefined) {
		throw new RangeError(`usarBaya(): '${id}' no es una baya`);
	}
	const miembro = e.equipo[indice];
	if (miembro === undefined) {
		throw new RangeError(`usarBaya(): no hay miembro en la posición ${indice}`);
	}
	if (miembro.psPct === 0) {
		throw new RangeError("usarBaya(): una baya no revive a un debilitado");
	}
	const gastado = gastar(e, id);
	return {
		...gastado,
		equipo: gastado.equipo.map((m, i) =>
			i === indice ? { ...m, psPct: Math.min(100, m.psPct + pct) } : m,
		),
	};
}

/** Unidades de bayas que lleva la expedición, de cualquier clase. */
export function totalBayas(e: EstadoExpedicion): number {
	return Object.keys(CURA_BAYA).reduce((n, id) => n + cuantos(e, id), 0);
}

/**
 * Da la primera baya que haya (de menos a más cura) al miembro vivo con menos
 * PS, si está herido. Sin bayas o sin heridos devuelve el mismo estado.
 */
export function usarBayaAlMasHerido(e: EstadoExpedicion): EstadoExpedicion {
	const id = Object.keys(CURA_BAYA)
		.sort((a, b) => (CURA_BAYA[a] ?? 0) - (CURA_BAYA[b] ?? 0))
		.find((baya) => cuantos(e, baya) > 0);
	if (id === undefined) return e;
	let objetivo = -1;
	e.equipo.forEach((m, i) => {
		const actual = e.equipo[objetivo];
		if (m.psPct > 0 && m.psPct < 100 && (!actual || m.psPct < actual.psPct))
			objetivo = i;
	});
	return objetivo === -1 ? e : usarBaya(e, id, objetivo);
}
