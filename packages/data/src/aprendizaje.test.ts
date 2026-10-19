import { describe, expect, it } from "vitest";
import { AprendizajeSchema } from "./aprendizaje.js";

/** Caso válido mínimo: dos especies, con empate de nivel bien ordenado. */
const VALIDO = {
	charmander: [
		{ nivel: 1, movimiento: "growl" },
		{ nivel: 1, movimiento: "scratch" },
		{ nivel: 4, movimiento: "ember" },
	],
	machop: [{ nivel: 4, movimiento: "focus-energy" }],
};

/** Copia independiente del caso válido. */
const base = (): Record<string, unknown> =>
	structuredClone(VALIDO) as Record<string, unknown>;

/** Valida una copia con una mutación aplicada. */
const roto = (romper: (crudo: Record<string, unknown>) => void): boolean => {
	const crudo = base();
	romper(crudo);
	return AprendizajeSchema.safeParse(crudo).success;
};

const entrada = (nivel: unknown, movimiento: unknown) => ({
	nivel,
	movimiento,
});

describe("AprendizajeSchema", () => {
	it("acepta el caso válido", () => {
		expect(AprendizajeSchema.safeParse(VALIDO).success).toBe(true);
	});

	it("admite varias entradas del mismo nivel si van ordenadas por movimiento", () => {
		expect(
			roto((c) => {
				c.charmander = [
					entrada(4, "ember"),
					entrada(4, "growl"),
					entrada(8, "smokescreen"),
				];
			}),
		).toBe(true);
	});

	it("rechaza una clave de especie que no es slug y una entrada con clave de más", () => {
		expect(roto((c) => (c.Charmander = []))).toBe(false);
		expect(
			roto((c) => {
				c.charmander = [{ nivel: 4, movimiento: "ember", extra: 1 }];
			}),
		).toBe(false);
	});

	it("rechaza nivel 0, 101 y no entero", () => {
		expect(roto((c) => (c.charmander = [entrada(0, "ember")]))).toBe(false);
		expect(roto((c) => (c.charmander = [entrada(101, "ember")]))).toBe(false);
		expect(roto((c) => (c.charmander = [entrada(4.5, "ember")]))).toBe(false);
	});

	it("rechaza el orden roto por nivel y por movimiento", () => {
		expect(
			roto((c) => {
				c.charmander = [entrada(8, "ember"), entrada(4, "growl")];
			}),
		).toBe(false);
		expect(
			roto((c) => {
				c.charmander = [entrada(4, "scratch"), entrada(4, "ember")];
			}),
		).toBe(false);
	});

	it("rechaza un movimiento repetido en la misma especie", () => {
		expect(
			roto((c) => {
				c.charmander = [entrada(1, "growl"), entrada(2, "growl")];
			}),
		).toBe(false);
	});

	it("rechaza una lista vacía", () => {
		expect(roto((c) => (c.charmander = []))).toBe(false);
	});
});
