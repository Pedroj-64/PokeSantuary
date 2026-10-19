import {
	crearSantuario,
	type EstadoSantuario,
	type Residente,
	type SantuarioBalance,
} from "@santuario/core";
import { describe, expect, it } from "vitest";
import balanceCrudo from "../../../../packs/kanto/santuario.json";
import {
	decoracionesDisponibles,
	kitsDisponibles,
	lechosPosibles,
	mejorasPosibles,
	puedeCamino,
	puedeColocar,
	puedeDecorar,
	puedeMarcar,
	residentesConTerreno,
	tareasPosibles,
} from "./opciones.js";

const balance = balanceCrudo as unknown as SantuarioBalance;

const residente = (uid: string, o: Partial<Residente> = {}): Residente => ({
	uid,
	especie: "bulbasaur",
	naturaleza: "Hardy",
	nivel: 8,
	tipos: ["grass"],
	preferidos: ["cultivar"],
	especialidades: {},
	usosEspecialidad: {},
	hambre: 100,
	animo: 60,
	amistad: 0,
	estado: "descansado",
	tarea: { tipo: "nada" },
	zona: 0,
	origen: "captura",
	diasInquieto: 0,
	trabajoHoy: "ninguno",
	habloHoy: false,
	peticionCumplidaHoy: false,
	...o,
});

const base = (): EstadoSantuario => ({
	...crearSantuario("s1", balance),
	residentes: [residente("r1"), residente("r2")],
	siguienteUid: 10,
});

/** Estado con un edificio terminado de un tipo en un sitio libre del claro. */
const conEdificio = (
	e: EstadoSantuario,
	tipo: string,
	uid: string,
	obraRestante = 0,
	nivel = 1,
	x = 22,
	y = 13,
): EstadoSantuario => ({
	...e,
	edificios: [
		...e.edificios,
		{ uid, tipo, x, y, nivel, obraRestante, resto: {} },
	],
});

describe("kitsDisponibles", () => {
	it("lista los kits del nivel del Árbol, sin el propio Árbol, marcando los que se pueden pagar", () => {
		const e = base();
		const kits = kitsDisponibles(e, balance);
		expect(kits.map((k) => k.tipo)).not.toContain("arbol-cenit");
		expect(kits.map((k) => k.tipo)).toContain("lecho-hojas");
		expect(kits.find((k) => k.tipo === "lecho-hojas")?.asequible).toBe(true);
		// huerto: 6 madera y 4 piedra; empezamos con 10 y 6 → asequible; almacén 8/6 también
		const sinRecursos = kitsDisponibles(
			{ ...e, recursos: { madera: 0, piedra: 0 } },
			balance,
		);
		expect(sinRecursos.every((k) => !k.asequible)).toBe(true);
	});

	it("oculta los kits que piden un nivel del Árbol que aún no hay", () => {
		const kits = kitsDisponibles(base(), balance);
		expect(kits.map((k) => k.tipo)).not.toContain("lecho-paja"); // requiere Árbol 2
	});
});

describe("puedeColocar", () => {
	it("acepta un hueco libre y útil", () => {
		expect(puedeColocar(base(), "lecho-hojas", 22, 13, balance)).toEqual({
			ok: true,
		});
	});

	it("rechaza fuera de la isla, sobre yerma y sin recursos, con un motivo legible", () => {
		const e = base();
		expect(puedeColocar(e, "lecho-hojas", -1, 3, balance).ok).toBe(false);
		const yerma = puedeColocar(e, "lecho-hojas", 1, 1, balance);
		expect(yerma.ok).toBe(false);
		expect("motivo" in yerma && typeof yerma.motivo).toBe("string");
		expect(
			puedeColocar(
				{ ...e, recursos: { madera: 0 } },
				"lecho-hojas",
				22,
				13,
				balance,
			).ok,
		).toBe(false);
	});

	it("no modifica el estado", () => {
		const e = Object.freeze(base());
		expect(() => puedeColocar(e, "lecho-hojas", 22, 13, balance)).not.toThrow();
	});
});

