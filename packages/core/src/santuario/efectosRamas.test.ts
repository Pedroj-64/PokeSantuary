import { describe, expect, it } from "vitest";
import {
	efectoDeRama,
	efectosDeRamas,
	type TablaEfectosRamas,
} from "./efectosRamas.js";
import type { RangosRamas } from "./ramas.js";

const TABLA: TablaEfectosRamas = {
	farol: [{ llamas: 2 }, { llamas: 3 }],
	"mochila-amplia": [
		{ bolasExtra: 1, bayasExtra: 1, objetosAlmacen: 1 },
		{ bolasExtra: 2, bayasExtra: 2, objetosAlmacen: 1 },
		{ bolasExtra: 3, bayasExtra: 3, objetosAlmacen: 1 },
	],
	"equipo-expedicion": [{ equipoMax: 4 }, { equipoMax: 5 }, { equipoMax: 6 }],
	"ojo-del-coro": [{ opcionesRuna: 4 }],
	"bendicion-del-alba": [
		{ bendicionEnRaiz: true },
		{ bendicionEnRaiz: true, bendicionDeLamento: true },
	],
	"raices-firmes": [
		{ curaEntrePisosPct: 45 },
		{ curaEntrePisosPct: 60, reviveAlPct: 25 },
	],
	"afinidad-sombria": [{ bonusRendicion: 0.1 }, { bonusRendicion: 0.2 }],
	"memoria-del-eco": [{ recuerdosAlDejarIr: 1, pistasBitacora: true }],
};

describe("efectoDeRama", () => {
	it("rango 0 devuelve {}", () => {
		expect(efectoDeRama("farol", 0, TABLA)).toEqual({});
	});

	it("farol rango 1 → {llamas:2}", () => {
		expect(efectoDeRama("farol", 1, TABLA)).toEqual({ llamas: 2 });
	});

	it("farol rango 2 → {llamas:3} (no suma)", () => {
		expect(efectoDeRama("farol", 2, TABLA)).toEqual({ llamas: 3 });
	});

	it("rango 3 de farol lanza RangeError", () => {
		expect(() => efectoDeRama("farol", 3, TABLA)).toThrow(RangeError);
	});

	it("rango -1 lanza RangeError", () => {
		expect(() => efectoDeRama("farol", -1, TABLA)).toThrow(RangeError);
	});

	it("rango 1.5 lanza RangeError", () => {
		expect(() => efectoDeRama("farol", 1.5 as number, TABLA)).toThrow(
			RangeError,
		);
	});

	it("rama inexistente lanza RangeError", () => {
		expect(() => efectoDeRama("no-existe", 1, TABLA)).toThrow(RangeError);
	});
});

describe("efectosDeRamas", () => {
	it("sin rangos → {}", () => {
		expect(efectosDeRamas({}, TABLA)).toEqual({});
	});

	it("solo farol: 1 → {llamas:2}", () => {
		expect(efectosDeRamas({ farol: 1 } as RangosRamas, TABLA)).toEqual({
			llamas: 2,
		});
	});

	it("farol: 2 y equipo-expedicion: 3 → {llamas:3, equipoMax:6}", () => {
		const r = efectosDeRamas(
			{ farol: 2, "equipo-expedicion": 3 } as RangosRamas,
			TABLA,
		);
		expect(r).toEqual({ llamas: 3, equipoMax: 6 });
	});

	it("raices-firmes: 2 y bendicion-del-alba: 1 → sin bendicionDeLamento", () => {
		const r = efectosDeRamas(
			{ "raices-firmes": 2, "bendicion-del-alba": 1 } as RangosRamas,
			TABLA,
		);
		expect(r).toEqual({
			curaEntrePisosPct: 60,
			reviveAlPct: 25,
			bendicionEnRaiz: true,
		});
		expect(r).not.toHaveProperty("bendicionDeLamento");
	});

	it("una rama con rango 0 no aporta nada", () => {
		expect(efectosDeRamas({ farol: 0 } as RangosRamas, TABLA)).toEqual({});
	});

	it("dos ramas que definen llamas dan el máximo", () => {
		const t: TablaEfectosRamas = {
			a: [{ llamas: 2 }],
			b: [{ llamas: 5 }],
		};
		expect(efectosDeRamas({ a: 1, b: 1 } as RangosRamas, t)).toEqual({
			llamas: 5,
		});
	});

	it("booleanos con OR", () => {
		const t: TablaEfectosRamas = {
			a: [{ pistasBitacora: false }],
			b: [{ pistasBitacora: true }],
		};
		expect(efectosDeRamas({ a: 1, b: 1 } as RangosRamas, t)).toEqual({
			pistasBitacora: true,
		});
	});

	it("rama de rangos fuera de la tabla lanza RangeError", () => {
		expect(() =>
			efectosDeRamas({ "no-existe": 1 } as RangosRamas, TABLA),
		).toThrow(RangeError);
	});

	it("todas las ramas al máximo trae todos los efectos", () => {
		const rangosMutable: Record<string, number> = {};
		for (const rama of Object.keys(TABLA)) {
			const efectos = TABLA[rama];
			if (efectos !== undefined) rangosMutable[rama] = efectos.length;
		}
		const r = efectosDeRamas(rangosMutable, TABLA);
		expect(r).toEqual({
			llamas: 3,
			bolasExtra: 3,
			bayasExtra: 3,
			objetosAlmacen: 1,
			equipoMax: 6,
			opcionesRuna: 4,
			bendicionEnRaiz: true,
			bendicionDeLamento: true,
			curaEntrePisosPct: 60,
			reviveAlPct: 25,
			bonusRendicion: 0.2,
			recuerdosAlDejarIr: 1,
			pistasBitacora: true,
		});
		expect(Object.keys(r).sort()).toEqual([
			"bayasExtra",
			"bendicionDeLamento",
			"bendicionEnRaiz",
			"bolasExtra",
			"bonusRendicion",
			"curaEntrePisosPct",
			"equipoMax",
			"llamas",
			"objetosAlmacen",
			"opcionesRuna",
			"pistasBitacora",
			"recuerdosAlDejarIr",
			"reviveAlPct",
		]);
	});

	it("entrada congelada no se muta", () => {
		const congelado = Object.freeze({ farol: 2 } as RangosRamas);
		expect(() => efectosDeRamas(congelado, TABLA)).not.toThrow();
		expect(congelado).toEqual({ farol: 2 });
	});
});
