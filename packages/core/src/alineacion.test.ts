import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	alineacionAutomatica,
	conscientes,
	necesitaElegir,
	TAMANO_ALINEACION,
	validarAlineacion,
} from "./alineacion.js";

describe("conscientes", () => {
	it("[100,0,50,0,30,80] = [0,2,4,5]", () => {
		expect(conscientes([100, 0, 50, 0, 30, 80])).toEqual([0, 2, 4, 5]);
	});
	it("vacio si todos debilitados", () => {
		expect(conscientes([0, 0, 0])).toEqual([]);
	});
});

describe("necesitaElegir", () => {
	it("verdadero con 4 conscientes", () => {
		expect(necesitaElegir([100, 0, 50, 30, 80])).toBe(true);
	});
	it("falso con 3 y con 1", () => {
		expect(necesitaElegir([100, 50, 30, 0])).toBe(false);
		expect(necesitaElegir([100, 0, 0])).toBe(false);
	});
});

describe("alineacionAutomatica", () => {
	it("[100,0,50,0,30,80] = [0,2,4]", () => {
		expect(alineacionAutomatica([100, 0, 50, 0, 30, 80])).toEqual([0, 2, 4]);
	});
	it("con 2 conscientes devuelve esos 2", () => {
		expect(alineacionAutomatica([0, 50, 0, 30])).toEqual([1, 3]);
	});
	it("con 6 conscientes los 3 primeros", () => {
		expect(alineacionAutomatica([10, 20, 30, 40, 50, 60])).toEqual([0, 1, 2]);
	});
	it("nunca devuelve un debilitado ni más de 3", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 100 }), {
					minLength: 1,
					maxLength: 6,
				}),
				(psPct) => {
					const a = alineacionAutomatica(psPct);
					expect(a.length).toBeLessThanOrEqual(TAMANO_ALINEACION);
					for (const i of a) {
						expect(psPct[i]).toBeGreaterThan(0);
					}
					return true;
				},
			),
			{ numRuns: 100 },
		);
	});
});

describe("validarAlineacion", () => {
	it("acepta [5,0,2] en ese orden con 4 o más conscientes", () => {
		expect(validarAlineacion([100, 50, 30, 80], [0, 2, 3])).toEqual([0, 2, 3]);
	});
	it("rechaza 2 elegidos habiendo 4 conscientes", () => {
		expect(() => validarAlineacion([100, 50, 30, 80], [0, 2])).toThrow(
			RangeError,
		);
	});
	it("rechaza 4 elegidos", () => {
		expect(() => validarAlineacion([100, 50, 30, 80], [0, 1, 2, 3])).toThrow(
			RangeError,
		);
	});
	it("rechaza repetidos", () => {
		expect(() => validarAlineacion([100, 50, 30, 80], [0, 0, 1])).toThrow(
			RangeError,
		);
	});
	it("rechaza fuera de rango (-1, 6, 1.5)", () => {
		for (const malo of [-1, 6, 1.5]) {
			expect(() =>
				validarAlineacion([100, 50, 30, 80], [0, 1, malo as number]),
			).toThrow(RangeError);
		}
	});
	it("rechaza un debilitado", () => {
		expect(() => validarAlineacion([100, 0, 50], [0, 1])).toThrow(RangeError);
	});
	it("con 2 conscientes rechaza elegir solo 1", () => {
		expect(() => validarAlineacion([100, 50, 0], [0])).toThrow(RangeError);
	});
	it("con 2 conscientes acepta ambos en cualquier orden", () => {
		expect(validarAlineacion([100, 50, 0], [1, 0])).toEqual([1, 0]);
	});
	it("sin conscientes lanza", () => {
		expect(() => validarAlineacion([0, 0, 0], [0])).toThrow(RangeError);
	});
	it("el resultado es una copia (no la misma referencia)", () => {
		const elegidos = [0, 2, 3];
		const r = validarAlineacion([100, 0, 50, 80], elegidos);
		expect(r).toEqual(elegidos);
		expect(r).not.toBe(elegidos);
	});
	it("valida psPct: lista vacía y fuera de 0..100 lanzan", () => {
		expect(() => validarAlineacion([], [0])).toThrow(RangeError);
		expect(() => validarAlineacion([101], [0])).toThrow(RangeError);
		expect(() => validarAlineacion([-5], [0])).toThrow(RangeError);
	});
	it("propiedad fast-check: alineacionAutomatica siempre válida", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 100 }), {
					minLength: 1,
					maxLength: 6,
				}),
				(psPct) => {
					const cs = conscientes(psPct);
					if (cs.length === 0) {
						expect(() => validarAlineacion(psPct, [])).toThrow(RangeError);
						return true;
					}
					const a = alineacionAutomatica(psPct);
					expect(() => validarAlineacion(psPct, a)).not.toThrow();
					expect(a.length).toBeLessThanOrEqual(TAMANO_ALINEACION);
					for (const i of a) {
						expect(psPct[i]).toBeGreaterThan(0);
					}
					return true;
				},
			),
			{ numRuns: 100 },
		);
	});
	it("no muta las entradas congeladas", () => {
		const psPct = Object.freeze([100, 0, 50, 80]);
		const elegidos = Object.freeze([0, 2, 3]);
		expect(() => validarAlineacion(psPct, elegidos)).not.toThrow();
		expect(psPct).toEqual([100, 0, 50, 80]);
		expect(elegidos).toEqual([0, 2, 3]);
	});
});
