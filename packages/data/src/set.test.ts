import { describe, expect, it } from "vitest";
import { NATURALEZAS, SetCombateSchema } from "./set.js";

const valido = {
	especie: "pikachu",
	movimientos: ["thunderbolt", "quick-attack"],
	habilidad: "static",
	naturaleza: "Timid",
};

const ruta = (datos: unknown) => {
	const r = SetCombateSchema.safeParse(datos);
	return r.success ? null : r.error.issues[0]?.path;
};

describe("SetCombateSchema", () => {
	it("acepta un set válido de 1 a 4 movimientos", () => {
		expect(SetCombateSchema.safeParse(valido).success).toBe(true);
		const cuatro = ["a", "b", "c", "d"];
		expect(
			SetCombateSchema.safeParse({ ...valido, movimientos: cuatro }).success,
		).toBe(true);
	});
	it("rechaza 0 o más de 4 movimientos", () => {
		expect(ruta({ ...valido, movimientos: [] })).toEqual(["movimientos"]);
		expect(ruta({ ...valido, movimientos: ["a", "b", "c", "d", "e"] })).toEqual(
			["movimientos"],
		);
	});
	it("rechaza movimientos duplicados", () => {
		expect(ruta({ ...valido, movimientos: ["surf", "surf"] })).toEqual([
			"movimientos",
		]);
	});
	it("rechaza slugs mal formados y naturalezas desconocidas", () => {
		expect(ruta({ ...valido, movimientos: ["Surf!"] })).toEqual([
			"movimientos",
			0,
		]);
		expect(ruta({ ...valido, habilidad: "Static" })).toEqual(["habilidad"]);
		expect(ruta({ ...valido, naturaleza: "Grumpy" })).toEqual(["naturaleza"]);
	});
	it("conoce las 25 naturalezas y rechaza campos extra", () => {
		expect(NATURALEZAS).toHaveLength(25);
		expect(SetCombateSchema.safeParse({ ...valido, nivel: 50 }).success).toBe(
			false,
		);
	});
});
