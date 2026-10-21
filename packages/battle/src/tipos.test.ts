import { describe, expect, it } from "vitest";
import { multiplicadorDeTipo, tiposDeEspecie } from "./tipos.js";

describe("tiposDeEspecie", () => {
	it("da los tipos en minúscula", () => {
		expect(tiposDeEspecie("charmander")).toEqual(["fire"]);
		expect(tiposDeEspecie("bulbasaur")).toEqual(["grass", "poison"]);
	});

	it("una especie desconocida no tiene tipos", () => {
		expect(tiposDeEspecie("noexiste")).toEqual([]);
	});
});

describe("multiplicadorDeTipo", () => {
	it("efectivo, poco efectivo e inmune", () => {
		expect(multiplicadorDeTipo("water", ["fire"])).toBe(2);
		expect(multiplicadorDeTipo("fire", ["water"])).toBe(0.5);
		expect(multiplicadorDeTipo("normal", ["ghost"])).toBe(0);
		expect(multiplicadorDeTipo("electric", ["ground"])).toBe(0);
	});

	it("se combina entre los dos tipos del defensor", () => {
		expect(multiplicadorDeTipo("ground", ["fire", "steel"])).toBe(4);
		expect(multiplicadorDeTipo("fire", ["grass", "poison"])).toBe(2);
		expect(multiplicadorDeTipo("grass", ["grass", "poison"])).toBe(0.25);
		expect(multiplicadorDeTipo("water", ["water", "ground"])).toBe(1);
	});

	it("sin tipos del defensor es neutro", () => {
		expect(multiplicadorDeTipo("fire", [])).toBe(1);
	});
});
