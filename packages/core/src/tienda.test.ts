import { describe, expect, it } from "vitest";
import {
	type Articulo,
	comprar,
	ofertaTienda,
	precioEnPiso,
} from "./tienda.js";

const CATALOGO: readonly Articulo[] = [
	{ id: "pocion", tipo: "baya", precio: 200 },
	{ id: "superball", tipo: "ball", precio: 600 },
	{ id: "mt01", tipo: "mt", precio: 1000 },
	{ id: "cuerda", tipo: "objeto", precio: 300 },
	{ id: "ball", tipo: "ball", precio: 200 },
	{ id: "antidoto", tipo: "objeto", precio: 100 },
	{ id: "mt02", tipo: "mt", precio: 1500 },
	{ id: "revivir", tipo: "objeto", precio: 333 },
	{ id: "baya2", tipo: "baya", precio: 250 },
];
const ids = (oferta: Articulo[]): string[] => oferta.map((a) => a.id);

/** JSON canónico congelado de `ofertaTienda("dorada", 2, "3-1", CATALOGO, 1)`. */
const OFERTA_DORADA = `["mt02","revivir","mt01","pocion","ball"]`;

/** Congela en profundidad para detectar mutaciones. */
function congelar<T>(valor: T): T {
	if (valor === null || typeof valor !== "object") return valor;
	Object.freeze(valor);
	for (const hijo of Object.values(valor as Record<string, unknown>)) {
		congelar(hijo);
	}
	return valor;
}

describe("precioEnPiso", () => {
	it("sube un 25 % por piso, redondeado", () => {
		expect(precioEnPiso(200, 1)).toBe(200);
		expect(precioEnPiso(200, 2)).toBe(250);
		expect(precioEnPiso(200, 3)).toBe(300);
		expect(precioEnPiso(333, 1)).toBe(333);
		expect(precioEnPiso(333, 2)).toBe(416);
		expect(precioEnPiso(333, 3)).toBe(500);
		expect(precioEnPiso(0, 3)).toBe(0);
	});

	it("rechaza un piso fuera de 1..3", () => {
		expect(() => precioEnPiso(100, 0 as 1)).toThrow(RangeError);
		expect(() => precioEnPiso(100, 4 as 1)).toThrow(RangeError);
		expect(() => precioEnPiso(Number.NaN, 1)).toThrow(RangeError);
	});
});

