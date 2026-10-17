import { readFileSync } from "node:fs";
import type { Movimiento, SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import {
	erroresDeSets,
	recortarMovimiento,
	unirMovimiento,
} from "./movimientos.js";

const fixture = (nombre: string) =>
	JSON.parse(
		readFileSync(
			new URL(`../test/fixtures/${nombre}.json`, import.meta.url),
			"utf8",
		),
	);

describe("recortarMovimiento", () => {
	it("conserva solo lo necesario, con nombres es/en", () => {
		const r = recortarMovimiento(fixture("move-thunderbolt"));
		expect(r).toEqual({
			id: "thunderbolt",
			nombre: { es: "Rayo", en: "Thunderbolt" },
			tipo: "electric",
			categoria: "especial",
			potencia: 90,
			precision: 100,
			pp: 15,
		});
	});

	it("traduce estado con potencia nula", () => {
		const r = recortarMovimiento(fixture("move-thunder-wave"));
		expect(r.categoria).toBe("estado");
		expect(r.potencia).toBeNull();
		expect(r.tipo).toBe("electric");
	});

	it("lanza si falta el nombre en un idioma", () => {
		const api = fixture("move-thunderbolt");
		api.names = api.names.filter(
			(n: { language: { name: string } }) => n.language.name !== "es",
		);
		expect(() => recortarMovimiento(api)).toThrow(/es/);
	});
});

describe("unirMovimiento", () => {
	const base = () => recortarMovimiento(fixture("move-thunderbolt"));

	it("acepta datos coherentes con @pkmn/data", () => {
		expect(unirMovimiento(base())).toEqual(base());
	});

	it("lanza si el slug no existe en @pkmn/data", () => {
		expect(() => unirMovimiento({ ...base(), id: "noexiste" })).toThrow(
			/noexiste/,
		);
	});

	it("lanza si el tipo difiere entre fuentes", () => {
		expect(() => unirMovimiento({ ...base(), tipo: "water" })).toThrow(/tipo/);
	});

	it("ante diferencias numéricas manda @pkmn/data", () => {
		const r = unirMovimiento({
			...base(),
			potencia: 95,
			precision: 80,
			pp: 10,
		});
		expect(r.potencia).toBe(90);
		expect(r.precision).toBe(100);
		expect(r.pp).toBe(15);
	});
});

describe("erroresDeSets", () => {
	const set: SetCombate = {
		especie: "pikachu",
		movimientos: ["thunderbolt"],
		habilidad: "static",
		naturaleza: "Timid",
	};
	const mov = (
		id: string,
		categoria: Movimiento["categoria"],
		potencia: number | null,
	): Movimiento => ({
		id,
		nombre: { es: id, en: id },
		tipo: "electric",
		categoria,
		potencia,
		precision: 100,
		pp: 10,
	});
	const tb = mov("thunderbolt", "especial", 90);
	const ctx = {
		movimientos: [tb],
		especies: ["pikachu"],
	};

	it("no da errores para un set legal", async () => {
		expect(await erroresDeSets([set], ctx)).toEqual([]);
	});
	it("detecta especie fuera de especies.json", async () => {
		const e = await erroresDeSets([set], { ...ctx, especies: ["abra"] });
		expect(e.join()).toMatch(/pikachu.*especies\.json/);
	});
	it("detecta movimiento ausente de movimientos.json", async () => {
		const e = await erroresDeSets([set], { ...ctx, movimientos: [] });
		expect(e.join()).toMatch(/thunderbolt.*movimientos\.json/);
	});
	it("detecta movimiento inexistente en @pkmn/data", async () => {
		const e = await erroresDeSets([{ ...set, movimientos: ["noexiste"] }], {
			...ctx,
			movimientos: [mov("noexiste", "especial", 50)],
		});
		expect(e.join()).toMatch(/noexiste.*no existe en @pkmn/);
	});
	it("detecta movimiento que la especie no puede aprender", async () => {
		const e = await erroresDeSets([{ ...set, movimientos: ["earthquake"] }], {
			...ctx,
			movimientos: [mov("earthquake", "fisico", 100)],
		});
		expect(e.join()).toMatch(/pikachu no puede aprender earthquake/);
	});
	it("detecta habilidad que no es de la especie", async () => {
		const e = await erroresDeSets([{ ...set, habilidad: "levitate" }], ctx);
		expect(e.join()).toMatch(/habilidad levitate/);
	});
	it("detecta una especie con más de un set", async () => {
		const e = await erroresDeSets([set, set], ctx);
		expect(e.join()).toMatch(
			/pikachu: especie con más de un set|set de pikachu: especie con más de un set/,
		);
	});
	it("detecta una especie de especies.json sin set", async () => {
		const e = await erroresDeSets([set], {
			...ctx,
			especies: ["pikachu", "abra"],
		});
		expect(e.join()).toMatch(/abra: la especie no tiene set/);
	});
	it("detecta un set sin movimientos dañinos", async () => {
		const e = await erroresDeSets([{ ...set, movimientos: ["thunder-wave"] }], {
			...ctx,
			movimientos: [mov("thunder-wave", "estado", null)],
		});
		expect(e.join()).toMatch(/pikachu: sin ningún movimiento dañino/);
	});
});