describe("tareasPosibles", () => {
	it("sin edificios productivos solo queda no hacer nada", () => {
		expect(tareasPosibles(base(), "r1", balance).map((o) => o.tarea)).toEqual([
			{ tipo: "nada" },
		]);
	});

	it("ofrece trabajar en un edificio terminado con plaza y construir en uno en obra", () => {
		let e = conEdificio(base(), "huerto-bayas", "ed5");
		e = conEdificio(e, "cantera", "ed6", 4, 1, 26, 13);
		const tareas = tareasPosibles(e, "r1", balance).map((o) => o.tarea);
		expect(tareas).toContainEqual({ tipo: "trabajo", edificio: "ed5" });
		expect(tareas).toContainEqual({ tipo: "construir", edificio: "ed6" });
		expect(tareas).not.toContainEqual({ tipo: "trabajo", edificio: "ed6" });
	});

	it("no ofrece un edificio sin plazas libres, pero sí a quien ya lo ocupa", () => {
		let e = conEdificio(base(), "huerto-bayas", "ed5");
		e = {
			...e,
			residentes: [
				residente("r1", { tarea: { tipo: "trabajo", edificio: "ed5" } }),
				residente("r2", { tarea: { tipo: "trabajo", edificio: "ed5" } }),
				residente("r3"),
			],
		};
		// el huerto de nivel 1 tiene 2 plazas
		expect(
			tareasPosibles(e, "r3", balance).map((o) => o.tarea),
		).not.toContainEqual({ tipo: "trabajo", edificio: "ed5" });
		expect(tareasPosibles(e, "r1", balance).map((o) => o.tarea)).toContainEqual(
			{
				tipo: "trabajo",
				edificio: "ed5",
			},
		);
	});

	it("un residente agotado solo puede no hacer nada", () => {
		let e = conEdificio(base(), "huerto-bayas", "ed5");
		e = { ...e, residentes: [residente("r1", { estado: "agotado" })] };
		expect(tareasPosibles(e, "r1", balance).map((o) => o.tarea)).toEqual([
			{ tipo: "nada" },
		]);
	});

	it("cada opción lleva una clave de texto con sus parámetros", () => {
		const e = conEdificio(base(), "huerto-bayas", "ed5");
		const o = tareasPosibles(e, "r1", balance).find(
			(x) => x.tarea.tipo === "trabajo",
		);
		expect(o?.etiqueta).toEqual({
			clave: "gestion.tarea.trabajo",
			params: { edificio: "huerto-bayas" },
		});
	});
});

describe("lechosPosibles", () => {
	it("ofrece los lechos terminados y libres", () => {
		let e = conEdificio(base(), "lecho-hojas", "ed7");
		e = conEdificio(e, "lecho-hojas", "ed8", 2, 1, 24, 13); // en obra: no
		expect(lechosPosibles(e, "r1", balance)).toEqual(["ed7"]);
	});

	it("un lecho ocupado por otro no se ofrece", () => {
		let e = conEdificio(base(), "lecho-hojas", "ed7");
		e = {
			...e,
			residentes: [residente("r1"), residente("r2", { lecho: "ed7" })],
		};
		expect(lechosPosibles(e, "r1", balance)).toEqual([]);
	});
});

describe("mejorasPosibles", () => {
	it("lista los edificios que se pueden subir de nivel y se pagan", () => {
		const e = {
			...conEdificio(base(), "huerto-bayas", "ed5"),
			recursos: { madera: 50, piedra: 50 },
		};
		expect(mejorasPosibles(e, balance)).toEqual([
			expect.objectContaining({
				uid: "ed5",
				tipo: "huerto-bayas",
				asequible: true,
			}),
		]);
	});

	it("marca como no asequible lo que no se puede pagar y no lista el Árbol ni lo que está en máximo", () => {
		const e = conEdificio(base(), "huerto-bayas", "ed5");
		const l = mejorasPosibles(
			{ ...e, recursos: { madera: 0, piedra: 0 } },
			balance,
		);
		expect(l[0]?.asequible).toBe(false);
		expect(l.map((m) => m.tipo)).not.toContain("arbol-cenit");
		const max = conEdificio(base(), "huerto-bayas", "ed5", 0, 3);
		expect(mejorasPosibles(max, balance)).toEqual([]);
	});
});