describe("ofertaTienda", () => {
	it("ofrece 4 artículos más el extra", () => {
		const base = ofertaTienda("s1", 1, "2-0", CATALOGO, 0);
		expect(base).toHaveLength(4);
		expect(new Set(ids(base)).size).toBe(4);
		expect(ofertaTienda("s1", 1, "2-0", CATALOGO, 2)).toHaveLength(6);
		expect(ofertaTienda("s1", 1, "2-0", CATALOGO, 5)).toHaveLength(9);
	});

	it("con catálogo pequeño devuelve todo el catálogo", () => {
		expect(ids(ofertaTienda("s1", 1, "2-0", CATALOGO.slice(0, 3), 0))).toEqual(
			ids(CATALOGO.slice(0, 3)),
		);
		expect(ids(ofertaTienda("s1", 3, "4-1", CATALOGO.slice(0, 4), 10))).toEqual(
			ids(CATALOGO.slice(0, 4)),
		);
		expect(ofertaTienda("s1", 1, "2-0", [], 0)).toEqual([]);
	});

	it("no repite artículos aunque el catálogo traiga ids repetidos", () => {
		const repetido = [...CATALOGO.slice(0, 4), CATALOGO[0] as Articulo];
		const oferta = ofertaTienda("rep", 1, "2-0", repetido, 0);
		expect(oferta).toHaveLength(4);
		expect(new Set(ids(oferta)).size).toBe(4);
	});

	it("siempre incluye al menos una ball cuando el catálogo tiene alguna", () => {
		for (let i = 0; i < 200; i++) {
			const oferta = ofertaTienda(
				`o${i}`,
				((i % 3) + 1) as 1 | 2 | 3,
				`${i % 5}-${i % 3}`,
				CATALOGO,
				0,
			);
			expect(oferta).toHaveLength(4);
			expect(oferta.some((a) => a.tipo === "ball")).toBe(true);
			expect(new Set(ids(oferta)).size).toBe(4);
		}
	});

	it("trae los precios del piso y no toca el catálogo", () => {
		const congelado = congelar(CATALOGO.map((a) => ({ ...a })));
		const antes = JSON.stringify(congelado);
		for (const piso of [1, 2, 3] as const) {
			const oferta = ofertaTienda("p", piso, "3-1", congelado, 1);
			expect(oferta).toHaveLength(5);
			for (const articulo of oferta) {
				const original = congelado.find((a) => a.id === articulo.id);
				expect(articulo.precio).toBe(precioEnPiso(original?.precio ?? 0, piso));
				expect(articulo).not.toBe(original);
			}
		}
		expect(JSON.stringify(congelado)).toBe(antes);
	});

	it("es determinista y cambia con semilla, piso y nodo", () => {
		expect(JSON.stringify(ofertaTienda("d", 2, "3-1", CATALOGO, 0))).toBe(
			JSON.stringify(ofertaTienda("d", 2, "3-1", CATALOGO, 0)),
		);
		const firmas = new Set(
			[
				["d", 1, "2-0"],
				["d", 2, "2-0"],
				["d", 3, "2-0"],
				["d", 1, "3-1"],
				["otra", 1, "2-0"],
			].map(([semilla, piso, nodo]) =>
				JSON.stringify(
					ofertaTienda(
						semilla as string,
						piso as 1 | 2 | 3,
						nodo as string,
						CATALOGO,
						0,
					),
				),
			),
		);
		expect(firmas.size).toBeGreaterThan(1);
	});

	it("repetición congelada: la oferta de 'dorada' no cambia", () => {
		expect(
			JSON.stringify(ids(ofertaTienda("dorada", 2, "3-1", CATALOGO, 1))),
		).toBe(OFERTA_DORADA);
	});

	it("rechaza un extra que no sea entero mayor o igual que 0", () => {
		expect(() => ofertaTienda("s", 1, "2-0", CATALOGO, -1)).toThrow(RangeError);
		expect(() => ofertaTienda("s", 1, "2-0", CATALOGO, 1.5)).toThrow(
			RangeError,
		);
		expect(() => ofertaTienda("s", 4 as 1, "2-0", CATALOGO, 0)).toThrow(
			RangeError,
		);
	});
});

describe("comprar", () => {
	it("cobra el precio del piso y devuelve el dinero restante", () => {
		const pocion = CATALOGO[0] as Articulo;
		expect(comprar(1000, pocion, 1)).toEqual({ dinero: 800 });
		expect(comprar(1000, pocion, 2)).toEqual({ dinero: 750 });
		expect(comprar(1000, pocion, 3)).toEqual({ dinero: 700 });
		expect(comprar(200, pocion, 1)).toEqual({ dinero: 0 });
	});

	it("rechaza la compra si no llega el dinero", () => {
		const caro = CATALOGO[6] as Articulo;
		expect(() => comprar(1499, caro, 1)).toThrow(RangeError);
		expect(() => comprar(1500, caro, 2)).toThrow(RangeError);
		expect(comprar(1500, caro, 1)).toEqual({ dinero: 0 });
		expect(() => comprar(-1, caro, 1)).toThrow(RangeError);
	});

	it("rechaza argumentos inválidos", () => {
		const pocion = CATALOGO[0] as Articulo;
		expect(() => comprar(Number.NaN, pocion, 1)).toThrow(RangeError);
		expect(() => comprar(100, pocion, 0 as 1)).toThrow(RangeError);
		expect(() => comprar(100, null as unknown as Articulo, 1)).toThrow(
			RangeError,
		);
	});

	it("no muta el artículo", () => {
		const pocion = congelar({ ...(CATALOGO[0] as Articulo) });
		expect(comprar(500, pocion, 2)).toEqual({ dinero: 250 });
		expect(pocion.precio).toBe(200);
	});
});
