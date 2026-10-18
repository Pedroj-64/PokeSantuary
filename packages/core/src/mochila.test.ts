import { describe, expect, it } from "vitest";
import { iniciarExpedicion } from "./expedicion.js";
import {
	comprarArticulo,
	cuantos,
	gastar,
	totalBayas,
	usarBaya,
	usarBayaAlMasHerido,
} from "./mochila.js";

const base = () => ({
	...iniciarExpedicion("m", ["bulbasaur", "charmander"]),
	dinero: 100,
});
const BALL = { id: "poke-ball", tipo: "ball", precio: 20 } as const;
const BAYA = { id: "baya-zidra", tipo: "baya", precio: 30 } as const;

describe("mochila", () => {
	it("comprar descuenta el precio del piso y suma una unidad", () => {
		const e = comprarArticulo(base(), BALL);
		expect(e.dinero).toBe(80);
		expect(cuantos(e, "poke-ball")).toBe(1);
		expect(cuantos(comprarArticulo(e, BALL), "poke-ball")).toBe(2);
	});

	it("en el piso 2 el precio lleva el recargo del 25 %", () => {
		const e = comprarArticulo({ ...base(), piso: 2 }, BALL);
		expect(e.dinero).toBe(75);
	});

	it("sin dinero suficiente lanza y no cambia nada", () => {
		const pobre = { ...base(), dinero: 10 };
		expect(() => comprarArticulo(pobre, BALL)).toThrow(RangeError);
		expect(pobre.dinero).toBe(10);
	});

	it("gastar quita una unidad y sin existencias lanza", () => {
		const e = comprarArticulo(base(), BALL);
		const g = gastar(e, "poke-ball");
		expect(cuantos(g, "poke-ball")).toBe(0);
		expect("poke-ball" in g.mochila).toBe(false);
		expect(() => gastar(g, "poke-ball")).toThrow(RangeError);
	});

	it("la baya cura a un vivo sin pasar de 100 y no revive", () => {
		let e = comprarArticulo(comprarArticulo(base(), BAYA), BAYA);
		e = {
			...e,
			equipo: [
				{ especie: "bulbasaur", psPct: 70 },
				{ especie: "charmander", psPct: 0 },
			],
		};
		const curado = usarBaya(e, "baya-zidra", 0);
		expect(curado.equipo[0]?.psPct).toBe(100);
		expect(cuantos(curado, "baya-zidra")).toBe(1);
		expect(() => usarBaya(e, "baya-zidra", 1)).toThrow(/revive/);
		expect(() => usarBaya(e, "poke-ball", 0)).toThrow(/no es una baya/);
	});

	it("la baya rápida elige la más floja y el más herido, y no hace nada sin heridos", () => {
		let e = comprarArticulo(comprarArticulo(base(), BAYA), {
			id: "baya-aranja",
			tipo: "baya",
			precio: 15,
		});
		e = {
			...e,
			equipo: [
				{ especie: "bulbasaur", psPct: 60 },
				{ especie: "charmander", psPct: 30 },
			],
		};
		expect(totalBayas(e)).toBe(2);
		const u = usarBayaAlMasHerido(e);
		expect(u.equipo.map((m) => m.psPct)).toEqual([60, 55]);
		expect(cuantos(u, "baya-aranja")).toBe(0);
		const sano = { ...e, equipo: e.equipo.map((m) => ({ ...m, psPct: 100 })) };
		expect(usarBayaAlMasHerido(sano)).toBe(sano);
		expect(usarBayaAlMasHerido(base())).toEqual(base());
	});
});
