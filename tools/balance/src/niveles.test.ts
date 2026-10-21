import {
	crearRng,
	type EstadoExpedicion,
	iniciarExpedicion,
	type MiembroExp,
} from "@santuario/core";
import type { SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { cargarDatosPack } from "./datos.js";
import {
	contextoDeProgresion,
	equipoConNiveles,
	type ProgresionSimulacion,
	setsConEvoluciones,
	techoDelPiso,
	tipoRivalDeNodo,
	trasVictoria,
} from "./niveles.js";
import { poderDeMovimientos } from "./politica.js";

function congelar<T>(valor: T): T {
	if (Array.isArray(valor)) {
		return Object.freeze(valor.map((v) => congelar(v))) as T;
	}
	if (valor !== null && typeof valor === "object") {
		const copia: Record<string, unknown> = {};
		for (const [clave, v] of Object.entries(valor)) copia[clave] = congelar(v);
		return Object.freeze(copia) as T;
	}
	return valor;
}

function miembro(especie: string, extra: Partial<MiembroExp> = {}): MiembroExp {
	return { especie, psPct: 100, ...extra };
}

function expedicion(equipo: MiembroExp[]): EstadoExpedicion {
	return {
		...iniciarExpedicion(
			"balance",
			equipo.map((m) => m.especie),
		),
		equipo,
	};
}

const cargado = cargarDatosPack({ progresion: true });
const PROG = cargado.progresion;
if (PROG === undefined) throw new Error("el pack no cargó la progresión");

const CTX = contextoDeProgresion(PROG);

const CON_CHARMELEON: ProgresionSimulacion = congelar({
	...PROG,
	aprendizaje: {
		...PROG.aprendizaje,
		charmeleon: [{ nivel: 1, movimiento: "growl" }],
	},
	evoluciones: {
		...PROG.evoluciones,
		charmeleon: { nivelEtapa: 16, evoluciones: [] },
	},
});

describe("cargarDatosPack", () => {
	it("solo activa la progresión si se pide", () => {
		expect(cargarDatosPack().progresion).toBeUndefined();
		expect(cargarDatosPack({ progresion: true }).progresion).toBeDefined();
		expect(
			cargarDatosPack({ progresion: true }).progresion?.nivelGimnasio,
		).toBe(0);
		expect(
			cargarDatosPack({ progresion: true, nivelGimnasio: 3 }).progresion
				?.nivelGimnasio,
		).toBe(3);
	});

	it("adjunta el poder de los movimientos solo con la política", () => {
		const sinPolitica = cargarDatosPack({ progresion: true });
		const conPolitica = cargarDatosPack({
			progresion: true,
			politica: true,
		});
		expect(sinPolitica.progresion?.poder).toBeUndefined();
		expect(conPolitica.progresion?.poder?.["thunder-shock"]).toBe(40);
		expect(conPolitica.progresion?.poder?.["thunder-wave"]).toBe(0);
	});
});

describe("equipoConNiveles", () => {
	it("con gimnasio 0, las formas base salen a nivel 8 con sus movimientos iniciales", () => {
		const antes = expedicion([miembro("charmander"), miembro("bulbasaur")]);
		const r = equipoConNiveles(antes, PROG);
		expect(r.equipo).toEqual([
			{
				especie: "charmander",
				psPct: 100,
				nivel: 8,
				movimientos: ["growl", "scratch", "ember", "smokescreen"],
			},
			{
				especie: "bulbasaur",
				psPct: 100,
				nivel: 8,
				movimientos: ["growl", "tackle", "vine-whip", "growth"],
			},
		]);
		expect(r).not.toBe(antes);
		expect(antes.equipo[0]).toEqual({ especie: "charmander", psPct: 100 });
	});

	it("usa el nivelEtapa de la especie para el nivel de salida", () => {
		const r = equipoConNiveles(
			expedicion([miembro("charmeleon")]),
			CON_CHARMELEON,
		);
		expect(r.equipo[0]?.nivel).toBe(14);
		expect(r.equipo[0]?.movimientos).toEqual(["growl"]);
	});

	it("lanza con el nombre de la especie si falta en los datos", () => {
		expect(() => equipoConNiveles(expedicion([miembro("mew")]), PROG)).toThrow(
			/mew/,
		);
	});

	it("no muta la expedición ni los datos", () => {
		const e = congelar(
			expedicion([miembro("charmander", { naturaleza: "Naive" })]),
		);
		const p = congelar(PROG);
		const antesE = structuredClone(e);
		const antesP = structuredClone(p);
		equipoConNiveles(e, p);
		expect(e).toEqual(antesE);
		expect(p).toEqual(antesP);
	});
});

describe("equipoConNiveles con poder", () => {
	it("con política, los movimientos iniciales incluyen ataques", () => {
		const datos = cargarDatosPack({
			progresion: true,
			politica: true,
			nivelGimnasio: 5,
		});
		const progresion = datos.progresion;
		const politica = datos.politica;
		if (progresion === undefined || politica === undefined)
			throw new Error("el pack no cargó progresión y política");
		const r = equipoConNiveles(expedicion([miembro("pikachu")]), progresion);
		const movimientos = r.equipo[0]?.movimientos ?? [];
		const poder = poderDeMovimientos(politica);
		expect(movimientos).toEqual([
			"thunder-shock",
			"double-team",
			"electro-ball",
			"feint",
		]);
		expect(movimientos.filter((m) => (poder[m] ?? 0) > 0)).toHaveLength(2);
	});
});

describe("tipoRivalDeNodo", () => {
	it("mapea todos los tipos de nodo de combate", () => {
		const mapa = [
			["salvaje", "salvaje"],
			["entrenador", "rival"],
			["alfa", "alfa"],
			["sombrio", "sombrio"],
			["jefe", "jefe"],
		] as const;
		for (const [nodo, rival] of mapa) {
			expect(tipoRivalDeNodo(nodo)).toBe(rival);
		}
	});

	it("lanza con los tipos que no son de combate", () => {
		for (const nodo of ["tienda", "manantial", "evento", "cofre", "otro"]) {
			expect(() => tipoRivalDeNodo(nodo)).toThrow(RangeError);
		}
	});
});

describe("techoDelPiso", () => {
	it("usa el as del jefe de cada piso", () => {
		const tabla = PROG.niveles.nivel;
		expect(techoDelPiso(tabla, 1, crearRng("x"))).toBe(14);
		expect(techoDelPiso(tabla, 2, crearRng("x"))).toBe(24);
		expect(techoDelPiso(tabla, 3, crearRng("x"))).toBe(34);
	});
});

describe("trasVictoria", () => {
	it("sube a los participantes y al banquillo consciente", () => {
		const e = expedicion([
			miembro("charmander", { nivel: 8 }),
			miembro("bulbasaur", { nivel: 8 }),
		]);
		const r = trasVictoria(e, "jefe", [0], CTX);
		expect(r.equipo.map((m) => m.nivel)).toEqual([12, 10]);
	});

	it("resuelve el movimiento pendiente olvidando el de menor poder", () => {
		const aprendizaje = {
			...PROG.aprendizaje,
			charmander: [
				{ nivel: 1, movimiento: "growl" },
				{ nivel: 4, movimiento: "ember" },
				{ nivel: 9, movimiento: "nuevo" },
			],
		};
		const ctx = contextoDeProgresion(
			{ ...PROG, aprendizaje },
			{ growl: 50, scratch: 40, ember: 40, smokescreen: 30, nuevo: 80 },
		);
		const e = expedicion([
			miembro("charmander", {
				nivel: 8,
				movimientos: ["growl", "scratch", "ember", "smokescreen"],
				recordables: [],
			}),
		]);
		const r = trasVictoria(e, "salvaje", [0], ctx);
		expect(r.equipo[0]?.movimientos).toEqual([
			"growl",
			"scratch",
			"ember",
			"nuevo",
		]);
		expect(r.equipo[0]?.recordables).toEqual(["smokescreen"]);
		expect(r.equipo[0]?.pendientesMovimiento).toEqual([]);
	});

	it("resuelve la evolución que se desbloquea al subir", () => {
		const e = expedicion([
			miembro("charmander", {
				nivel: 15,
				movimientos: ["growl", "scratch", "ember", "smokescreen"],
			}),
		]);
		const r = trasVictoria(e, "jefe", [0], CTX);
		expect(r.equipo[0]?.especie).toBe("charmeleon");
		expect(r.equipo[0]?.nivel).toBe(16);
	});

	it("usa el piso del combate aunque el estado ya haya avanzado", () => {
		const e = {
			...expedicion([
				miembro("charmander", {
					nivel: 15,
					movimientos: ["growl", "scratch", "ember", "smokescreen"],
				}),
			]),
			piso: 2 as const,
		};
		// Con el piso 1 el techo es 16 y se queda en 16; con el 2 sería 26.
		const r = trasVictoria(e, "jefe", [0], CTX, 1);
		expect(r.equipo[0]?.nivel).toBe(16);
	});

	it("lanza si el nodo no es de combate", () => {
		const e = expedicion([miembro("charmander", { nivel: 8 })]);
		expect(() => trasVictoria(e, "tienda", [0], CTX)).toThrow(RangeError);
	});

	it("no muta la expedición ni el contexto", () => {
		const e = congelar(expedicion([miembro("charmander", { nivel: 8 })]));
		const ctx = congelar(
			contextoDeProgresion(PROG, { growl: 50, scratch: 40 }),
		);
		const antesE = structuredClone(e);
		const antesCtx = structuredClone(ctx);
		trasVictoria(e, "salvaje", [0], ctx);
		expect(e).toEqual(antesE);
		expect(ctx).toEqual(antesCtx);
	});
});

describe("setsConEvoluciones", () => {
	const sets: SetCombate[] = [
		{
			especie: "charmander",
			movimientos: ["ember"],
			habilidad: "blaze",
			naturaleza: "Naive",
		},
	];

	it("presta el set de la especie base a la evolución", () => {
		const r = setsConEvoluciones(
			sets,
			[miembro("charmeleon")],
			PROG.evoluciones,
		);
		expect(r).toHaveLength(2);
		expect(r[1]).toEqual({ ...sets[0], especie: "charmeleon" });
		expect(r[0]).toBe(sets[0]);
	});

	it("devuelve la misma lista si no hay especies sin set", () => {
		expect(
			setsConEvoluciones(sets, [miembro("charmander")], PROG.evoluciones),
		).toBe(sets);
	});
});
