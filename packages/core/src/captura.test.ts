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
