import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Estadistica,
	efectoNaturaleza,
	elegirNaturaleza,
	generarIV,
	multiplicadorNaturaleza,
} from "./individuo.js";
import { crearRng } from "./rng.js";

const NATURALEZAS: readonly string[] = [
	"Hardy",
	"Lonely",
	"Brave",
	"Adamant",
	"Naughty",
	"Bold",
	"Docile",
	"Relaxed",
	"Impish",
	"Lax",
	"Timid",
	"Hasty",
	"Serious",
	"Jolly",
	"Naive",
	"Modest",
	"Mild",
	"Quiet",
	"Bashful",
	"Rash",
	"Calm",
	"Gentle",
	"Sassy",
	"Careful",
	"Quirky",
];

const NEUTRAS: readonly string[] = [
	"Hardy",
	"Docile",
	"Serious",
	"Bashful",
	"Quirky",
];

const ESTADISTICAS: readonly Estadistica[] = [
	"atk",
	"def",
	"spa",
	"spd",
	"spe",
];

describe("generarIV", () => {
	it("es determinista con crearRng('x')", () => {
		const uno = generarIV(crearRng("x"));
		const dos = generarIV(crearRng("x"));
		expect(uno).toEqual(dos);
	});

	it("todas las estadisticas son enteros en 0..31", () => {
		fc.assert(
			fc.property(fc.string(), (semilla) => {
				const iv = generarIV(crearRng(semilla));
				for (const stat of ESTADISTICAS) {
					const valor = iv[stat];
					if (!Number.isInteger(valor) || valor < 0 || valor > 31) {
						return false;
					}
				}
				return true;
			}),
			{ numRuns: 100 },
		);
	});

	it("consume exactamente 6 valores del rng", () => {
		const a = crearRng("det");
		const iv = generarIV(a);
		const despues = a.entero(0, 100);

		const b = crearRng("det");
		for (let i = 0; i < 6; i++) b.entero(0, 31);
		const igual = b.entero(0, 100);

		expect(iv.hp).toBeGreaterThanOrEqual(0);
		expect(iv.hp).toBeLessThanOrEqual(31);
		expect(despues).toBe(igual);
	});
});

describe("efectoNaturaleza", () => {
	it("exactamente 20 con efecto y 5 neutras", () => {
		let conEfecto = 0;
		let neutras = 0;
		for (const n of NATURALEZAS) {
			const e = efectoNaturaleza(n);
			if (e === undefined) neutras++;
			else conEfecto++;
		}
		expect(conEfecto).toBe(20);
		expect(neutras).toBe(5);
	});

	it("en cada una de las 20, sube !== baja", () => {
		for (const n of NATURALEZAS) {
			const e = efectoNaturaleza(n);
			if (e === undefined) continue;
			expect(e.sube).not.toBe(e.baja);
		}
	});

	it("cada estadistica sube en exactamente 4 naturalezas y baja en exactamente 4", () => {
		for (const stat of ESTADISTICAS) {
			let sube = 0;
			let baja = 0;
			for (const n of NATURALEZAS) {
				const e = efectoNaturaleza(n);
				if (e === undefined) continue;
				if (e.sube === stat) sube++;
				if (e.baja === stat) baja++;
			}
			expect(sube).toBe(4);
			expect(baja).toBe(4);
		}
	});

	it("casos fijos de la tabla clásica", () => {
		expect(efectoNaturaleza("Adamant")).toEqual({ sube: "atk", baja: "spa" });
		expect(efectoNaturaleza("Timid")).toEqual({ sube: "spe", baja: "atk" });
		expect(efectoNaturaleza("Modest")).toEqual({ sube: "spa", baja: "atk" });
		expect(efectoNaturaleza("Jolly")).toEqual({ sube: "spe", baja: "spa" });
		expect(efectoNaturaleza("Bold")).toEqual({ sube: "def", baja: "atk" });
		expect(efectoNaturaleza("Calm")).toEqual({ sube: "spd", baja: "atk" });
		expect(efectoNaturaleza("Impish")).toEqual({ sube: "def", baja: "spa" });
		expect(efectoNaturaleza("Careful")).toEqual({ sube: "spd", baja: "spa" });
		expect(efectoNaturaleza("Brave")).toEqual({ sube: "atk", baja: "spe" });
		expect(efectoNaturaleza("Quiet")).toEqual({ sube: "spa", baja: "spe" });
	});

	it("las 5 neutras devuelven undefined", () => {
		for (const n of NEUTRAS) {
			expect(efectoNaturaleza(n)).toBeUndefined();
		}
	});

	it("naturaleza inventada lanza RangeError", () => {
		for (const mala of ["Falsa", "hardy", "ADAMANT", "", "Pikachu"]) {
			expect(() => efectoNaturaleza(mala)).toThrow(RangeError);
		}
	});
});

describe("multiplicadorNaturaleza", () => {
	it("Adamant: atk 1.1, spa 0.9, def 1", () => {
		expect(multiplicadorNaturaleza("Adamant", "atk")).toBe(1.1);
		expect(multiplicadorNaturaleza("Adamant", "spa")).toBe(0.9);
		expect(multiplicadorNaturaleza("Adamant", "def")).toBe(1);
	});
	it("Hardy: todo 1", () => {
		expect(multiplicadorNaturaleza("Hardy", "atk")).toBe(1);
		expect(multiplicadorNaturaleza("Hardy", "spe")).toBe(1);
	});
	it("Timid: spe 1.1, atk 0.9", () => {
		expect(multiplicadorNaturaleza("Timid", "spe")).toBe(1.1);
		expect(multiplicadorNaturaleza("Timid", "atk")).toBe(0.9);
	});
	it("naturaleza invalida lanza RangeError", () => {
		expect(() => multiplicadorNaturaleza("Falsa", "atk")).toThrow(RangeError);
	});
});

describe("elegirNaturaleza", () => {
	it("devuelve siempre una naturaleza valida", () => {
		for (let i = 0; i < 200; i++) {
			const n = elegirNaturaleza(crearRng(`semilla${i}`));
			expect(NATURALEZAS.includes(n)).toBe(true);
		}
	});
	it("es determinista", () => {
		expect(elegirNaturaleza(crearRng("x"))).toBe(
			elegirNaturaleza(crearRng("x")),
		);
	});
	it("semillas distintas pueden dar distinto resultado", () => {
		const resultados = new Set<string>();
		for (let i = 0; i < 25; i++) {
			resultados.add(elegirNaturaleza(crearRng(String(i))));
		}
		expect(resultados.size).toBeGreaterThan(1);
	});
});
