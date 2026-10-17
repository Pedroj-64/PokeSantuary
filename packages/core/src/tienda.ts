import { crearRng, type Rng } from "./rng.js";

/** Artículo a la venta; `precio` es el precio base, sin el recargo del piso. */
export interface Articulo {
	id: string;
	tipo: "baya" | "mt" | "objeto" | "ball";
	precio: number;
}

/** Cuántos artículos trae la tienda antes del extra de las runas. */
const ARTICULOS_BASE = 4;

/** Recargo de precio por piso. */
const RECARGO_POR_PISO = 0.25;

/** Valida el número de piso. */
function validarPiso(piso: number, quien: string): void {
	if (piso !== 1 && piso !== 2 && piso !== 3) {
		throw new RangeError(
			`${quien}(): 'piso' debe ser 1, 2 o 3 (recibido ${String(piso)})`,
		);
	}
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

/**
 * Precio de un artículo en un piso: el base más un 25 % por cada piso de más,
 * redondeado al entero más cercano.
 *
 * @throws {RangeError} Si el piso no es 1, 2 o 3 o si el precio no es un número.
 */
export function precioEnPiso(base: number, piso: 1 | 2 | 3): number {
	validarPiso(piso, "precioEnPiso");
	if (!Number.isFinite(base)) {
		throw new RangeError(
			`precioEnPiso(): el precio base debe ser un número (recibido ${String(base)})`,
		);
	}
	return Math.round(base * (1 + RECARGO_POR_PISO * (piso - 1)));
}

/**
 * Oferta de la tienda: 4 artículos más `extra`, todos distintos y con los
 * precios ya ajustados al piso. Garantiza al menos una "ball" si el catálogo
 * tiene alguna; con un catálogo más pequeño devuelve el catálogo entero.
 *
 * Es determinista (`crearRng(\`${semilla}:tienda:p${piso}:${nodoId}\`)`) y no
 * toca el catálogo.
 *
 * @throws {RangeError} Si `extra` no es un entero mayor o igual que 0, si el
 * catálogo no es un arreglo o si el piso no es 1, 2 o 3.
 */
export function ofertaTienda(
	semilla: string,
	piso: 1 | 2 | 3,
	nodoId: string,
	catalogo: readonly Articulo[],
	extra: number,
): Articulo[] {
	validarPiso(piso, "ofertaTienda");
	if (!Number.isInteger(extra) || extra < 0) {
		throw new RangeError(
			`ofertaTienda(): 'extra' debe ser un entero mayor o igual que 0 (recibido ${String(extra)})`,
		);
	}
	if (!Array.isArray(catalogo)) {
		throw new RangeError(
			"ofertaTienda(): se esperaba un catálogo de artículos",
		);
	}

	const vistos = new Set<string>();
	const unicos: Articulo[] = [];
	for (const articulo of catalogo) {
		if (vistos.has(articulo.id)) continue;
		vistos.add(articulo.id);
		unicos.push({ ...articulo, precio: precioEnPiso(articulo.precio, piso) });
	}

	const cuantos = Math.min(ARTICULOS_BASE + extra, unicos.length);
	// Si cabe todo el catálogo se devuelve tal cual, sin barajar.
	if (cuantos >= unicos.length) return unicos;

	const rng = crearRng(`${semilla}:tienda:p${piso}:${nodoId}`);
	const barajados = barajar(rng, unicos);
	const oferta = barajados.slice(0, cuantos);
	if (oferta.every((articulo) => articulo.tipo !== "ball")) {
		const ball = barajados.find((articulo) => articulo.tipo === "ball");
		if (ball !== undefined) oferta[oferta.length - 1] = ball;
	}
	return oferta;
}

/**
 * Compra un artículo al precio del piso indicado.
 *
 * @returns El dinero que queda.
 * @throws {RangeError} Si el dinero no llega, si no es un número mayor o igual
 * que 0 o si el artículo o el piso son inválidos.
 */
export function comprar(
	dinero: number,
	articulo: Articulo,
	piso: 1 | 2 | 3,
): { dinero: number } {
	validarPiso(piso, "comprar");
	if (!Number.isFinite(dinero) || dinero < 0) {
		throw new RangeError(
			`comprar(): el dinero debe ser un número mayor o igual que 0 (recibido ${String(dinero)})`,
		);
	}
	if (
		articulo === null ||
		typeof articulo !== "object" ||
		!Number.isFinite(articulo.precio)
	) {
		throw new RangeError("comprar(): se esperaba un artículo con precio");
	}
	const precio = precioEnPiso(articulo.precio, piso);
	if (dinero < precio) {
		throw new RangeError(
			`comprar(${articulo.id}): faltan ${precio - dinero} monedas para pagar ${precio}`,
		);
	}
	return { dinero: dinero - precio };
}
