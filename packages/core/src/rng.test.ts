import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crearRng } from "./rng.js";

const tomar = (semilla: string | number, n: number) => {
	const rng = crearRng(semilla);
	return Array.from({ length: n }, () => rng.siguiente());
};

describe("crearRng", () => {
	it("la misma semilla produce las mismas 100 salidas", () => {
		expect(tomar("abc", 100)).toEqual(tomar("abc", 100));
	});

	it("semillas distintas producen secuencias distintas", () => {
		expect(tomar("a", 10)).not.toEqual(tomar("b", 10));
		expect(tomar(1, 10)).not.toEqual(tomar(2, 10));
	});

	it("siguiente() queda en [0, 1)", () => {
		for (const v of tomar("rango", 1000)) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("reanuda la secuencia exacta desde estado()", () => {
		const rng = crearRng("x");
		for (let i = 0; i < 7; i++) rng.siguiente();
		const reanudado = crearRng("x", rng.estado());
		for (let i = 0; i < 20; i++)
			expect(reanudado.siguiente()).toBe(rng.siguiente());
	});

	it("semillas '' y 'ñandú' son estables entre ejecuciones", () => {
		expect(tomar("", 3)).toEqual(VACIA);
		expect(tomar("ñandú", 3)).toEqual(ENIE);
	});

	it("entero(3, 7) siempre cae en [3, 7]", () => {
		fc.assert(
			fc.property(fc.string(), (semilla) => {
				const rng = crearRng(semilla);
				const n = rng.entero(3, 7);
				return Number.isInteger(n) && n >= 3 && n <= 7;
			}),
			{ numRuns: 1000 },
		);
	});

	it("entero(4, 4) devuelve siempre 4", () => {
		expect(crearRng("k").entero(4, 4)).toBe(4);
	});

	it("entero rechaza rangos invertidos y no enteros", () => {
		const rng = crearRng("e");
		expect(() => rng.entero(5, 2)).toThrow(RangeError);
		expect(() => rng.entero(1.5, 3)).toThrow(RangeError);
		expect(() => rng.entero(1, 3.5)).toThrow(RangeError);
	});
});

const VACIA = [0.6112444521859288, 0.4935242917854339, 0.7740248835179955];
const ENIE = [0.4679248540196568, 0.3180122375488281, 0.0011865186970680952];
