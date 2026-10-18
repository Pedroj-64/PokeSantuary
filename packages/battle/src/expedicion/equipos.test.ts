import type { SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { crearEquipos } from "./equipos.js";

const sets: SetCombate[] = Array.from({ length: 10 }, (_, i) => ({
	especie: `esp${i}`,
	movimientos: ["a"],
	habilidad: "h",
	naturaleza: "Modest",
}));
const especies = (m: { especie: string }[]) => m.map((x) => x.especie);

describe("crearEquipos", () => {
	it("misma semilla, mismos equipos", () => {
		expect(crearEquipos("vis1", sets)).toEqual(crearEquipos("vis1", sets));
	});

	it("semillas distintas suelen dar equipos distintos", () => {
		const firmas = new Set(
			["a", "b", "c", "d", "e", "f"].map((s) =>
				JSON.stringify(crearEquipos(s, sets)),
			),
		);
		expect(firmas.size).toBeGreaterThan(1);
	});

	it("3 y 3, sin repetir especie ni solaparse; cada miembro lleva su set", () => {
		for (const s of ["", "ñandú", "x", "y", "z"]) {
			const { jugador, rival } = crearEquipos(s, sets);
			const todas = [...especies(jugador), ...especies(rival)];
			expect(todas).toHaveLength(6);
			expect(new Set(todas).size).toBe(6);
			for (const m of [...jugador, ...rival])
				expect(m.set.especie).toBe(m.especie);
		}
	});

	it("con pocas especies no se solapan si es posible y no repite dentro del lado", () => {
		const { jugador, rival } = crearEquipos("k", sets.slice(0, 4));
		expect(new Set(especies(jugador)).size).toBe(3);
		expect(new Set(especies(rival)).size).toBe(3);
	});
});
