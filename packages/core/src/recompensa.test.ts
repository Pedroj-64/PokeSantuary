import { describe, expect, it } from "vitest";
import type { TipoNodo } from "./mapa.js";
import {
	type RangoDinero,
	recompensa,
	type TablaRecompensas,
} from "./recompensa.js";
import { crearRng } from "./rng.js";

/** Tabla con los valores de diseño del pack de Kanto. */
const TABLA: TablaRecompensas = {
	salvaje: [
		{ min: 5, max: 10 },
		{ min: 8, max: 14 },
		{ min: 12, max: 20 },
	],
	entrenador: [
		{ min: 12, max: 20 },
		{ min: 18, max: 28 },
		{ min: 25, max: 40 },
	],
	alfa: [
		{ min: 20, max: 30 },
		{ min: 30, max: 45 },
		{ min: 40, max: 60 },
	],
	sombrio: [
		{ min: 15, max: 25 },
		{ min: 25, max: 35 },
		{ min: 35, max: 50 },
	],
	jefe: [
		{ min: 40, max: 60 },
		{ min: 60, max: 90 },
		{ min: 100, max: 150 },
	],
};

const TIPOS_COMBATE = [
	"salvaje",
	"entrenador",
	"alfa",
	"sombrio",
	"jefe",
] as const;
const TIPOS_SIN_COMBATE = ["tienda", "manantial", "evento", "cofre"] as const;
const PISOS = [1, 2, 3] as const;

/** Rango de la tabla, sin sustos de tipos. */
const rango = (tipo: keyof TablaRecompensas, piso: 1 | 2 | 3): RangoDinero => {
	const elegido = TABLA[tipo][piso - 1];
	if (!elegido) throw new Error(`falta el rango de ${tipo} en el piso ${piso}`);
	return elegido;
};

/** Congela en profundidad para detectar mutaciones. */
function congelar<T>(valor: T): T {
	if (valor === null || typeof valor !== "object") return valor;
	Object.freeze(valor);
	for (const hijo of Object.values(valor as Record<string, unknown>)) {
		congelar(hijo);
	}
	return valor;
}

/** Media de `muestras` tiradas con semillas distintas. */
const media = (tipo: keyof TablaRecompensas, piso: 1 | 2 | 3): number => {
	let suma = 0;
	for (let i = 0; i < 200; i++) {
		suma += recompensa(TABLA, tipo, piso, crearRng(`m${i}`));
	}
	return suma / 200;
};

describe("recompensa", () => {
	it("devuelve un entero dentro del rango del tipo y el piso", () => {
		for (const tipo of TIPOS_COMBATE) {
			for (const piso of PISOS) {
				const { min, max } = rango(tipo, piso);
				const vistos = new Set<number>();
				for (let i = 0; i < 200; i++) {
					const n = recompensa(TABLA, tipo, piso, crearRng(`s${i}`));
					expect(Number.isInteger(n)).toBe(true);
					expect(n).toBeGreaterThanOrEqual(min);
					expect(n).toBeLessThanOrEqual(max);
					vistos.add(n);
				}
				// No se queda pegado al mínimo: sortea de verdad.
				if (max > min) expect(vistos.size).toBeGreaterThan(1);
			}
		}
	});

	it("la media sube con el piso", () => {
		for (const tipo of TIPOS_COMBATE) {
			expect(media(tipo, 2)).toBeGreaterThan(media(tipo, 1));
			expect(media(tipo, 3)).toBeGreaterThan(media(tipo, 2));
		}
	});

	it("rechaza los tipos sin combate", () => {
		for (const tipo of TIPOS_SIN_COMBATE) {
			expect(() =>
				recompensa(TABLA, tipo as TipoNodo, 1, crearRng("x")),
			).toThrow(RangeError);
		}
	});

	it("rechaza un piso fuera de 1..3", () => {
		expect(() => recompensa(TABLA, "salvaje", 0 as 1, crearRng("x"))).toThrow(
			RangeError,
		);
		expect(() => recompensa(TABLA, "salvaje", 4 as 1, crearRng("x"))).toThrow(
			RangeError,
		);
	});

	it("rechaza una tabla que no es una tabla", () => {
		expect(() =>
			recompensa(
				null as unknown as TablaRecompensas,
				"salvaje",
				1,
				crearRng("x"),
			),
		).toThrow(RangeError);
	});

	it("rechaza un rango invertido y un piso sin rango", () => {
		const invertida: TablaRecompensas = {
			...TABLA,
			alfa: [{ min: 9, max: 3 }, rango("alfa", 2), rango("alfa", 3)],
		};
		expect(() => recompensa(invertida, "alfa", 1, crearRng("x"))).toThrow(
			RangeError,
		);
		// Tupla recortada a propósito: ahí no hay recompensa que dar.
		const corta = {
			...TABLA,
			jefe: [
				rango("jefe", 1),
				rango("jefe", 2),
			] as unknown as TablaRecompensas["jefe"],
		};
		expect(() => recompensa(corta, "jefe", 3, crearRng("x"))).toThrow(
			RangeError,
		);
	});

	it("es determinista con el mismo rng", () => {
		for (const tipo of TIPOS_COMBATE) {
			for (const piso of PISOS) {
				expect(recompensa(TABLA, tipo, piso, crearRng("det"))).toBe(
					recompensa(TABLA, tipo, piso, crearRng("det")),
				);
			}
		}
		const rng = crearRng("serie");
		const primera = recompensa(TABLA, "jefe", 3, rng);
		const segunda = recompensa(TABLA, "jefe", 3, rng);
		const tercero = crearRng("serie");
		expect(primera).toBe(recompensa(TABLA, "jefe", 3, tercero));
		expect(segunda).toBe(recompensa(TABLA, "jefe", 3, tercero));
	});

	it("no muta la tabla", () => {
		const congelada: TablaRecompensas = congelar({
			...TABLA,
			salvaje: [
				{ ...rango("salvaje", 1) },
				{ ...rango("salvaje", 2) },
				{ ...rango("salvaje", 3) },
			],
		});
		const antes = JSON.stringify(congelada);
		expect(
			recompensa(congelada, "salvaje", 2, crearRng("inm")),
		).toBeGreaterThan(0);
		expect(JSON.stringify(congelada)).toBe(antes);
	});
});
