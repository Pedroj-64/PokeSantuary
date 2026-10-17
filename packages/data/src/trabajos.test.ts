import { describe, expect, it } from "vitest";
import { TipoIdSchema } from "./especie.js";
import { TrabajosPorTipoSchema } from "./trabajos.js";

const completo = () =>
	Object.fromEntries(TipoIdSchema.options.map((t) => [t, ["transportar"]]));

describe("TrabajosPorTipoSchema", () => {
	it("acepta los 18 tipos con al menos un trabajo", () => {
		expect(TrabajosPorTipoSchema.safeParse(completo()).success).toBe(true);
	});

	it("rechaza un tipo ausente", () => {
		const { fire: _fire, ...resto } = completo();
		expect(TrabajosPorTipoSchema.safeParse(resto).success).toBe(false);
	});

	it("rechaza un tipo sin trabajos", () => {
		expect(
			TrabajosPorTipoSchema.safeParse({ ...completo(), fire: [] }).success,
		).toBe(false);
	});

	it("rechaza un slug de trabajo inválido", () => {
		expect(
			TrabajosPorTipoSchema.safeParse({ ...completo(), fire: ["Cocinar!"] })
				.success,
		).toBe(false);
	});

	it("rechaza un tipo desconocido", () => {
		expect(
			TrabajosPorTipoSchema.safeParse({ ...completo(), sonido: ["x"] }).success,
		).toBe(false);
	});
});
