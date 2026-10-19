import { describe, expect, it } from "vitest";
import { esTemaDelDia, TEMAS_CHARLA, temasDelDia } from "./charla.js";
import type { TemaCharla } from "./estado.js";

describe("TEMAS_CHARLA", () => {
	it("tiene los 6 temas en el orden correcto", () => {
		expect(TEMAS_CHARLA).toEqual([
			"animo",
			"trabajo",
			"valor",
			"calma",
			"cuidado",
			"raices",
		]);
	});
});

describe("temasDelDia", () => {
	it("devuelve 3 temas distintos, todos validos, ordenados segun TEMAS_CHARLA", () => {
		const temas = temasDelDia("semilla1", 1);
		expect(temas.length).toBe(3);
		expect(new Set(temas).size).toBe(3);
		for (const t of temas) {
			expect(TEMAS_CHARLA.includes(t as TemaCharla)).toBe(true);
		}
		const orden = TEMAS_CHARLA.indexOf(temas[0] as TemaCharla);
		expect(orden).toBeLessThanOrEqual(
			TEMAS_CHARLA.indexOf(temas[1] as TemaCharla),
		);
		expect(TEMAS_CHARLA.indexOf(temas[1] as TemaCharla)).toBeLessThanOrEqual(
			TEMAS_CHARLA.indexOf(temas[2] as TemaCharla),
		);
	});

	it("es determinista", () => {
		expect(temasDelDia("semilla1", 1)).toEqual(temasDelDia("semilla1", 1));
	});

	it("no muta TEMAS_CHARLA", () => {
		const antes = [...TEMAS_CHARLA];
		temasDelDia("semilla1", 1);
		expect(TEMAS_CHARLA).toEqual(antes);
	});

	it("dos semillas distintas dan secuencias distintas en alguna jornada", () => {
		let distintas = false;
		for (let j = 1; j <= 10; j++) {
			if (
				JSON.stringify(temasDelDia("a", j)) !==
				JSON.stringify(temasDelDia("b", j))
			) {
				distintas = true;
				break;
			}
		}
		expect(distintas).toBe(true);
	});

	it("a lo largo de 50 jornadas aparecen los 6 temas y al menos 5 trios distintos", () => {
		const vistos = new Set<string>();
		const apariciones = new Map<TemaCharla, number>();
		for (const t of TEMAS_CHARLA) apariciones.set(t, 0);
		for (let j = 1; j <= 50; j++) {
			const t = temasDelDia("misma", j);
			vistos.add(JSON.stringify(t));
			for (const tema of t)
				apariciones.set(tema, (apariciones.get(tema) ?? 0) + 1);
		}
		expect(vistos.size).toBeGreaterThanOrEqual(5);
		let temasDistintos = 0;
		for (const t of TEMAS_CHARLA) {
			if ((apariciones.get(t) ?? 0) > 0) temasDistintos++;
		}
		expect(temasDistintos).toBe(6);
	});

	it("cada tema aparece entre el 40 % y el 60 % en 600 jornadas", () => {
		const apariciones = new Map<TemaCharla, number>();
		for (const t of TEMAS_CHARLA) apariciones.set(t, 0);
		const total = 600;
		for (let j = 1; j <= total; j++) {
			for (const tema of temasDelDia("propiedad", j)) {
				apariciones.set(tema, (apariciones.get(tema) ?? 0) + 1);
			}
		}
		for (const t of TEMAS_CHARLA) {
			const pct = ((apariciones.get(t) ?? 0) / total) * 100;
			expect(pct).toBeGreaterThanOrEqual(40);
			expect(pct).toBeLessThanOrEqual(60);
		}
	});

	it("jornada 0, negativa o no entera lanza RangeError", () => {
		for (const mala of [0, -1, 1.5, Number.NaN]) {
			expect(() => temasDelDia("s", mala)).toThrow(RangeError);
		}
	});
});

describe("esTemaDelDia", () => {
	it("es coherente con temasDelDia", () => {
		for (let j = 1; j <= 20; j++) {
			const temas = temasDelDia("coherente", j);
			for (const t of TEMAS_CHARLA) {
				const esperado = temas.includes(t as TemaCharla);
				expect(esTemaDelDia("coherente", j, t)).toBe(esperado);
			}
		}
	});

	it("falso para un texto que no es un tema", () => {
		expect(esTemaDelDia("s", 1, "no-es-tema")).toBe(false);
		expect(esTemaDelDia("s", 1, "")).toBe(false);
	});
});
