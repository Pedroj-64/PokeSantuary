import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EspecieSchema } from "./especie.js";
import { ManifiestoSchema } from "./manifiesto.js";

const valida = {
	id: "pikachu",
	dex: 25,
	tipos: ["electric"],
	nombre: { es: "Pikachu", en: "Pikachu" },
	descripcion: { es: "Ratón eléctrico.", en: "Electric mouse." },
	trabajos: ["generar-energia"],
	gruposHuevo: ["field", "fairy"],
	tasaCaptura: 190,
};

const ruta = (datos: unknown) => {
	const r = EspecieSchema.safeParse(datos);
	return r.success ? null : r.error.issues[0]?.path;
};

describe("EspecieSchema", () => {
	it("acepta una especie válida", () => {
		expect(EspecieSchema.safeParse(valida).success).toBe(true);
	});
	it("rechaza dex negativo nombrando el campo", () => {
		expect(ruta({ ...valida, dex: -1 })).toEqual(["dex"]);
	});
	it("rechaza tipos vacío nombrando el campo", () => {
		expect(ruta({ ...valida, tipos: [] })).toEqual(["tipos"]);
	});
	it("rechaza nombre.es vacío nombrando el campo", () => {
		expect(ruta({ ...valida, nombre: { es: "", en: "x" } })).toEqual([
			"nombre",
			"es",
		]);
	});
	it("rechaza un tipo desconocido", () => {
		expect(ruta({ ...valida, tipos: ["cosmic"] })).toEqual(["tipos", 0]);
	});
	it("rechaza ids inválidos", () => {
		for (const id of ["", "Pikachu", "-foo", "a--b"])
			expect(ruta({ ...valida, id })).toEqual(["id"]);
	});
	it("rechaza claves desconocidas", () => {
		expect(EspecieSchema.safeParse({ ...valida, extra: 1 }).success).toBe(
			false,
		);
	});
	it("rechaza tipos duplicados", () => {
		expect(ruta({ ...valida, tipos: ["fire", "fire"] })).toEqual(["tipos"]);
	});
	it("acepta un array de especies", () => {
		expect(z.array(EspecieSchema).safeParse([valida, valida]).success).toBe(
			true,
		);
	});
	it("rechaza tasaCaptura 256", () => {
		expect(ruta({ ...valida, tasaCaptura: 256 })).toEqual(["tasaCaptura"]);
	});
});

describe("ManifiestoSchema", () => {
	const hash = "a".repeat(64);
	it("acepta un manifiesto válido", () => {
		expect(
			ManifiestoSchema.safeParse({ archivos: { "sprites/a.png": hash } })
				.success,
		).toBe(true);
	});
	it("rechaza un hash corto", () => {
		const r = ManifiestoSchema.safeParse({ archivos: { "a.png": "abc" } });
		expect(r.success ? null : r.error.issues[0]?.path).toEqual([
			"archivos",
			"a.png",
		]);
	});
	it("acepta ruta anidada", () => {
		expect(
			ManifiestoSchema.safeParse({ archivos: { "sprites/atlas.json": hash } })
				.success,
		).toBe(true);
	});
	it("rechaza hash en mayúsculas", () => {
		expect(
			ManifiestoSchema.safeParse({ archivos: { "a.png": "A".repeat(64) } })
				.success,
		).toBe(false);
	});
	it.each(["../x", "/abs", "a/../../b", "a\\b", "C:\\x", "a//b", "./a", ""])(
		"rechaza clave %j",
		(k) => {
			const r = ManifiestoSchema.safeParse({ archivos: { [k]: hash } });
			expect(r.success).toBe(false);
			expect(r.success ? null : r.error.issues[0]?.path).toEqual([
				"archivos",
				k,
			]);
		},
	);
});