/** Cambia el tipo de una loseta (para armar casos). */
const loseta = (
	e: EstadoSantuario,
	x: number,
	y: number,
	cambios: Record<string, unknown>,
): EstadoSantuario => ({
	...e,
	terreno: {
		...e.terreno,
		losetas: e.terreno.losetas.map((l, i) =>
			i === y * e.terreno.ancho + x ? { ...l, ...cambios } : l,
		),
	},
});

describe("terreno: quién puede marcar y dónde", () => {
	const conEspecialidad = (
		especialidades: Record<string, number>,
		o: Partial<Residente> = {},
	): EstadoSantuario => ({
		...base(),
		residentes: [residente("r1", { especialidades, ...o })],
	});

	it("solo cuentan los residentes libres con alguna Especialidad de terreno", () => {
		const e: EstadoSantuario = {
			...base(),
			residentes: [
				residente("r1", { especialidades: { regar: 1, crecer: 1 } }),
				residente("r2", { especialidades: { generar: 1 } }), // no es de terreno
				residente("r3", { especialidades: { cortar: 1 }, estado: "agotado" }),
				residente("r4", {
					especialidades: { romper: 1 },
					tarea: { tipo: "trabajo", edificio: "ed2" },
				}),
				residente("r5"),
			],
		};
		expect(residentesConTerreno(e)).toEqual([
			{ uid: "r1", acciones: ["crecer", "regar"] },
		]);
	});

	it("puedeMarcar acepta una acción aplicable y rechaza una que no con su motivo", () => {
		const e = loseta(conEspecialidad({ crecer: 1, cortar: 1 }), 5, 5, {
			tipo: "yerma",
		});
		expect(puedeMarcar(e, "r1", "crecer", 5, 5, balance)).toEqual({ ok: true });
		const mal = puedeMarcar(e, "r1", "cortar", 5, 5, balance);
		expect(mal.ok).toBe(false);
		expect("motivo" in mal && mal.motivo.length > 0).toBe(true);
		expect(puedeMarcar(e, "r1", "regar", 5, 5, balance).ok).toBe(false); // sin esa Especialidad
		expect(puedeMarcar(e, "r1", "crecer", -1, 5, balance).ok).toBe(false);
	});

	it("puedeCamino exige tierra o pradera y piedra", () => {
		const e = loseta(base(), 5, 5, { tipo: "tierra" });
		expect(puedeCamino(e, 5, 5, balance)).toEqual({ ok: true });
		expect(
			puedeCamino({ ...e, recursos: { piedra: 0 } }, 5, 5, balance).ok,
		).toBe(false);
		expect(
			puedeCamino(loseta(base(), 5, 5, { tipo: "agua" }), 5, 5, balance).ok,
		).toBe(false);
	});

	it("puedeDecorar y decoracionesDisponibles", () => {
		const e = loseta(base(), 5, 5, { tipo: "tierra" });
		expect(puedeDecorar(e, "banco", 5, 5, balance)).toEqual({ ok: true });
		expect(puedeDecorar(e, "no-existe", 5, 5, balance).ok).toBe(false);
		const lista = decoracionesDisponibles(
			{ ...e, recursos: { madera: 1 } },
			balance,
		);
		expect(lista.find((d) => d.id === "valla-de-madera")?.asequible).toBe(true);
		expect(lista.find((d) => d.id === "banco")?.asequible).toBe(false);
	});

	it("probar no modifica el estado", () => {
		const e = Object.freeze(loseta(base(), 5, 5, { tipo: "tierra" }));
		expect(() => puedeCamino(e, 5, 5, balance)).not.toThrow();
	});
});
