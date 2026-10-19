import { describe, expect, it } from "vitest";
import {
	aprender,
	aprenderTodos,
	type EntradaAprendizaje,
	type Movimientos,
	movimientosIniciales,
	nuevosMovimientos,
} from "./aprender.js";

function congelarProfundamente(valor: unknown): unknown {
	if (Array.isArray(valor)) {
		return Object.freeze(valor.map(congelarProfundamente));
	}
	if (valor !== null && typeof valor === "object") {
		return Object.freeze(
			Object.fromEntries(
				Object.entries(valor).map(([clave, v]) => [
					clave,
					congelarProfundamente(v),
				]),
			),
		);
	}
	return valor;
}

function congelar<T>(valor: T): T {
	return congelarProfundamente(valor) as T;
}

// Lista de ejemplo del enunciado: orden por nivel y luego movimiento.
const LISTA: readonly EntradaAprendizaje[] = congelar([
	{ nivel: 1, movimiento: "a" },
	{ nivel: 1, movimiento: "b" },
	{ nivel: 5, movimiento: "c" },
	{ nivel: 9, movimiento: "d" },
	{ nivel: 12, movimiento: "e" },
	{ nivel: 20, movimiento: "f" },
]);

describe("movimientosIniciales", () => {
	it("devuelve los últimos cuatro hasta el nivel dado, en orden", () => {
		expect(movimientosIniciales(LISTA, 1)).toEqual(["a", "b"]);
		expect(movimientosIniciales(LISTA, 9)).toEqual(["a", "b", "c", "d"]);
		expect(movimientosIniciales(LISTA, 12)).toEqual(["b", "c", "d", "e"]);
		expect(movimientosIniciales(LISTA, 100)).toEqual(["c", "d", "e", "f"]);
	});

	it("devuelve [] con lista vacía o sin entradas hasta ese nivel", () => {
		expect(movimientosIniciales([], 5)).toEqual([]);
		const desde5: readonly EntradaAprendizaje[] = congelar([
			{ nivel: 5, movimiento: "c" },
		]);
		expect(movimientosIniciales(desde5, 1)).toEqual([]);
	});

	it("no repite y se queda con la aparición más reciente", () => {
		const repetida: readonly EntradaAprendizaje[] = congelar([
			{ nivel: 1, movimiento: "a" },
			{ nivel: 2, movimiento: "b" },
			{ nivel: 3, movimiento: "a" },
			{ nivel: 4, movimiento: "c" },
			{ nivel: 5, movimiento: "d" },
		]);
		expect(movimientosIniciales(repetida, 5)).toEqual(["b", "a", "c", "d"]);
	});

	it("lanza para niveles no enteros o menores que 1", () => {
		for (const malo of [0, -1, 1.5, Number.NaN]) {
			expect(() => movimientosIniciales(LISTA, malo)).toThrow(RangeError);
		}
	});

	it("no muta la lista", () => {
		const antes = structuredClone(LISTA);
		movimientosIniciales(LISTA, 100);
		expect(LISTA).toEqual(antes);
	});
});

describe("nuevosMovimientos", () => {
	it("devuelve los de los niveles intermedios, en orden", () => {
		expect(nuevosMovimientos(LISTA, 4, 12)).toEqual(["c", "d", "e"]);
		expect(nuevosMovimientos(LISTA, 0, 1)).toEqual(["a", "b"]);
	});

	it("no repite movimientos", () => {
		const repetida: readonly EntradaAprendizaje[] = congelar([
			{ nivel: 2, movimiento: "a" },
			{ nivel: 3, movimiento: "a" },
			{ nivel: 4, movimiento: "b" },
		]);
		expect(nuevosMovimientos(repetida, 1, 4)).toEqual(["a", "b"]);
	});

	it("devuelve [] si los niveles son iguales", () => {
		expect(nuevosMovimientos(LISTA, 12, 12)).toEqual([]);
		expect(nuevosMovimientos(LISTA, 0, 0)).toEqual([]);
	});

	it("lanza si nivelDespues < nivelAntes o no son enteros", () => {
		expect(() => nuevosMovimientos(LISTA, 12, 11)).toThrow(RangeError);
		expect(() => nuevosMovimientos(LISTA, 1.5, 3)).toThrow(RangeError);
		expect(() => nuevosMovimientos(LISTA, 0, Number.NaN)).toThrow(RangeError);
	});

	it("no muta la lista", () => {
		const antes = structuredClone(LISTA);
		nuevosMovimientos(LISTA, 0, 100);
		expect(LISTA).toEqual(antes);
	});
});

