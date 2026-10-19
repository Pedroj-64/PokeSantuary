import { describe, expect, it } from "vitest";
import {
	type EntradaDerrota,
	estaFallido,
	llamasIniciales,
	resolverDerrota,
	type TablaFarol,
} from "./farol.js";

const TABLA: TablaFarol = {
	base: 1,
	extraPorRango: [0, 1, 2],
	maximo: 3,
	restaTenue: 1,
	repetibles: ["jefe", "ecos"],
};

function entrada(
	llamas: number,
	psPct: number[],
	fallidos: string[] = [],
): EntradaDerrota {
	return { llamas, psPct, fallidos, nodo: "nodo1", tipoNodo: "salvaje" };
}

describe("llamasIniciales", () => {
	it("rango 0 sin Pacto = 1", () => {
		expect(llamasIniciales(TABLA, { rangoRama: 0, farolTenue: false })).toBe(1);
	});
	it("rango 1 = 2", () => {
		expect(llamasIniciales(TABLA, { rangoRama: 1, farolTenue: false })).toBe(2);
	});
	it("rango 2 = 3", () => {
		expect(llamasIniciales(TABLA, { rangoRama: 2, farolTenue: false })).toBe(3);
	});
	it("rango 0 con Farol tenue = 0 (mínimo 0, nunca negativo)", () => {
		expect(llamasIniciales(TABLA, { rangoRama: 0, farolTenue: true })).toBe(0);
	});
	it("rango 2 con Farol tenue = 2", () => {
		expect(llamasIniciales(TABLA, { rangoRama: 2, farolTenue: true })).toBe(2);
	});
	it("maximo 2 y rango 2 = 2 (el tope va antes de la resta; con tenue = 1)", () => {
		const t: TablaFarol = { ...TABLA, maximo: 2 };
		expect(llamasIniciales(t, { rangoRama: 2, farolTenue: false })).toBe(2);
		expect(llamasIniciales(t, { rangoRama: 2, farolTenue: true })).toBe(1);
	});
	it("rango 3 o -1 o 1.5 lanza", () => {
		for (const malo of [3, -1, 1.5]) {
			expect(() =>
				llamasIniciales(TABLA, {
					rangoRama: malo as number,
					farolTenue: false,
				}),
			).toThrow(RangeError);
		}
	});
});

describe("resolverDerrota", () => {
	it("con 1 llama y un consciente en el banquillo continúa, llamas 0, nodo en fallidos", () => {
		const r = resolverDerrota(TABLA, entrada(1, [0, 0, 50]));
		expect(r.tipo).toBe("continua");
		if (r.tipo !== "continua") throw new Error("no continua");
		expect(r.llamas).toBe(0);
		expect(r.fallidos).toEqual(["nodo1"]);
		expect(r.repetible).toBe(false);
	});
	it("repetible verdadero para jefe y ecos", () => {
		for (const tipoNodo of ["jefe", "ecos"]) {
			const r = resolverDerrota(TABLA, { ...entrada(1, [50, 0, 0]), tipoNodo });
			expect(r.tipo).toBe("continua");
			if (r.tipo !== "continua") throw new Error("no continua");
			expect(r.repetible).toBe(true);
		}
	});
	it("con 0 llamas y conscientes → fin sin-llamas", () => {
		const r = resolverDerrota(TABLA, entrada(0, [50, 0, 0]));
		expect(r).toEqual({ tipo: "fin", motivo: "sin-llamas" });
	});
	it("con llamas pero todos a 0 → fin sin-conscientes", () => {
		const r = resolverDerrota(TABLA, entrada(3, [0, 0, 0]));
		expect(r).toEqual({ tipo: "fin", motivo: "sin-conscientes" });
	});
	it("sin llamas y sin conscientes → sin-conscientes (tiene prioridad)", () => {
		const r = resolverDerrota(TABLA, entrada(0, [0, 0, 0]));
		expect(r).toEqual({ tipo: "fin", motivo: "sin-conscientes" });
	});
	it("un nodo ya fallido no se duplica pero cuesta llama", () => {
		const r = resolverDerrota(TABLA, {
			...entrada(2, [50, 0, 0], ["nodo1"]),
			nodo: "nodo1",
		});
		expect(r.tipo).toBe("continua");
		if (r.tipo !== "continua") throw new Error("no continua");
		expect(r.llamas).toBe(1);
		expect(r.fallidos).toEqual(["nodo1"]);
	});
	it("las validaciones lanzan", () => {
		const base = entrada(1, [50, 0, 0]);
		const mutar = (cambio: Partial<EntradaDerrota>) =>
			expect(() =>
				resolverDerrota(TABLA, { ...base, ...cambio } as EntradaDerrota),
			).toThrow(RangeError);
		mutar({ llamas: -1 });
		mutar({ llamas: 1.5 });
		mutar({ psPct: [] });
		mutar({ psPct: [50, 101] });
		mutar({ psPct: [-5] });
		mutar({ nodo: "" });
		mutar({ tipoNodo: "" });
	});
	it("las entradas congeladas no se mutan y fallidos es un array nuevo", () => {
		const e = Object.freeze(entrada(2, [50, 0, 0], ["nodo0"]));
		const antes = [...e.fallidos];
		const r = resolverDerrota(TABLA, e);
		expect(e.fallidos).toEqual(antes);
		expect(e.llamas).toBe(2);
		expect(r.tipo).toBe("continua");
		if (r.tipo !== "continua") throw new Error("no continua");
		expect(r.fallidos).not.toBe(e.fallidos);
		expect(r.fallidos).toEqual(["nodo0", "nodo1"]);
	});
});

describe("estaFallido", () => {
	it("verdadero si el nodo está en fallidos, falso si no", () => {
		expect(estaFallido(["a", "b"], "b")).toBe(true);
		expect(estaFallido(["a", "b"], "c")).toBe(false);
		expect(estaFallido([], "x")).toBe(false);
	});
	it("nodo vacía lanza", () => {
		expect(() => estaFallido(["a"], "")).toThrow(RangeError);
	});
});
