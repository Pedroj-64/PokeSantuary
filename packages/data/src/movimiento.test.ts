import { describe, expect, it } from "vitest";
import { MovimientoSchema } from "./movimiento.js";

const valido = {
	id: "thunderbolt",
	nombre: { es: "Rayo", en: "Thunderbolt" },
	tipo: "electric",
	categoria: "especial",
	potencia: 90,
	precision: 100,
	pp: 15,
};

const ruta = (datos: unknown) => {
	const r = MovimientoSchema.safeParse(datos);
	return r.success ? null : r.error.issues[0]?.path;
};

describe("MovimientoSchema", () => {
	it("acepta un movimiento válido", () => {
		expect(MovimientoSchema.safeParse(valido).success).toBe(true);
	});
	it("acepta potencia y precisión nulas (movimientos de estado)", () => {
		const r = MovimientoSchema.safeParse({
			...valido,
			categoria: "estado",
			potencia: null,
			precision: null,
		});
		expect(r.success).toBe(true);
	});
	it("rechaza potencia negativa nombrando el campo", () => {
		expect(ruta({ ...valido, potencia: -1 })).toEqual(["potencia"]);
	});
	it("rechaza potencia decimal", () => {
		expect(ruta({ ...valido, potencia: 40.5 })).toEqual(["potencia"]);
	});
	it("rechaza precisión fuera de 1..100", () => {
		expect(ruta({ ...valido, precision: 0 })).toEqual(["precision"]);
		expect(ruta({ ...valido, precision: 101 })).toEqual(["precision"]);
	});
	it("rechaza pp no positivo", () => {
		expect(ruta({ ...valido, pp: 0 })).toEqual(["pp"]);
	});
	it("rechaza categoría o tipo desconocidos", () => {
		expect(ruta({ ...valido, categoria: "magico" })).toEqual(["categoria"]);
		expect(ruta({ ...valido, tipo: "cosmic" })).toEqual(["tipo"]);
	});
	it("rechaza nombre vacío y campos extra", () => {
		expect(ruta({ ...valido, nombre: { es: "", en: "x" } })).toEqual([
			"nombre",
			"es",
		]);
		expect(MovimientoSchema.safeParse({ ...valido, extra: 1 }).success).toBe(
			false,
		);
	});
});
