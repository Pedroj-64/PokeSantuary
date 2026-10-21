import { describe, expect, it } from "vitest";
import {
	type AccionPartida,
	type ContextoPartida,
	crearPartida,
	type EstadoPartida,
	reducir,
	VERSION_PARTIDA,
} from "./partida.js";
import type { Residente, SantuarioBalance } from "./santuario/estado.js";

const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};
const leer = (ruta: string) =>
	JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));
const BALANCE = leer("../../../packs/kanto/santuario.json") as SantuarioBalance;
const HABITATS = leer("../../../packs/kanto/habitats.json");

function congelar<T>(valor: T): T {
	if (valor === null || typeof valor !== "object") return valor;
	Object.freeze(valor);
	for (const hijo of Object.values(valor as Record<string, unknown>))
		congelar(hijo);
	return valor;
}

function residente(uid: string, opciones: Partial<Residente> = {}): Residente {
	return {
		uid,
		especie: "pikachu",
		naturaleza: "Hardy",
		nivel: 5,
		tipos: ["electric"],
		preferidos: ["aserrar"],
		especialidades: {},
		usosEspecialidad: {},
		hambre: 80,
		animo: 60,
		amistad: 1,
		estado: "descansado",
		tarea: { tipo: "nada" },
		zona: 0,
		origen: "captura",
		diasInquieto: 0,
		trabajoHoy: "ninguno",
		habloHoy: false,
		peticionCumplidaHoy: false,
		...opciones,
	};
}

const ctx = (): ContextoPartida => ({
	balance: structuredClone(BALANCE),
	habitats: HABITATS,
	fabricar: ({ especie, uid, origen }) => residente(uid, { especie, origen }),
});

/** Partida en el Día de la jornada 1 con dos residentes. */
function enElDia(): EstadoPartida {
	let p = crearPartida("s1", ctx().balance);
	p = {
		...p,
		santuario: {
			...p.santuario,
			residentes: [residente("a1"), residente("a2", { especie: "geodude" })],
			siguienteUid: 100,
		},
	};
	return reducir(p, { tipo: "comenzarDia" }, ctx()).partida;
}

const ir = (p: EstadoPartida, a: AccionPartida) => reducir(p, a, ctx()).partida;

describe("crearPartida", () => {
	it("empieza en el Alba de la jornada 1, sin expedición ni pendientes", () => {
		const p = crearPartida("s1", ctx().balance);
		expect(p.version).toBe(VERSION_PARTIDA);
		expect(p.santuario.jornada).toBe(1);
		expect(p.santuario.momento).toBe("alba");
		expect(p.expedicion).toBeUndefined();
		expect(p.pendientesDeSitio).toEqual([]);
	});
});

describe("momentos de la jornada", () => {
	it("alba → día con comenzarDia; fuera del alba lanza", () => {
		const p = crearPartida("s1", ctx().balance);
		const d = ir(p, { tipo: "comenzarDia" });
		expect(d.santuario.momento).toBe("dia");
		expect(() => ir(d, { tipo: "comenzarDia" })).toThrow(RangeError);
	});

	it("elegirTema solo en el alba y guarda el tema", () => {
		const p = crearPartida("s1", ctx().balance);
		expect(
			ir(p, { tipo: "elegirTema", tema: "animo" }).santuario.temaCharla,
		).toBe("animo");
		expect(() => ir(enElDia(), { tipo: "elegirTema", tema: "animo" })).toThrow(
			RangeError,
		);
	});

	it("pasarDia resuelve el Atardecer y deja la Noche; dormir amanece en la jornada siguiente", () => {
		const d = enElDia();
		const r = reducir(d, { tipo: "pasarDia" }, ctx());
		expect(r.partida.santuario.momento).toBe("noche");
		expect(r.partida.santuario.jornada).toBe(1);
		const a = reducir(r.partida, { tipo: "dormir" }, ctx());
		expect(a.partida.santuario.momento).toBe("alba");
		expect(a.partida.santuario.jornada).toBe(2);
	});

	it("pasarDia solo vale de día y dormir solo de noche", () => {
		expect(() =>
			ir(crearPartida("s1", ctx().balance), { tipo: "pasarDia" }),
		).toThrow(RangeError);
		expect(() => ir(enElDia(), { tipo: "dormir" })).toThrow(RangeError);
	});

	it("el Atardecer hace que el residente sin bayas pierda hambre (se resuelve de verdad)", () => {
		const p = enElDia();
		const sin = {
			...p,
			santuario: { ...p.santuario, recursos: { ...p.santuario.recursos } },
		};
		delete sin.santuario.recursos["baya:neutro"];
		const r = ir(sin, { tipo: "pasarDia" });
		expect(r.santuario.residentes[0]?.hambre).toBe(55);
	});
});