describe("aprender", () => {
	it("añade al final mientras hay hueco", () => {
		const m: Movimientos = congelar({ activos: ["a"], recordables: ["b"] });
		const r = aprender(m, "c");
		expect(r).toEqual({
			tipo: "hecho",
			movimientos: { activos: ["a", "c"], recordables: ["b"] },
		});
	});

	it("quita de recordables el que se vuelve a aprender", () => {
		const m: Movimientos = congelar({
			activos: ["a"],
			recordables: ["b", "c"],
		});
		const r = aprender(m, "b");
		expect(r).toEqual({
			tipo: "hecho",
			movimientos: { activos: ["a", "b"], recordables: ["c"] },
		});
	});

	it("con 4 activos y sin olvidar pide elegir sin cambiar nada", () => {
		const m: Movimientos = congelar({
			activos: ["a", "b", "c", "d"],
			recordables: ["e"],
		});
		const antes = structuredClone(m);
		expect(aprender(m, "f")).toEqual({
			tipo: "elegir",
			candidatos: ["a", "b", "c", "d"],
		});
		expect(m).toEqual(antes);
	});

	it("sustituye en la misma posición y ordena recordables", () => {
		const m: Movimientos = congelar({
			activos: ["a", "b", "c", "d"],
			recordables: ["e"],
		});
		expect(aprender(m, "f", "b")).toEqual({
			tipo: "hecho",
			movimientos: { activos: ["a", "f", "c", "d"], recordables: ["b", "e"] },
		});
	});

	it("saca de recordables el nuevo y no duplica el olvidado", () => {
		const m: Movimientos = congelar({
			activos: ["a", "b", "c", "d"],
			recordables: ["a", "e", "f"],
		});
		expect(aprender(m, "f", "a")).toEqual({
			tipo: "hecho",
			movimientos: { activos: ["f", "b", "c", "d"], recordables: ["a", "e"] },
		});
	});

	it("lanza si nuevo ya está activo", () => {
		const m: Movimientos = congelar({ activos: ["a"], recordables: [] });
		expect(() => aprender(m, "a")).toThrow(RangeError);
	});

	it("lanza si se olvida algo que no está activo", () => {
		const m: Movimientos = congelar({
			activos: ["a", "b", "c", "d"],
			recordables: [],
		});
		expect(() => aprender(m, "e", "z")).toThrow(RangeError);
	});

	it("lanza si se olvida habiendo hueco", () => {
		const m: Movimientos = congelar({ activos: ["a"], recordables: [] });
		expect(() => aprender(m, "b", "a")).toThrow(RangeError);
	});

	it("no muta las entradas y devuelve listas nuevas", () => {
		const m: Movimientos = congelar({ activos: ["a"], recordables: ["b"] });
		const antes = structuredClone(m);
		const r = aprender(m, "c");
		expect(m).toEqual(antes);
		if (r.tipo !== "hecho") throw new Error("se esperaba 'hecho'");
		expect(r.movimientos.activos).not.toBe(m.activos);
		expect(r.movimientos.recordables).not.toBe(m.recordables);
	});
});

describe("aprenderTodos", () => {
	it("aprende mientras haya hueco y deja pendiente lo que exige decisión", () => {
		const m: Movimientos = congelar({ activos: ["a", "b"], recordables: [] });
		const r = aprenderTodos(m, ["c", "d", "e"]);
		expect(r).toEqual({
			movimientos: { activos: ["a", "b", "c", "d"], recordables: [] },
			pendientes: ["e"],
		});
	});

	it("con 4 activos deja todos pendientes", () => {
		const m: Movimientos = congelar({
			activos: ["a", "b", "c", "d"],
			recordables: [],
		});
		expect(aprenderTodos(m, ["e", "f"])).toEqual({
			movimientos: { activos: ["a", "b", "c", "d"], recordables: [] },
			pendientes: ["e", "f"],
		});
	});

	it("ignora en silencio los que ya están activos", () => {
		const m: Movimientos = congelar({
			activos: ["a", "b", "c", "d"],
			recordables: [],
		});
		expect(aprenderTodos(m, ["a", "e"]).pendientes).toEqual(["e"]);
		const hueco: Movimientos = congelar({ activos: ["a"], recordables: [] });
		expect(aprenderTodos(hueco, ["a", "b"])).toEqual({
			movimientos: { activos: ["a", "b"], recordables: [] },
			pendientes: [],
		});
	});

	it("quita de recordables al aprender con hueco", () => {
		const m: Movimientos = congelar({
			activos: ["a"],
			recordables: ["b", "c"],
		});
		expect(aprenderTodos(m, ["b"])).toEqual({
			movimientos: { activos: ["a", "b"], recordables: ["c"] },
			pendientes: [],
		});
	});

	it("no muta entradas ni la lista de nuevos y devuelve listas nuevas", () => {
		const m: Movimientos = congelar({ activos: ["a"], recordables: ["b"] });
		const nuevos = congelar(["c", "d"]);
		const antesM = structuredClone(m);
		const antesNuevos = structuredClone(nuevos);
		const r = aprenderTodos(m, nuevos);
		expect(m).toEqual(antesM);
		expect(nuevos).toEqual(antesNuevos);
		expect(r.movimientos.activos).not.toBe(m.activos);
		expect(r.pendientes).not.toBe(nuevos);
	});
});
