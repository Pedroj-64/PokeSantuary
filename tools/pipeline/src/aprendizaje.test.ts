import { describe, expect, it } from "vitest";
import { aprendizajePorNivel } from "./aprendizaje.js";

type Entrada = { nivel: number; movimiento: string };

const porNivel = (a: Entrada, b: Entrada) =>
	a.nivel - b.nivel || (a.movimiento < b.movimiento ? -1 : 1);

describe("aprendizajePorNivel", () => {
	it("lee los movimientos por nivel de Gen 9 de charmander", async () => {
		const lista = await aprendizajePorNivel("charmander");
		const movimientos = lista.map((e) => e.movimiento);
		expect(lista).toContainEqual({ nivel: 4, movimiento: "ember" });
		expect(lista).toContainEqual({ nivel: 12, movimiento: "dragon-breath" });
		expect(lista).toContainEqual({ nivel: 17, movimiento: "fire-fang" });
		// Los slugs llevan guion: nunca el id crudo de @pkmn/data.
		expect(movimientos).not.toContain("dragonbreath");
		// flameburst solo existe como 7L28 (Gen 7): genMax de charmander es 9.
		expect(movimientos).not.toContain("flame-burst");
		// dragon-dance es MT/huevo, no fuente de nivel.
		expect(movimientos).not.toContain("dragon-dance");
		expect(lista.every((e) => e.nivel <= 50)).toBe(true);
		expect(
			lista.every((e) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.movimiento)),
		).toBe(true);
		expect(lista).toEqual([...lista].sort(porNivel));
		expect(await aprendizajePorNivel("charmander")).toEqual(lista);
	});

	it("usa la generación más reciente (Gen 8) cuando la especie no está en Gen 9", async () => {
		const lista = await aprendizajePorNivel("machop");
		expect(lista.length).toBeGreaterThan(0);
		expect(lista).toContainEqual({ nivel: 4, movimiento: "focus-energy" });
		expect(lista).toContainEqual({ nivel: 36, movimiento: "bulk-up" });
		expect(lista.every((e) => e.nivel <= 50)).toBe(true);
		expect(lista).toEqual([...lista].sort(porNivel));
	});

	it("lanza un error si la especie no tiene datos de aprendizaje", async () => {
		await expect(aprendizajePorNivel("noexiste")).rejects.toThrow(/noexiste/);
	});
});
