import type { ExpedicionBalance, SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { expedicionInicial } from "./inicio.js";

const set = (especie: string): SetCombate => ({
	especie,
	movimientos: ["tackle"],
	habilidad: "static",
	naturaleza: "Hardy",
});
const BALANCE = {
	dineroInicial: 30,
	bolasIniciales: 5,
	catalogoTienda: [
		{ id: "super-ball", tipo: "ball", precio: 45 },
		{ id: "poke-ball", tipo: "ball", precio: 20 },
		{ id: "baya", tipo: "baya", precio: 5 },
	],
} as ExpedicionBalance;
const SETS = ["a", "b", "c", "d", "e", "f"].map(set);

describe("expedicionInicial", () => {
	it("arranca en el piso 1 con tres especies distintas del catálogo, a plena salud", () => {
		const e = expedicionInicial("s1", SETS, BALANCE);
		expect(e.piso).toBe(1);
		expect(e.actual).toBeNull();
		expect(e.dinero).toBe(30);
		expect(e.equipo).toHaveLength(3);
		expect(new Set(e.equipo.map((m) => m.especie)).size).toBe(3);
		for (const m of e.equipo) {
			expect(SETS.map((s) => s.especie)).toContain(m.especie);
			expect(m.psPct).toBe(100);
		}
	});

	it("sale con las bolas iniciales de la ball más barata", () => {
		expect(expedicionInicial("s1", SETS, BALANCE).mochila).toEqual({
			"poke-ball": 5,
		});
		expect(
			expedicionInicial("s1", SETS, { ...BALANCE, bolasIniciales: 0 }).mochila,
		).toEqual({});
	});

	it("es función pura de la semilla", () => {
		expect(expedicionInicial("s1", SETS, BALANCE)).toEqual(
			expedicionInicial("s1", SETS, BALANCE),
		);
		const equipos = new Set(
			Array.from({ length: 30 }, (_, i) =>
				expedicionInicial(`s${i}`, SETS, BALANCE)
					.equipo.map((m) => m.especie)
					.join(),
			),
		);
		expect(equipos.size).toBeGreaterThan(1);
	});
});
