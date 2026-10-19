import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type DatosCaptura, intentarCaptura, probCaptura } from "./captura.js";

const datos = (
	psPct: number,
	tasaBase: number,
	multBola: number,
): DatosCaptura => ({ psPct, tasaBase, multBola });

/** Firma congelada de los 16 primeros intentos de captura de "dorada" (1 = éxito). */
const FIRMA_DORADA = "0000110000001000";

describe("probCaptura", () => {
	it("aplica la fórmula y no pasa de 1", () => {
		// a = ((3 - 2*psPct/100) / 3) * tasaBase * multBola; resultado = min(1, a/255)
		expect(probCaptura(datos(100, 255, 1))).toBeCloseTo(85 / 255, 10);
		expect(probCaptura(datos(0, 255, 1))).toBeCloseTo(1, 10);
		expect(probCaptura(datos(50, 90, 1))).toBeCloseTo(60 / 255, 10);
		expect(probCaptura(datos(0, 0, 1))).toBe(0);
		expect(probCaptura(datos(50, 255, 2))).toBe(1);
		expect(probCaptura(datos(0, 255, 5))).toBe(1);
		expect(probCaptura(datos(0, 1, 1))).toBeCloseTo(1 / 255, 10);
	});

	it("cuantos menos PS, más probabilidad", () => {
		for (const tasaBase of [1, 45, 120, 255]) {
			const p0 = probCaptura(datos(0, tasaBase, 1));
			const p50 = probCaptura(datos(50, tasaBase, 1));
			const p100 = probCaptura(datos(100, tasaBase, 1));
			expect(p0).toBeGreaterThan(p50);
			expect(p50).toBeGreaterThan(p100);
			const p25 = probCaptura(datos(25, tasaBase, 1));
			expect(p25).toBeLessThanOrEqual(p0);
			expect(p25).toBeGreaterThanOrEqual(p50);
		}
		for (const multBola of [0.5, 1, 3]) {
			expect(probCaptura(datos(10, 100, multBola))).toBeGreaterThan(
				probCaptura(datos(10, 100, multBola / 2)),
			);
		}
	});

	it("rechaza datos fuera de rango", () => {
		for (const d of [
			datos(-1, 255, 1),
			datos(101, 255, 1),
			datos(50.5, 255, 1),
			datos(0, -1, 1),
			datos(0, 256, 1),
			datos(0, 255.5, 1),
			datos(0, 255, 0),
			datos(0, 255, -1),
			datos(Number.NaN, 255, 1),
			datos(0, Number.NaN, 1),
			datos(0, 255, Number.POSITIVE_INFINITY),
		]) {
			expect(() => probCaptura(d)).toThrow(RangeError);
		}
	});
});

describe("intentarCaptura", () => {
	it("es determinista y devuelve booleanos", () => {
		const d = datos(70, 120, 1);
		for (let intento = 0; intento < 200; intento++) {
			const uno = intentarCaptura("c1", intento, d);
			expect(typeof uno).toBe("boolean");
			expect(intentarCaptura("c1", intento, d)).toBe(uno);
		}
	});

	it("encuentra intentos de los dos tipos", () => {
		const d = datos(100, 100, 1);
		const resultados = Array.from({ length: 50 }, (_, i) =>
			intentarCaptura("variedad", i, d),
		);
		expect(resultados).toContain(true);
		expect(resultados).toContain(false);
	});

	it("la frecuencia observada se parece a la probabilidad", () => {
		const casos: Array<{ d: DatosCaptura; p: number }> = [
			{ d: datos(100, 255, 1), p: 85 / 255 },
			{ d: datos(0, 45, 1), p: 45 / 255 },
			{ d: datos(50, 90, 1), p: 60 / 255 },
		];
		for (const { d, p } of casos) {
			expect(probCaptura(d)).toBeCloseTo(p, 10);
			let exitos = 0;
			for (let intento = 0; intento < 10_000; intento++) {
				if (intentarCaptura("frecuencia", intento, d)) exitos++;
			}
			expect(Math.abs(exitos / 10_000 - p)).toBeLessThan(0.03);
		}
	});

	it("repetición congelada: los intentos de 'dorada' no cambian", () => {
		const firma = Array.from({ length: 16 }, (_, intento) =>
			intentarCaptura("dorada", intento, datos(50, 90, 1)) ? "1" : "0",
		).join("");
		expect(firma).toBe(FIRMA_DORADA);
	});

	it("rechaza datos inválidos como probCaptura", () => {
		expect(() => intentarCaptura("c", 0, datos(101, 255, 1))).toThrow(
			RangeError,
		);
		expect(() => intentarCaptura("c", -1, datos(0, 255, 1))).toThrow(
			RangeError,
		);
		expect(() => intentarCaptura("c", 1.5, datos(0, 255, 1))).toThrow(
			RangeError,
		);
	});
});

