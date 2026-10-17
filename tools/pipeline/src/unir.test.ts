import { describe, expect, it } from "vitest";
import type { Recorte } from "./recortar.js";
import { unir } from "./unir.js";

const trabajos = {
	normal: ["transportar"],
	fire: ["cocinar"],
	water: ["regar"],
	electric: ["generar-energia"],
	grass: ["cultivar"],
	ice: ["conservar"],
	fighting: ["entrenar"],
	poison: ["compost"],
	ground: ["minar"],
	flying: ["transportar"],
	psychic: ["investigar"],
	bug: ["seda"],
	rock: ["minar"],
	ghost: ["vigilar"],
	dragon: ["proteger-arbol"],
	dark: ["vigilar"],
	steel: ["forjar"],
	fairy: ["investigar"],
};

const pikachu: Recorte = {
	id: "pikachu",
	dex: 25,
	tipos: ["electric"],
	nombre: { es: "Pikachu", en: "Pikachu" },
	descripcion: { es: "Ratón.", en: "Mouse." },
	gruposHuevo: ["field", "fairy"],
	tasaCaptura: 190,
};

describe("unir", () => {
	it("une con @pkmn/data y añade los trabajos de sus tipos sin repetir", () => {
		expect(unir(pikachu, trabajos).trabajos).toEqual(["generar-energia"]);
		const doble = unir(
			{ ...pikachu, id: "gastly", dex: 92, tipos: ["ghost", "poison"] },
			trabajos,
		);
		expect(doble.trabajos).toEqual(["vigilar", "compost"]);
	});

	it("lanza si el slug no existe en @pkmn/data", () => {
		expect(() => unir({ ...pikachu, id: "noexiste" }, trabajos)).toThrow(
			/noexiste/,
		);
	});

	it("lanza si los tipos no coinciden entre fuentes", () => {
		expect(() => unir({ ...pikachu, tipos: ["water"] }, trabajos)).toThrow(
			/tipos/,
		);
	});

	it("lanza si el número de dex no coincide", () => {
		expect(() => unir({ ...pikachu, dex: 26 }, trabajos)).toThrow(/dex/);
	});
});
