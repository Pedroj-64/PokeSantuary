import {
	type EstadoExpedicion,
	esNodoDeCombate,
	iniciarExpedicion,
	type TipoNodo,
} from "@santuario/core";
import type { ExpedicionBalance, SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import {
	cerrarCombate,
	destinoTrasCombate,
	dineroDeNodo,
	prepararCombate,
	resultadoDeCombate,
} from "./combateNodo.js";

const set = (especie: string): SetCombate => ({
	especie,
	movimientos: ["tackle"],
	habilidad: "static",
	naturaleza: "Hardy",
});
const SETS = ["a", "b", "c", "d", "e", "f", "g"].map(set);
const BALANCE = {
	recompensa: {
		salvaje: [
			{ min: 5, max: 10 },
			{ min: 8, max: 14 },
			{ min: 12, max: 20 },
		],
		entrenador: [
			{ min: 12, max: 20 },
			{ min: 18, max: 28 },
			{ min: 25, max: 40 },
		],
		alfa: [
			{ min: 20, max: 30 },
			{ min: 30, max: 45 },
			{ min: 40, max: 60 },
		],
		sombrio: [
			{ min: 15, max: 25 },
			{ min: 25, max: 35 },
			{ min: 35, max: 50 },
		],
		jefe: [
			{ min: 40, max: 60 },
			{ min: 60, max: 90 },
			{ min: 100, max: 150 },
		],
	},
} as unknown as ExpedicionBalance;

/** Expedición con el jugador ya dentro de un nodo del tipo pedido (o del primero de combate). */
function dentroDe(
	semilla: string,
	tipo?: TipoNodo,
): [EstadoExpedicion, string] {
	const e = iniciarExpedicion(semilla, ["a", "b", "c"]);
	const nodo = e.mapa.capas
		.flat()
		.find((n) => (tipo ? n.tipo === tipo : esNodoDeCombate(n.tipo)));
	if (!nodo) throw new Error(`el mapa de ${semilla} no tiene nodo ${tipo}`);
	return [{ ...e, actual: nodo.id }, nodo.id];
}

describe("prepararCombate", () => {
	it("deja fuera a los debilitados y arranca a los demás con sus PS", () => {
		const [e0, id] = dentroDe("s1");
		const e = {
			...e0,
			equipo: [
				{ especie: "a", psPct: 40 },
				{ especie: "b", psPct: 0 },
				{ especie: "c", psPct: 100 },
			],
		};
		const p = prepararCombate(e, id, SETS);
		expect(p.vivos).toEqual([0, 2]);
		expect(p.jugador.map((m) => [m.especie, m.psPct])).toEqual([
			["a", 40],
			["c", 100],
		]);
	});

	it("el rival no repite especies del equipo mientras haya otras", () => {
		for (let i = 0; i < 30; i++) {
			const [e, id] = dentroDe(`s${i}`);
			const { rival } = prepararCombate(e, id, SETS);
			for (const m of rival) expect(["a", "b", "c"]).not.toContain(m.especie);
		}
	});

	it("la semilla del combate es función del estado y del nodo", () => {
		const [e, id] = dentroDe("s1");
		expect(prepararCombate(e, id, SETS).semilla).toBe(
			prepararCombate(e, id, SETS).semilla,
		);
		const otro = e.mapa.capas.flat().find((n) => n.id !== id);
		expect(prepararCombate(e, otro?.id ?? "", SETS).semilla).not.toBe(
			prepararCombate(e, id, SETS).semilla,
		);
	});

	it("rechaza un nodo que no es de combate, uno inexistente, un equipo sin vivos o un set ausente", () => {
		const [e, id] = dentroDe("s1");
		const [conTienda, tienda] = dentroDe("s1", "tienda");
		expect(() => prepararCombate(conTienda, tienda, SETS)).toThrow(RangeError);
		expect(() => prepararCombate(e, "9-9", SETS)).toThrow(RangeError);
		const caidos = {
			...e,
			equipo: e.equipo.map((m) => ({ ...m, psPct: 0 })),
		};
		expect(() => prepararCombate(caidos, id, SETS)).toThrow(RangeError);
		expect(() =>
			prepararCombate(
				e,
				id,
				SETS.filter((s) => s.especie !== "a"),
			),
		).toThrow(RangeError);
	});
});

describe("resultadoDeCombate", () => {
	it("devuelve los PS finales a su sitio del equipo y deja a los debilitados a 0", () => {
		const [e0] = dentroDe("s1");
		const e = {
			...e0,
			equipo: [
				{ especie: "a", psPct: 40 },
				{ especie: "b", psPct: 0 },
				{ especie: "c", psPct: 100 },
			],
		};
		const r = resultadoDeCombate(
			e,
			[0, 2],
			"jugador",
			[{ psPct: 15 }, { psPct: 0 }],
			12,
		);
		expect(r).toEqual({ victoria: true, psPct: [15, 0, 0], dinero: 12 });
	});

	it("en derrota o empate no hay victoria ni dinero", () => {
		const [e] = dentroDe("s1");
		const finales = [{ psPct: 0 }, { psPct: 0 }, { psPct: 0 }];
		for (const ganador of ["rival", "empate"] as const) {
			const r = resultadoDeCombate(e, [0, 1, 2], ganador, finales, 30);
			expect(r.victoria).toBe(false);
			expect(r.dinero).toBe(0);
		}
	});

	it("rechaza unos PS finales que no cuadran con los que entraron", () => {
		const [e] = dentroDe("s1");
		expect(() =>
			resultadoDeCombate(e, [0, 1, 2], "jugador", [{ psPct: 10 }], 5),
		).toThrow(RangeError);
	});
});

describe("dineroDeNodo", () => {
	it("cae dentro del rango del tipo y el piso y es determinista", () => {
		for (let i = 0; i < 100; i++) {
			const [e, id] = dentroDe(`s${i}`);
			const tipo = e.mapa.capas.flat().find((n) => n.id === id)?.tipo;
			const d = dineroDeNodo(BALANCE, e, id);
			const rango = BALANCE.recompensa[tipo as "salvaje"][0];
			expect(d).toBeGreaterThanOrEqual(rango.min);
			expect(d).toBeLessThanOrEqual(rango.max);
			expect(dineroDeNodo(BALANCE, e, id)).toBe(d);
		}
	});
});

describe("rival en el resultado", () => {
	it("lleva la especie del rival solo si se conoce", () => {
		const [e] = dentroDe("s5");
		const fin = [{ psPct: 50 }, { psPct: 50 }, { psPct: 50 }];
		const con = resultadoDeCombate(e, [0, 1, 2], "jugador", fin, 7, "gastly");
		expect(con.rival).toBe("gastly");
		expect("rival" in resultadoDeCombate(e, [0, 1, 2], "jugador", fin, 7)).toBe(
			false,
		);
		expect(
			"rival" in resultadoDeCombate(e, [0, 1, 2], "jugador", fin, 7, ""),
		).toBe(false);
	});
});

describe("equipo de más de 3", () => {
	it("solo entran los 3 primeros vivos y el banquillo conserva sus PS", () => {
		const [base, id] = dentroDe("s5");
		const e = {
			...base,
			equipo: ["a", "b", "c", "d", "e", "f"].map((especie, i) => ({
				especie,
				psPct: i === 0 ? 0 : 50 + i,
			})),
		};
		const p = prepararCombate(e, id, SETS);
		expect(p.vivos).toEqual([1, 2, 3]);
		expect(p.jugador.map((m) => m.especie)).toEqual(["b", "c", "d"]);
		const r = resultadoDeCombate(
			e,
			p.vivos,
			"jugador",
			[{ psPct: 10 }, { psPct: 20 }, { psPct: 30 }],
			0,
		);
		expect(r.psPct).toEqual([0, 10, 20, 30, 54, 55]);
	});
});

describe("runas en el combate", () => {
	it("la runa F sube el dinero un 25 %", () => {
		const [e, id] = dentroDe("s3");
		const base = dineroDeNodo(BALANCE, e, id);
		const con = dineroDeNodo(BALANCE, { ...e, runas: ["F"] }, id);
		expect(con).toBe(Math.round(base * 1.25));
		expect(con).toBeGreaterThan(base);
	});

	it("la runa C cura al más herido al ganar, pero no al perder", () => {
		const [e] = dentroDe("s3");
		const equipo = e.equipo.map((m, i) => ({ ...m, psPct: i === 0 ? 40 : 90 }));
		const con = { ...e, equipo, runas: ["C" as const] };
		const gana = { victoria: true, psPct: [40, 90, 90], dinero: 0 };
		expect(cerrarCombate(con, gana).equipo[0]?.psPct).toBe(55);
		expect(cerrarCombate(e, gana).equipo[0]?.psPct).toBe(40);
		const pierde = { victoria: false, psPct: [0, 0, 0], dinero: 0 };
		expect(cerrarCombate(con, pierde).estado).toBe("derrota");
	});
});

describe("destinoTrasCombate", () => {
	it("sigue en el mapa mientras la expedición está en curso y termina en la pantalla final", () => {
		const [e] = dentroDe("s1");
		expect(destinoTrasCombate(e)).toBe("Mapa");
		expect(destinoTrasCombate({ ...e, estado: "derrota" })).toBe(
			"FinExpedicion",
		);
		expect(destinoTrasCombate({ ...e, estado: "victoria" })).toBe(
			"FinExpedicion",
		);
	});
});