describe("gestión del día", () => {
	it("asignarLecho, colocarKit y asignarTarea llaman a las reglas del núcleo", () => {
		let p = enElDia();
		p = ir(p, { tipo: "colocarKit", edificio: "lecho-hojas", x: 22, y: 13 });
		const lecho = p.santuario.edificios.find((e) => e.tipo === "lecho-hojas");
		expect(lecho).toBeDefined();
		expect(p.santuario.recursos.madera).toBe(8);
		p = ir(p, { tipo: "asignarTarea", uid: "a1", tarea: { tipo: "nada" } });
		expect(p.santuario.residentes[0]?.tarea).toEqual({ tipo: "nada" });
	});

	it("la gestión solo se permite de día", () => {
		const alba = crearPartida("s1", ctx().balance);
		for (const a of [
			{ tipo: "colocarKit", edificio: "lecho-hojas", x: 22, y: 13 },
			{ tipo: "asignarTarea", uid: "a1", tarea: { tipo: "nada" } },
			{ tipo: "colocarCamino", x: 1, y: 1 },
		] as AccionPartida[])
			expect(() => ir(alba, a)).toThrow(RangeError);
	});

	it("una orden ilegal lanza y no cambia la partida original", () => {
		const d = congelar(enElDia());
		expect(() =>
			ir(d, { tipo: "colocarKit", edificio: "no-existe", x: 1, y: 1 }),
		).toThrow(RangeError);
	});
});

describe("expedición", () => {
	const saliendo = () =>
		ir(enElDia(), { tipo: "salirAExpedicion", uids: ["a1"], semilla: "sx" });

	it("salir crea la expedición con los residentes elegidos", () => {
		const p = saliendo();
		expect(p.expedicion?.equipo).toEqual([
			{ uid: "a1", especie: "pikachu", psPct: 100 },
		]);
	});

	it("la expedición empieza con el dinero y la mochila que da el balance", () => {
		const p = ir(enElDia(), {
			tipo: "salirAExpedicion",
			uids: ["a1"],
			semilla: "sx",
			dinero: 70,
			mochila: { "poke-ball": 5 },
		});
		expect(p.expedicion?.dinero).toBe(70);
		expect(p.expedicion?.mochila).toEqual({ "poke-ball": 5 });
		// sin datos de inicio: cero y mochila vacía
		expect(saliendo().expedicion?.dinero).toBe(0);
	});

	it("solo se sale de día, una vez por jornada y sin otra expedición en curso", () => {
		expect(() =>
			ir(crearPartida("s1", ctx().balance), {
				tipo: "salirAExpedicion",
				uids: ["a1"],
				semilla: "sx",
			}),
		).toThrow(RangeError);
		expect(() =>
			ir(saliendo(), { tipo: "salirAExpedicion", uids: ["a2"], semilla: "sy" }),
		).toThrow(RangeError);
	});

	it("durante la expedición no se pasa el día ni se gestiona", () => {
		const p = saliendo();
		expect(() => ir(p, { tipo: "pasarDia" })).toThrow(RangeError);
		expect(() => ir(p, { tipo: "colocarCamino", x: 1, y: 1 })).toThrow(
			RangeError,
		);
	});

	it("volver con una expedición sin terminar lanza", () => {
		expect(() => ir(saliendo(), { tipo: "volverDeExpedicion" })).toThrow(
			RangeError,
		);
	});

	it("volver liquida, mete a los capturados, resuelve el Atardecer y deja la Noche", () => {
		const p = saliendo();
		const x = p.expedicion;
		if (!x) throw new Error("sin expedición");
		const terminada = ir(p, {
			tipo: "actualizarExpedicion",
			expedicion: {
				...x,
				estado: "victoria",
				dinero: 40,
				equipo: [...x.equipo, { especie: "zubat", psPct: 60 }],
			},
		});
		const r = reducir(terminada, { tipo: "volverDeExpedicion" }, ctx());
		expect(r.partida.expedicion).toBeUndefined();
		expect(r.partida.santuario.momento).toBe("noche");
		expect(r.partida.santuario.recursos.pokedolares).toBe(40);
		expect(
			r.partida.santuario.residentes.some((q) => q.especie === "zubat"),
		).toBe(true);
		expect(r.partida.expedicionJornada).toBe(1);
	});

	it("salir con miembros armados los fusiona con el uid; con otra cantidad lanza", () => {
		const p = ir(enElDia(), {
			tipo: "salirAExpedicion",
			uids: ["a1"],
			semilla: "sx",
			miembros: [
				{
					uid: "a1",
					especie: "pikachu",
					psPct: 100,
					nivel: 8,
					movimientos: ["thunder-shock"],
				},
			],
		});
		expect(p.expedicion?.equipo).toEqual([
			{
				uid: "a1",
				especie: "pikachu",
				psPct: 100,
				nivel: 8,
				movimientos: ["thunder-shock"],
			},
		]);
		expect(() =>
			ir(enElDia(), {
				tipo: "salirAExpedicion",
				uids: ["a1"],
				semilla: "sx",
				miembros: [],
			}),
		).toThrow(RangeError);
	});

	it("volver con catálogo devuelve lo aprendido y la evolución, pero no el nivel de la expedición", () => {
		const catalogo = {
			pikachu: {
				aprendizaje: [],
				nivelEtapa: 0,
				tipos: ["electric"],
				preferidos: ["aserrar"],
				especialidades: [],
			},
			raichu: {
				aprendizaje: [],
				nivelEtapa: 16,
				tipos: ["electric"],
				preferidos: ["aserrar"],
				especialidades: ["encender"],
			},
		};
		const p = saliendo();
		const x = p.expedicion;
		if (!x) throw new Error("sin expedición");
		const terminada = ir(p, {
			tipo: "actualizarExpedicion",
			expedicion: {
				...x,
				estado: "victoria",
				equipo: [
					{
						uid: "a1",
						especie: "raichu",
						psPct: 50,
						nivel: 30,
						movimientos: ["thunderbolt"],
						recordables: ["growl"],
					},
				],
			},
		});
		const r = reducir(
			terminada,
			{ tipo: "volverDeExpedicion" },
			{ ...ctx(), progresion: catalogo, nivelGimnasio: 0 },
		);
		const a1 = r.partida.santuario.residentes.find((q) => q.uid === "a1");
		expect(a1).toMatchObject({
			especie: "raichu",
			movimientos: ["thunderbolt"],
			recordables: ["growl"],
			nivel: 14,
		});
		expect(a1?.especialidades).toEqual({ encender: 1 });
		// Sin catálogo, el residente vuelve tal cual (sin evolucionar).
		const sin = ir(terminada, { tipo: "volverDeExpedicion" });
		expect(sin.santuario.residentes.find((q) => q.uid === "a1")?.especie).toBe(
			"pikachu",
		);
	});

	it("lo que no cabe queda en pendientesDeSitio y no se pierde", () => {
		let p = enElDia();
		p = {
			...p,
			santuario: {
				...p.santuario,
				residentes: Array.from({ length: 6 }, (_, i) => residente(`a${i}`)),
			},
		};
		p = ir(p, { tipo: "salirAExpedicion", uids: ["a0"], semilla: "sx" });
		const x = p.expedicion;
		if (!x) throw new Error("sin expedición");
		p = ir(p, {
			tipo: "actualizarExpedicion",
			expedicion: {
				...x,
				estado: "victoria",
				equipo: [...x.equipo, { especie: "zubat", psPct: 60 }],
			},
		});
		const r = ir(p, { tipo: "volverDeExpedicion" });
		expect(r.pendientesDeSitio).toEqual(["zubat"]);
	});
});

