import { describe, expect, it } from "vitest";
import { evolucionesDe, nivelEtapa } from "./evolucion.js";

describe("evolucionesDe", () => {
	it("lee las evoluciones por nivel de las especies base del pack", () => {
		expect(evolucionesDe("bulbasaur")).toEqual([
			{ a: "ivysaur", condicion: { tipo: "nivel", nivel: 16 } },
		]);
		expect(evolucionesDe("charmander")).toEqual([
			{ a: "charmeleon", condicion: { tipo: "nivel", nivel: 16 } },
		]);
		expect(evolucionesDe("squirtle")).toEqual([
			{ a: "wartortle", condicion: { tipo: "nivel", nivel: 16 } },
		]);
		expect(evolucionesDe("abra")).toEqual([
			{ a: "kadabra", condicion: { tipo: "nivel", nivel: 16 } },
		]);
		expect(evolucionesDe("zubat")).toEqual([
			{ a: "golbat", condicion: { tipo: "nivel", nivel: 22 } },
		]);
		expect(evolucionesDe("machop")).toEqual([
			{ a: "machoke", condicion: { tipo: "nivel", nivel: 28 } },
		]);
		expect(evolucionesDe("geodude")).toEqual([
			{ a: "graveler", condicion: { tipo: "nivel", nivel: 25 } },
		]);
		expect(evolucionesDe("gastly")).toEqual([
			{ a: "haunter", condicion: { tipo: "nivel", nivel: 25 } },
		]);
	});

	it("incluye las formas regionales como slug con guion", () => {
		expect(evolucionesDe("pikachu")).toEqual([
			{ a: "raichu", condicion: { tipo: "objeto", objeto: "thunder-stone" } },
			{
				a: "raichu-alola",
				condicion: { tipo: "objeto", objeto: "thunder-stone" },
			},
		]);
	});

	it("lee las ocho evoluciones de eevee", () => {
		const lista = evolucionesDe("eevee");
		expect(lista).toHaveLength(8);
		expect(lista).toContainEqual({
			a: "vaporeon",
			condicion: { tipo: "objeto", objeto: "water-stone" },
		});
		expect(lista).toContainEqual({
			a: "jolteon",
			condicion: { tipo: "objeto", objeto: "thunder-stone" },
		});
		expect(lista).toContainEqual({
			a: "flareon",
			condicion: { tipo: "objeto", objeto: "fire-stone" },
		});
		expect(lista).toContainEqual({
			a: "leafeon",
			condicion: { tipo: "objeto", objeto: "leaf-stone" },
		});
		expect(lista).toContainEqual({
			a: "glaceon",
			condicion: { tipo: "objeto", objeto: "ice-stone" },
		});
		expect(lista).toContainEqual({
			a: "espeon",
			condicion: { tipo: "amistad", momento: "dia" },
		});
		expect(lista).toContainEqual({
			a: "umbreon",
			condicion: { tipo: "amistad", momento: "noche" },
		});
		expect(lista).toContainEqual({
			a: "sylveon",
			condicion: {
				tipo: "otra",
				detalle: "with a Fairy-type move and two levels of Affection",
			},
		});
		expect(lista).toEqual([...lista].sort((x, y) => (x.a < y.a ? -1 : 1)));
	});

	it("mapea amistad e intercambio sin datos opcionales", () => {
		expect(evolucionesDe("golbat")).toEqual([
			{ a: "crobat", condicion: { tipo: "amistad" } },
		]);
		expect(evolucionesDe("kadabra")).toEqual([
			{ a: "alakazam", condicion: { tipo: "intercambio" } },
		]);
	});

	it("devuelve lista vacía para una especie sin evoluciones", () => {
		expect(evolucionesDe("alakazam")).toEqual([]);
	});

	it("lanza un error si la especie no existe", () => {
		expect(() => evolucionesDe("noexiste")).toThrow(/noexiste/);
	});
});

describe("nivelEtapa", () => {
	it("da el nivel de la etapa según el GDD §7.2", () => {
		expect(nivelEtapa("bulbasaur")).toBe(0);
		expect(nivelEtapa("ivysaur")).toBe(16);
		expect(nivelEtapa("venusaur")).toBe(32);
		expect(nivelEtapa("golbat")).toBe(22);
		expect(nivelEtapa("crobat")).toBe(32);
		expect(nivelEtapa("raichu")).toBe(10);
	});

	it("lanza un error si la especie no existe", () => {
		expect(() => nivelEtapa("noexiste")).toThrow(/noexiste/);
	});
});