describe("probCaptura con campos opcionales", () => {
	const formulaVieja = (d: DatosCaptura): number => {
		const factor = (3 - (2 * d.psPct) / 100) / 3;
		return Math.min(1, (factor * d.tasaBase * d.multBola) / 255);
	};

	it("sin los campos opcionales da lo mismo que la fórmula vieja", () => {
		const casos: DatosCaptura[] = [
			{ psPct: 100, tasaBase: 255, multBola: 1 },
			{ psPct: 0, tasaBase: 255, multBola: 1 },
			{ psPct: 50, tasaBase: 90, multBola: 1 },
			{ psPct: 50, tasaBase: 255, multBola: 2 },
			{ psPct: 10, tasaBase: 100, multBola: 3 },
		];
		for (const d of casos) {
			expect(probCaptura(d)).toBeCloseTo(formulaVieja(d), 10);
		}
	});

	it("multEstado: 2 duplica la probabilidad antes del tope", () => {
		const base = probCaptura(datos(100, 255, 1)); // 1/3
		const doble = probCaptura({ ...datos(100, 255, 1), multEstado: 2 });
		expect(doble).toBeCloseTo(base * 2, 10);
	});

	it("multEstado: 1.5 multiplica por 1.5", () => {
		const base = probCaptura(datos(100, 255, 1));
		const con15 = probCaptura({ ...datos(100, 255, 1), multEstado: 1.5 });
		expect(con15).toBeCloseTo(base * 1.5, 10);
	});

	it("el tope sigue en 1 aunque multEstado lo supere", () => {
		expect(probCaptura({ ...datos(0, 255, 1), multEstado: 2 })).toBe(1);
		expect(probCaptura({ ...datos(0, 255, 1), multEstado: 10 })).toBe(1);
	});

	it("bonoFinal: 0.15 suma 0,15 y luego aplica el tope", () => {
		const base = probCaptura(datos(100, 255, 1)); // 1/3 ~ 0.3333
		expect(probCaptura({ ...datos(100, 255, 1), bonoFinal: 0.15 })).toBeCloseTo(
			base + 0.15,
			10,
		);
		// Caso donde sin tope pasaría de 1: se clampea a 1
		expect(probCaptura({ ...datos(0, 255, 1), bonoFinal: 0.15 })).toBe(1);
	});

	it("rechaza multEstado invalido", () => {
		for (const multEstado of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => probCaptura({ ...datos(50, 90, 1), multEstado })).toThrow(
				RangeError,
			);
		}
	});

	it("rechaza bonoFinal invalido", () => {
		for (const bonoFinal of [
			-0.01,
			1.01,
			Number.NaN,
			Number.POSITIVE_INFINITY,
		]) {
			expect(() => probCaptura({ ...datos(50, 90, 1), bonoFinal })).toThrow(
				RangeError,
			);
		}
	});

	it("acepta los extremos validos de bonoFinal (0 y 1)", () => {
		expect(() =>
			probCaptura({ ...datos(50, 90, 1), bonoFinal: 0 }),
		).not.toThrow();
		expect(() =>
			probCaptura({ ...datos(50, 90, 1), bonoFinal: 1 }),
		).not.toThrow();
	});
});

describe("probCaptura propiedades (fast-check)", () => {
	it("la probabilidad esta en [0, 1] y es monótona no decreciente en multEstado", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100 }),
				fc.integer({ min: 0, max: 255 }),
				fc
					.float({ min: Math.fround(0.1), max: Math.fround(10) })
					.filter((n) => Number.isFinite(n)),
				fc
					.float({ min: Math.fround(0.1), max: Math.fround(10) })
					.filter((n) => Number.isFinite(n)),
				(psPct, tasaBase, multBola, multEstadoA) => {
					const multEstadoB = multEstadoA * 2;
					const dA: DatosCaptura = {
						psPct,
						tasaBase,
						multBola,
						multEstado: multEstadoA,
					};
					const dB: DatosCaptura = {
						psPct,
						tasaBase,
						multBola,
						multEstado: multEstadoB,
					};
					const pA = probCaptura(dA);
					const pB = probCaptura(dB);
					return pA >= 0 && pA <= 1 && pB >= 0 && pB <= 1 && pB >= pA;
				},
			),
			{ numRuns: 500 },
		);
	});
});
