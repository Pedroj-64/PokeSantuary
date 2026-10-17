import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recortar } from "./recortar.js";

const fixture = (nombre: string) =>
	JSON.parse(
		readFileSync(
			new URL(`../test/fixtures/${nombre}.json`, import.meta.url),
			"utf8",
		),
	);

describe("recortar", () => {
	it("conserva solo los campos del esquema, con nombres y textos es/en", () => {
		const r = recortar(
			fixture("pokemon-pikachu"),
			fixture("pokemon-species-pikachu"),
		);
		expect(Object.keys(r).sort()).toEqual(
			[
				"descripcion",
				"dex",
				"gruposHuevo",
				"id",
				"nombre",
				"tasaCaptura",
				"tipos",
			].sort(),
		);
		expect(r.id).toBe("pikachu");
		expect(r.dex).toBe(25);
		expect(r.tipos).toEqual(["electric"]);
		expect(r.nombre).toEqual({ es: "Pikachu", en: "Pikachu" });
		expect(r.gruposHuevo).toEqual(["ground", "fairy"]);
		expect(r.tasaCaptura).toBe(190);
	});

	it("normaliza saltos de línea y saltos de página en las descripciones", () => {
		const r = recortar(
			fixture("pokemon-gastly"),
			fixture("pokemon-species-gastly"),
		);
		expect(r.tipos).toEqual(["ghost", "poison"]);
		for (const texto of [r.descripcion.es, r.descripcion.en]) {
			expect(texto.length).toBeGreaterThan(0);
			expect(texto).not.toMatch(/[\n\f\r]|\s{2}/);
		}
		expect(r.descripcion.es).toMatch(/Gastly|gas/);
	});

	it("lanza si falta el nombre o la descripción en un idioma", () => {
		const especie = fixture("pokemon-species-pikachu");
		especie.names = especie.names.filter(
			(n: { language: { name: string } }) => n.language.name !== "es",
		);
		expect(() => recortar(fixture("pokemon-pikachu"), especie)).toThrow(/es/);
	});
});
