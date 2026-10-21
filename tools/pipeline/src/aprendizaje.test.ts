import type { Aprendizaje, Movimiento, SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { aprendizajePorNivel, conAtaqueMinimo } from "./aprendizaje.js";

type Entrada = { nivel: number; movimiento: string };

const porNivel = (a: Entrada, b: Entrada) =>
	a.nivel - b.nivel || (a.movimiento < b.movimiento ? -1 : 1);

function congelar<T>(valor: T): T {
	if (Array.isArray(valor)) {
		return Object.freeze(valor.map((v) => congelar(v))) as T;
	}
	if (valor !== null && typeof valor === "object") {
		const copia: Record<string, unknown> = {};
		for (const [clave, v] of Object.entries(valor)) copia[clave] = congelar(v);
		return Object.freeze(copia) as T;
	}
	return valor;
}

function movimiento(id: string, potencia: number | null): Movimiento {
	return {
		id,
		nombre: { es: id, en: id },
		tipo: "normal",
		categoria: potencia === null ? "estado" : "fisico",
		potencia,
		precision: 100,
		pp: 10,
	};
}

function setDe(especie: string, movimientos: string[]): SetCombate {
	return {
		especie,
		movimientos,
		habilidad: "magic-guard",
		naturaleza: "Timid",
	};
}

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

describe("conAtaqueMinimo", () => {
	const TELEPORT = movimiento("teleport", null);
	const THUNDER_WAVE = movimiento("thunder-wave", null);
	const PSYCHIC = movimiento("psychic", 90);
	const SHADOW_BALL = movimiento("shadow-ball", 80);
	const TACKLE = movimiento("tackle", 40);
	const VINE_WHIP = movimiento("vine-whip", 45);
	const SPLASH = movimiento("splash", null);

	it("da a Abra el primer ataque de su set a nivel 1", () => {
		const aprendizaje: Aprendizaje = congelar({
			abra: [{ nivel: 1, movimiento: "teleport" }],
		});
		const sets: SetCombate[] = congelar([
			setDe("abra", ["thunder-wave", "psychic", "shadow-ball"]),
		]);
		const movimientos: Movimiento[] = congelar([
			TELEPORT,
			THUNDER_WAVE,
			PSYCHIC,
			SHADOW_BALL,
		]);
		const r = conAtaqueMinimo(aprendizaje, sets, movimientos);
		expect(r.aprendizaje.abra).toEqual([
			{ nivel: 1, movimiento: "psychic" },
			{ nivel: 1, movimiento: "teleport" },
		]);
		expect(r.cambiadas).toEqual(["abra"]);
		expect(r.avisos).toEqual([]);
	});

	it("no toca a una especie que ya tiene un ataque", () => {
		const aprendizaje: Aprendizaje = congelar({
			bulbasaur: [{ nivel: 1, movimiento: "tackle" }],
		});
		const sets: SetCombate[] = congelar([setDe("bulbasaur", ["vine-whip"])]);
		const movimientos: Movimiento[] = congelar([TACKLE, VINE_WHIP]);
		const r = conAtaqueMinimo(aprendizaje, sets, movimientos);
		expect(r.aprendizaje.bulbasaur).toEqual([
			{ nivel: 1, movimiento: "tackle" },
		]);
		expect(r.cambiadas).toEqual([]);
		expect(r.avisos).toEqual([]);
	});

	it("deja intacta y avisa a una especie cuyo set no ataca", () => {
		const aprendizaje: Aprendizaje = congelar({
			magikarp: [{ nivel: 1, movimiento: "splash" }],
		});
		const sets: SetCombate[] = congelar([setDe("magikarp", ["splash"])]);
		const movimientos: Movimiento[] = congelar([SPLASH]);
		const r = conAtaqueMinimo(aprendizaje, sets, movimientos);
		expect(r.aprendizaje.magikarp).toEqual([
			{ nivel: 1, movimiento: "splash" },
		]);
		expect(r.cambiadas).toEqual([]);
		expect(r.avisos.join(" ")).toContain("magikarp");
	});

	it("avisa también si la especie no tiene set", () => {
		const aprendizaje: Aprendizaje = congelar({
			abra: [{ nivel: 1, movimiento: "teleport" }],
		});
		const r = conAtaqueMinimo(aprendizaje, [], congelar([TELEPORT]));
		expect(r.aprendizaje.abra).toEqual([{ nivel: 1, movimiento: "teleport" }]);
		expect(r.cambiadas).toEqual([]);
		expect(r.avisos.join(" ")).toContain("abra");
	});

	it("no muta entradas y devuelve un aprendizaje nuevo", () => {
		const aprendizaje: Aprendizaje = congelar({
			abra: [{ nivel: 1, movimiento: "teleport" }],
		});
		const sets: SetCombate[] = congelar([setDe("abra", ["psychic"])]);
		const movimientos: Movimiento[] = congelar([TELEPORT, PSYCHIC]);
		const antesA = structuredClone(aprendizaje);
		const antesS = structuredClone(sets);
		const antesM = structuredClone(movimientos);
		const r = conAtaqueMinimo(aprendizaje, sets, movimientos);
		expect(aprendizaje).toEqual(antesA);
		expect(sets).toEqual(antesS);
		expect(movimientos).toEqual(antesM);
		expect(r.aprendizaje).not.toBe(aprendizaje);
		expect(r.aprendizaje.abra).not.toBe(aprendizaje.abra);
	});

	it("es idempotente", () => {
		const aprendizaje: Aprendizaje = congelar({
			abra: [{ nivel: 1, movimiento: "teleport" }],
		});
		const sets: SetCombate[] = congelar([setDe("abra", ["psychic"])]);
		const movimientos: Movimiento[] = congelar([TELEPORT, PSYCHIC]);
		const r = conAtaqueMinimo(aprendizaje, sets, movimientos);
		const r2 = conAtaqueMinimo(r.aprendizaje, sets, movimientos);
		expect(r2.aprendizaje).toEqual(r.aprendizaje);
		expect(r2.cambiadas).toEqual([]);
	});
});
