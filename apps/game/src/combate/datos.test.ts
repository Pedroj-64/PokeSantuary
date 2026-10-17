import { describe, expect, it } from "vitest";
import { construirDatosCombate } from "./datos.js";

describe("construirDatosCombate", () => {
	it("falla con datos mal formados en lugar de omitirlos", () => {
		expect(() => construirDatosCombate("[{}]", "[]", "[]")).toThrow();
		expect(() => construirDatosCombate("no es json", "[]", "[]")).toThrow();
	});

	it("acepta listas vacías y devuelve el slug si no conoce el nombre", () => {
		const d = construirDatosCombate("[]", "[]", "[]");
		expect(d.nombres.especie("desconocida")).toBe("desconocida");
		expect(d.tipoDeMovimiento("x")).toBe("normal");
	});
});
