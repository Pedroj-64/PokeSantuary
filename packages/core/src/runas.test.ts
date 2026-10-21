import { describe, expect, it } from "vitest";

/** JSON canónico congelado de `resolverMisterio(["?", "?"], "dorada", 2)`. */
const MISTERIO_DORADO = `["A","S"]`;

import {
	anadirRuna,
	type IdRuna,
	MAX_RUNAS,
	type Modificadores,
	modificadores,
	opcionesDeRuna,
	resolverMisterio,
} from "./runas.js";

/** Modificadores sin ninguna runa. */
const NEUTROS: Modificadores = {
	multDanoPrimerMovimiento: 1,
	curaPostCombatePct: 0,
	multDinero: 1,
	opcionesTiendaExtra: 0,
	bonusRendicionSombria: 0,
};

/** Runas que aportan efecto. */
const REALES: readonly IdRuna[] = ["A", "C", "F", "S"];

/** Congela en profundidad para detectar mutaciones. */
function congelar<T>(valor: T): T {
	if (valor === null || typeof valor !== "object") return valor;
	Object.freeze(valor);
	for (const hijo of Object.values(valor as Record<string, unknown>)) {
		congelar(hijo);
	}
	return valor;
}

describe("modificadores", () => {
	it("sin runas deja los valores neutros", () => {
		expect(modificadores([])).toEqual(NEUTROS);
	});

	it("cada runa aporta su efecto", () => {
		expect(modificadores(["A"])).toEqual({
			...NEUTROS,
			multDanoPrimerMovimiento: 1.3,
		});
		expect(modificadores(["C"])).toEqual({
			...NEUTROS,
			curaPostCombatePct: 15,
		});
		expect(modificadores(["F"])).toEqual({
			...NEUTROS,
			multDinero: 1.25,
			opcionesTiendaExtra: 1,
		});
		expect(modificadores(["S"])).toEqual({
			...NEUTROS,
			bonusRendicionSombria: 0.2,
		});
		expect(modificadores(["?"])).toEqual(NEUTROS);
	});

	it("combina las runas que hay en la lista", () => {
		expect(modificadores(["A", "F", "S"])).toEqual({
			multDanoPrimerMovimiento: 1.3,
			curaPostCombatePct: 0,
			multDinero: 1.25,
			opcionesTiendaExtra: 1,
			bonusRendicionSombria: 0.2,
		});
		expect(modificadores(["A", "C", "F", "S", "?"])).toEqual({
			multDanoPrimerMovimiento: 1.3,
			curaPostCombatePct: 15,
			multDinero: 1.25,
			opcionesTiendaExtra: 1,
			bonusRendicionSombria: 0.2,
		});
	});

	it("rechaza una runa repetida", () => {
		expect(() => modificadores(["A", "A"])).toThrow(RangeError);
		expect(() => modificadores(["?", "?"])).toThrow(RangeError);
		expect(() => modificadores(["S", "F", "S"])).toThrow(RangeError);
		expect(() => modificadores(["X" as IdRuna])).toThrow(RangeError);
	});
});

describe("anadirRuna", () => {
	it("devuelve un arreglo nuevo sin tocar el de entrada", () => {
		const inicial = congelar<IdRuna[]>(["A", "C"]);
		const despues = anadirRuna(inicial, "F");
		expect(despues).toEqual(["A", "C", "F"]);
		expect(inicial).toEqual(["A", "C"]);
		expect(despues).not.toBe(inicial);
		expect(anadirRuna([], "?")).toEqual(["?"]);
	});

	it("rechaza una runa que ya está", () => {
		expect(() => anadirRuna(["A"], "A")).toThrow(RangeError);
		expect(() => anadirRuna(["?"], "?")).toThrow(RangeError);
	});

	it(`rechaza pasar de ${MAX_RUNAS} runas`, () => {
		const lleno: IdRuna[] = ["A", "C", "F", "S", "?"];
		expect(lleno).toHaveLength(MAX_RUNAS);
		expect(() => anadirRuna(lleno, "A")).toThrow(RangeError);
		expect(anadirRuna(lleno.slice(0, 4), "?")).toHaveLength(MAX_RUNAS);
		// Con la lista llena y una runa que no está dentro, choca el tope.
		const llenoSinLaNueva: IdRuna[] = ["A", "A", "C", "F", "S"];
		expect(llenoSinLaNueva).toHaveLength(MAX_RUNAS);
		expect(() => anadirRuna(llenoSinLaNueva, "?")).toThrow(RangeError);
	});
});

