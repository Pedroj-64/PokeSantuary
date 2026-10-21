import { readFileSync } from "node:fs";
import type { NodoMapa, TablaNiveles } from "@santuario/core";
import { describe, expect, it } from "vitest";
import { nivelesDelRival, techoDelPiso, tipoRivalDeNodo } from "./niveles.js";

/** Tabla real del pack (`niveles.json`), tal cual. */
const TABLA = (
	JSON.parse(
		readFileSync(
			new URL("../../../../packs/kanto/niveles.json", import.meta.url),
			"utf8",
		),
	) as { nivel: TablaNiveles }
).nivel;

const nodo = (tipo: NodoMapa["tipo"]): NodoMapa => ({
	id: "1-0",
	capa: 1,
	indice: 0,
	tipo,
	siguientes: [],
});

describe("tipoRivalDeNodo", () => {
	it("traduce los nodos de combate", () => {
		expect(
			(["salvaje", "entrenador", "alfa", "sombrio", "jefe"] as const).map(
				tipoRivalDeNodo,
			),
		).toEqual(["salvaje", "rival", "alfa", "sombrio", "jefe"]);
	});

	it("rechaza los nodos sin combate", () => {
		for (const tipo of ["tienda", "manantial", "evento", "cofre"] as const) {
			expect(() => tipoRivalDeNodo(tipo)).toThrow(RangeError);
		}
	});
});

describe("nivelesDelRival", () => {
	it("el entrenador del piso 1 va a base + 3 (11) y el del piso 2 a 21", () => {
		expect(nivelesDelRival(TABLA, "s", 1, nodo("entrenador"), 3)).toEqual([
			11, 11, 11,
		]);
		expect(nivelesDelRival(TABLA, "s", 2, nodo("entrenador"), 1)).toEqual([21]);
	});

	it("en el jefe el último es el as", () => {
		expect(nivelesDelRival(TABLA, "s", 1, nodo("jefe"), 3)).toEqual([
			12, 12, 14,
		]);
	});

	it("el salvaje añade un extra sorteado y estable por semilla", () => {
		const a = nivelesDelRival(TABLA, "s", 1, nodo("salvaje"), 2);
		expect(nivelesDelRival(TABLA, "s", 1, nodo("salvaje"), 2)).toEqual(a);
		for (const n of a) expect(n).toBeGreaterThanOrEqual(8);
		for (const n of a) expect(n).toBeLessThanOrEqual(10);
	});
});

describe("techoDelPiso", () => {
	it("es el nivel del as del jefe de cada piso", () => {
		expect([1, 2, 3].map((p) => techoDelPiso(TABLA, p as 1 | 2 | 3))).toEqual([
			14, 24, 34,
		]);
	});
});