describe("determinismo e inmutabilidad", () => {
	it("la misma partida y las mismas acciones dan el mismo resultado", () => {
		const jugar = () => {
			let p = enElDia();
			p = ir(p, { tipo: "colocarKit", edificio: "lecho-hojas", x: 22, y: 13 });
			p = ir(p, { tipo: "pasarDia" });
			return ir(p, { tipo: "dormir" });
		};
		expect(jugar()).toEqual(jugar());
	});

	it("reducir no muta la partida de entrada", () => {
		const d = congelar(enElDia());
		expect(() => reducir(d, { tipo: "pasarDia" }, ctx())).not.toThrow();
	});
});

describe("Altar y Gimnasio", () => {
	const edificio = (tipo: string, nivel = 1, obraRestante = 0) => ({
		uid: `e-${tipo}`,
		tipo,
		x: 1,
		y: 1,
		nivel,
		obraRestante,
		resto: {},
	});
	/** Día de la jornada 1 con los edificios y recursos dados. */
	const con = (
		edificios: ReturnType<typeof edificio>[],
		recursos: Record<string, number> = {},
	): EstadoPartida => {
		const p = enElDia();
		return {
			...p,
			santuario: {
				...p.santuario,
				armonia: 100,
				edificios: [...p.santuario.edificios, ...edificios],
				recursos: { ...p.santuario.recursos, ...recursos },
			},
		};
	};

	it("celebrar exige un Altar terminado y anota la jornada y el efecto", () => {
		expect(() =>
			ir(con([], { "baya:neutro": 30 }), {
				tipo: "celebrarCeremonia",
				id: "festin-bayas",
			}),
		).toThrow(RangeError);
		expect(() =>
			ir(con([edificio("altar", 1, 3)], { "baya:neutro": 30 }), {
				tipo: "celebrarCeremonia",
				id: "festin-bayas",
			}),
		).toThrow(RangeError);
		const p = ir(con([edificio("altar")], { "baya:neutro": 30 }), {
			tipo: "celebrarCeremonia",
			id: "festin-bayas",
		});
		expect(p.santuario.ceremonias).toEqual({ "festin-bayas": 1 });
		expect(p.santuario.recursos["baya:neutro"]).toBe(10);
		// la espera de 3 jornadas impide repetirla ya
		expect(() =>
			ir(p, { tipo: "celebrarCeremonia", id: "festin-bayas" }),
		).toThrow(RangeError);
	});

	it("la Bendición del Viajero deja la marca para la próxima expedición", () => {
		const p = ir(
			con([edificio("altar")], { "baya:neutro": 30, recuerdos: 1 }),
			{ tipo: "celebrarCeremonia", id: "bendicion-viajero" },
		);
		expect(p.santuario.bendicionViajero).toBe(true);
		expect(p.santuario.recursos.recuerdos).toBe(0);
	});

	it("no se celebra con una expedición en curso", () => {
		const x = ir(con([edificio("altar")], { "baya:neutro": 30 }), {
			tipo: "salirAExpedicion",
			uids: ["a1"],
			semilla: "sx",
		});
		expect(() =>
			ir(x, { tipo: "celebrarCeremonia", id: "festin-bayas" }),
		).toThrow(RangeError);
	});

	it("elegir Código guarda la elección, es permanente y respeta el nivel del Altar", () => {
		const base = con([edificio("altar", 1)]);
		const p = ir(base, { tipo: "elegirCodigo", nivel: 1, opcion: "A" });
		expect(p.santuario.codigos).toEqual({ 1: "A" });
		expect(() =>
			ir(p, { tipo: "elegirCodigo", nivel: 1, opcion: "B" }),
		).toThrow(RangeError);
		expect(() =>
			ir(base, { tipo: "elegirCodigo", nivel: 2, opcion: "A" }),
		).toThrow(RangeError);
		expect(() =>
			ir(con([]), { tipo: "elegirCodigo", nivel: 1, opcion: "A" }),
		).toThrow(RangeError);
	});

	it("subir el Gimnasio gasta fragmentos y ₽ y sube el nivel; sin edificio o sin recursos lanza", () => {
		const recursos = { fragmentos: 10, pokedolares: 500 };
		const p = ir(con([edificio("gimnasio")], recursos), {
			tipo: "subirGimnasio",
		});
		expect(p.santuario.nivelGimnasio).toBe(1);
		expect(p.santuario.recursos.fragmentos).toBe(8);
		expect(p.santuario.recursos.pokedolares).toBe(400);
		expect(() => ir(con([], recursos), { tipo: "subirGimnasio" })).toThrow(
			RangeError,
		);
		expect(() =>
			ir(con([edificio("gimnasio")], { fragmentos: 0, pokedolares: 0 }), {
				tipo: "subirGimnasio",
			}),
		).toThrow(RangeError);
	});

	it("sin Sable el Gimnasio se detiene en el nivel 3", () => {
		let p = con([edificio("gimnasio")], { fragmentos: 99, pokedolares: 999 });
		for (let i = 0; i < 3; i++) p = ir(p, { tipo: "subirGimnasio" });
		expect(p.santuario.nivelGimnasio).toBe(3);
		expect(() => ir(p, { tipo: "subirGimnasio" })).toThrow(/sable/);
	});

	it("el nivel del Gimnasio fija el nivel de salida al volver de una expedición", () => {
		const catalogo = {
			pikachu: {
				aprendizaje: [],
				nivelEtapa: 0,
				tipos: ["electric"],
				preferidos: ["aserrar"],
				especialidades: [],
			},
			raichu: {
				aprendizaje: [],
				nivelEtapa: 24,
				tipos: ["electric"],
				preferidos: ["aserrar"],
				especialidades: [],
			},
		};
		let p = con([], {});
		p = { ...p, santuario: { ...p.santuario, nivelGimnasio: 2 } };
		p = ir(p, { tipo: "salirAExpedicion", uids: ["a1"], semilla: "sx" });
		const x = p.expedicion;
		if (!x) throw new Error("sin expedición");
		p = ir(p, {
			tipo: "actualizarExpedicion",
			expedicion: {
				...x,
				estado: "victoria",
				equipo: [{ uid: "a1", especie: "raichu", psPct: 50, nivel: 30 }],
			},
		});
		const r = reducir(
			p,
			{ tipo: "volverDeExpedicion" },
			{ ...ctx(), progresion: catalogo },
		);
		// Gimnasio 2: base 12, tope 18; con Gimnasio 0 saldría 14
		expect(
			r.partida.santuario.residentes.find((q) => q.uid === "a1")?.nivel,
		).toBe(18);
	});
});