describe("resolverMisterio", () => {
	it("sustituye cada ? por una runa que no esté ya en la lista", () => {
		const resuelto = resolverMisterio(["A", "?"], "s1", 1);
		expect(resuelto).toHaveLength(2);
		expect(resuelto[0]).toBe("A");
		expect(REALES).toContain(resuelto[1]);
		expect(resuelto[1]).not.toBe("A");

		expect(resolverMisterio(["A", "C", "F", "?"], "s1", 1)).toEqual([
			"A",
			"C",
			"F",
			"S",
		]);
	});

	it("conserva el orden y no muta la entrada", () => {
		const inicial = congelar<IdRuna[]>(["C", "?", "S"]);
		const resuelto = resolverMisterio(inicial, "s2", 2);
		expect(resuelto).toHaveLength(3);
		expect(resuelto[0]).toBe("C");
		expect(resuelto[2]).toBe("S");
		// El hueco solo admite A o F: C y S ya están cogidas.
		expect(["A", "F"]).toContain(resuelto[1]);
		expect(inicial).toEqual(["C", "?", "S"]);
	});

	it("deja el ? tal cual cuando ya no queda hueco", () => {
		expect(resolverMisterio(["A", "C", "F", "S", "?"], "s3", 3)).toEqual([
			"A",
			"C",
			"F",
			"S",
			"?",
		]);
	});

	it("es determinista", () => {
		for (const semilla of ["d1", "d2", "ñandú"]) {
			expect(JSON.stringify(resolverMisterio(["?", "?"], semilla, 1))).toBe(
				JSON.stringify(resolverMisterio(["?", "?"], semilla, 1)),
			);
		}
	});

	it("repetición congelada: el misterio de 'dorada' no cambia", () => {
		expect(JSON.stringify(resolverMisterio(["?", "?"], "dorada", 2))).toBe(
			MISTERIO_DORADO,
		);
	});

	it("en 200 semillas nunca repite runa ni deja huecos sin usar", () => {
		for (let i = 0; i < 200; i++) {
			const semilla = `m${i}`;

			const uno = resolverMisterio(["?", "?"], semilla, 1);
			expect(new Set(uno).size).toBe(2);
			for (const runa of uno) expect(REALES).toContain(runa);

			const cuatro = resolverMisterio(["?", "?", "?", "?"], semilla, 2);
			expect([...cuatro].sort()).toEqual(["A", "C", "F", "S"]);

			const conA = resolverMisterio(["A", "?"], semilla, 3);
			expect(conA[0]).toBe("A");
			expect(conA[1]).not.toBe("A");
			expect(conA[1]).not.toBe("?");

			const casiLleno = resolverMisterio(["A", "C", "F", "?", "?"], semilla, 1);
			expect(casiLleno).toEqual(["A", "C", "F", "S", "?"]);
		}
	});
});

describe("opcionesDeRuna", () => {
	it("ofrece hasta la cantidad pedida de runas con efecto que aún no tienes, sin repetir", () => {
		const o = opcionesDeRuna("s1", [], 3);
		expect(o).toHaveLength(3);
		expect(new Set(o).size).toBe(3);
		for (const r of o) expect(["A", "C", "F", "S"]).toContain(r);
	});

	it("excluye las que ya tienes y se queda corta si no hay más", () => {
		const o = opcionesDeRuna("s1", ["A", "C"], 3);
		expect(o).toHaveLength(2);
		expect([...o].sort()).toEqual(["F", "S"]);
		expect(opcionesDeRuna("s1", ["A", "C", "F", "S"], 3)).toEqual([]);
	});

	it("es determinista por semilla y no muta la mochila", () => {
		const tengo = Object.freeze(["F"] as const);
		expect(opcionesDeRuna("s1", tengo, 3)).toEqual(
			opcionesDeRuna("s1", tengo, 3),
		);
		const distintas = new Set(
			["a", "b", "c", "d", "e", "f"].map((s) =>
				opcionesDeRuna(s, [], 3).join(""),
			),
		);
		expect(distintas.size).toBeGreaterThan(1);
	});
});
