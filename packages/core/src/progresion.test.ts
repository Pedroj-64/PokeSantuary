import { describe, expect, it } from "vitest";
import type { Evolucion } from "./evolucionar.js";
import {
	type EstadoExpedicion,
	iniciarExpedicion,
	type MiembroExp,
} from "./expedicion.js";
import type { TablaSubida, TipoRival } from "./niveles.js";
import {
	type ContextoProgresion,
	elegirOlvido,
	evolucionar,
	type OpcionesVictoria,
	registrarVictoria,
} from "./progresion.js";

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

const TABLA: TablaSubida = congelar({
	porRival: { salvaje: [1, 0], ecoComun: [2, 1], jefe: [4, 2] },
	umbralPonerseAlDia: 4,
	extraPonerseAlDia: 1,
	margenTope: 2,
});

const BASE_CTX: ContextoProgresion = congelar({
	tabla: TABLA,
	aprendizaje: {},
	evoluciones: {},
	momento: "dia",
});

function ctx(parcial: Partial<ContextoProgresion> = {}): ContextoProgresion {
	return congelar({ ...BASE_CTX, ...parcial });
}

/** Estado de prueba con el equipo indicado y el resto por defecto. */
function estado(equipo: MiembroExp[]): EstadoExpedicion {
	const base = iniciarExpedicion(
		"s",
		equipo.map((miembro) => miembro.especie),
	);
	return congelar({ ...base, equipo });
}

const victoria = (
	participantes: number[],
	rival: TipoRival = "salvaje",
	techo = 30,
): OpcionesVictoria => ({ rival, participantes, techo });

describe("registrarVictoria: sin niveles", () => {
	it("devuelve el mismo estado y sin eventos si nadie tiene nivel", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100 },
			{ especie: "bulbasaur", psPct: 100 },
		]);
		const r = registrarVictoria(e, victoria([0]), ctx());
		expect(r.estado).toBe(e);
		expect(r.eventos).toEqual([]);
	});
});

describe("registrarVictoria: subida, movimientos y evolución", () => {
	it("sube, aprende el movimiento nuevo y propone evolucionar sin cambiar la especie", () => {
		const e = estado([
			{
				especie: "charmander",
				psPct: 100,
				nivel: 15,
				movimientos: ["scratch", "growl"],
			},
		]);
		const c = ctx({
			aprendizaje: { charmander: [{ nivel: 16, movimiento: "flamethrower" }] },
			evoluciones: {
				charmander: [
					{ a: "charmeleon", condicion: { tipo: "nivel", nivel: 16 } },
				],
			},
		});
		const r = registrarVictoria(e, victoria([0]), c);
		expect(r.eventos).toEqual([
			{ tipo: "subeNivel", indice: 0, especie: "charmander", de: 15, a: 16 },
			{
				tipo: "aprende",
				indice: 0,
				especie: "charmander",
				movimiento: "flamethrower",
			},
			{
				tipo: "puedeEvolucionar",
				indice: 0,
				especie: "charmander",
				opciones: ["charmeleon"],
			},
		]);
		expect(r.estado.equipo[0]).toEqual({
			especie: "charmander",
			psPct: 100,
			nivel: 16,
			movimientos: ["scratch", "growl", "flamethrower"],
			recordables: [],
		});
	});

	it("con 4 activos deja el movimiento en pendientes sin tocar movimientos", () => {
		const e = estado([
			{
				especie: "charmander",
				psPct: 100,
				nivel: 15,
				movimientos: ["a", "b", "c", "d"],
				recordables: ["x"],
			},
		]);
		const c = ctx({
			aprendizaje: { charmander: [{ nivel: 16, movimiento: "flamethrower" }] },
		});
		const r = registrarVictoria(e, victoria([0]), c);
		expect(r.eventos).toEqual([
			{ tipo: "subeNivel", indice: 0, especie: "charmander", de: 15, a: 16 },
			{
				tipo: "pendienteMovimiento",
				indice: 0,
				especie: "charmander",
				movimiento: "flamethrower",
			},
		]);
		expect(r.estado.equipo[0]).toEqual({
			especie: "charmander",
			psPct: 100,
			nivel: 16,
			movimientos: ["a", "b", "c", "d"],
			recordables: ["x"],
			pendientesMovimiento: ["flamethrower"],
		});
	});

	it("conserva los pendientes previos al añadir uno nuevo", () => {
		const e = estado([
			{
				especie: "charmander",
				psPct: 100,
				nivel: 15,
				movimientos: ["a", "b", "c", "d"],
				pendientesMovimiento: ["viejo"],
			},
		]);
		const c = ctx({
			aprendizaje: { charmander: [{ nivel: 16, movimiento: "nuevo" }] },
		});
		const r = registrarVictoria(e, victoria([0]), c);
		expect(r.estado.equipo[0]?.pendientesMovimiento).toEqual([
			"viejo",
			"nuevo",
		]);
	});

	it("subir dos niveles de golpe aprende los movimientos de ambos niveles", () => {
		const e = estado([
			{
				especie: "charmander",
				psPct: 100,
				nivel: 15,
				movimientos: ["scratch"],
			},
		]);
		const c = ctx({
			aprendizaje: {
				charmander: [
					{ nivel: 16, movimiento: "ember" },
					{ nivel: 17, movimiento: "flamethrower" },
				],
			},
		});
		const r = registrarVictoria(e, victoria([0], "ecoComun"), c);
		expect(r.estado.equipo[0]?.nivel).toBe(17);
		expect(r.eventos).toEqual([
			{ tipo: "subeNivel", indice: 0, especie: "charmander", de: 15, a: 17 },
			{
				tipo: "aprende",
				indice: 0,
				especie: "charmander",
				movimiento: "ember",
			},
			{
				tipo: "aprende",
				indice: 0,
				especie: "charmander",
				movimiento: "flamethrower",
			},
		]);
		expect(r.estado.equipo[0]?.movimientos).toEqual([
			"scratch",
			"ember",
			"flamethrower",
		]);
	});
});

describe("registrarVictoria: banquillo, ponerse al día y tope", () => {
	it("el banquillo consciente gana según la tabla y el debilitado no gana nada", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 10 },
			{ especie: "bulbasaur", psPct: 50, nivel: 10 },
			{ especie: "pikachu", psPct: 0, nivel: 10 },
		]);
		const r = registrarVictoria(e, victoria([0], "ecoComun"), ctx());
		expect(r.estado.equipo.map((m) => m.nivel)).toEqual([12, 11, 10]);
		expect(r.eventos).toEqual([
			{ tipo: "subeNivel", indice: 0, especie: "charmander", de: 10, a: 12 },
			{ tipo: "subeNivel", indice: 1, especie: "bulbasaur", de: 10, a: 11 },
		]);
		// El debilitado no se toca: se conserva el mismo objeto.
		expect(r.estado.equipo[2]).toBe(e.equipo[2]);
	});

	it("un miembro 4 o más niveles por debajo del más alto gana +1 extra", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 20 },
			{ especie: "bulbasaur", psPct: 100, nivel: 15 },
		]);
		const r = registrarVictoria(e, victoria([0], "ecoComun"), ctx());
		expect(r.estado.equipo.map((m) => m.nivel)).toEqual([22, 17]);
	});

	it("el techo limita lo que sube", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 20 },
			{ especie: "bulbasaur", psPct: 100, nivel: 19 },
		]);
		const r = registrarVictoria(e, victoria([0], "jefe", 21), ctx());
		expect(r.estado.equipo.map((m) => m.nivel)).toEqual([23, 21]);
	});
});

describe("registrarVictoria: miembros sin nivel", () => {
	it("ignora a los que no tienen nivel sin entrar en el más alto", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 10 },
			{ especie: "bulbasaur", psPct: 100 },
		]);
		const r = registrarVictoria(e, victoria([0]), ctx());
		expect(r.eventos).toEqual([
			{ tipo: "subeNivel", indice: 0, especie: "charmander", de: 10, a: 11 },
		]);
		expect(r.estado.equipo[1]).toBe(e.equipo[1]);
	});

	it("si un participante no tiene nivel, se ignora sin lanzar", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 10 },
			{ especie: "bulbasaur", psPct: 100 },
		]);
		const r = registrarVictoria(e, victoria([0, 1]), ctx());
		expect(r.estado.equipo.map((m) => m.nivel)).toEqual([11, undefined]);
	});
});

describe("registrarVictoria: puedeEvolucionar", () => {
	it("las condiciones de objeto no se disparan al subir de nivel", () => {
		const e = estado([{ especie: "charmander", psPct: 100, nivel: 15 }]);
		const c = ctx({
			evoluciones: {
				charmander: [
					{ a: "x", condicion: { tipo: "objeto", objeto: "fire-stone" } },
				],
			},
		});
		const r = registrarVictoria(e, victoria([0]), c);
		expect(r.eventos.map((ev) => ev.tipo)).toEqual(["subeNivel"]);
	});

	it("una condición de nivel no cumplida no genera el evento", () => {
		const e = estado([{ especie: "charmander", psPct: 100, nivel: 15 }]);
		const c = ctx({
			evoluciones: {
				charmander: [{ a: "x", condicion: { tipo: "nivel", nivel: 20 } }],
			},
		});
		expect(registrarVictoria(e, victoria([0]), c).eventos).toEqual([
			{ tipo: "subeNivel", indice: 0, especie: "charmander", de: 15, a: 16 },
		]);
	});

	it("la amistad respeta el momento y el umbral", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 15, amistad: 4 },
		]);
		const evoluciones: Readonly<Record<string, readonly Evolucion[]>> = {
			charmander: [
				{ a: "espeon", condicion: { tipo: "amistad", momento: "dia" } },
				{ a: "umbreon", condicion: { tipo: "amistad", momento: "noche" } },
			],
		};
		const deDia = registrarVictoria(e, victoria([0]), ctx({ evoluciones }));
		expect(deDia.eventos.find((ev) => ev.tipo === "puedeEvolucionar")).toEqual({
			tipo: "puedeEvolucionar",
			indice: 0,
			especie: "charmander",
			opciones: ["espeon"],
		});
		const deNoche = registrarVictoria(
			e,
			victoria([0]),
			ctx({ evoluciones, momento: "noche" }),
		);
		expect(
			deNoche.eventos.find((ev) => ev.tipo === "puedeEvolucionar"),
		).toEqual({
			tipo: "puedeEvolucionar",
			indice: 0,
			especie: "charmander",
			opciones: ["umbreon"],
		});
		const pocaAmistad = estado([
			{ especie: "charmander", psPct: 100, nivel: 15, amistad: 3 },
		]);
		expect(
			registrarVictoria(pocaAmistad, victoria([0]), ctx({ evoluciones }))
				.eventos,
		).toEqual([
			{ tipo: "subeNivel", indice: 0, especie: "charmander", de: 15, a: 16 },
		]);
	});

	it("devuelve las opciones en el orden de las evoluciones", () => {
		const e = estado([{ especie: "charmander", psPct: 100, nivel: 15 }]);
		const c = ctx({
			evoluciones: {
				charmander: [
					{ a: "uno", condicion: { tipo: "nivel", nivel: 16 } },
					{ a: "dos", condicion: { tipo: "nivel", nivel: 10 } },
				],
			},
		});
		const evento = registrarVictoria(e, victoria([0]), c).eventos.find(
			(ev) => ev.tipo === "puedeEvolucionar",
		);
		expect(evento).toEqual({
			tipo: "puedeEvolucionar",
			indice: 0,
			especie: "charmander",
			opciones: ["uno", "dos"],
		});
	});
});

describe("registrarVictoria: contrato", () => {
	it("lanza si un participante no existe en el equipo", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 10 },
			{ especie: "bulbasaur", psPct: 100, nivel: 10 },
			{ especie: "pikachu", psPct: 100, nivel: 10 },
		]);
		for (const malo of [5, -1, 1.5]) {
			expect(() => registrarVictoria(e, victoria([malo]), ctx())).toThrow(
				RangeError,
			);
		}
	});

	it("deja pasar lo que lance subirNiveles", () => {
		const e = estado([{ especie: "charmander", psPct: 100, nivel: 10 }]);
		expect(() =>
			registrarVictoria(e, victoria([0], "salvaje", 0), ctx()),
		).toThrow(RangeError);
	});

	it("no muta el estado ni el contexto y es determinista", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 15, movimientos: ["a"] },
		]);
		const c = ctx({
			aprendizaje: { charmander: [{ nivel: 16, movimiento: "b" }] },
		});
		const antes = structuredClone(e);
		const r1 = registrarVictoria(e, victoria([0]), c);
		expect(e).toEqual(antes);
		const r2 = registrarVictoria(e, victoria([0]), c);
		expect(r1).toEqual(r2);
	});
});

describe("elegirOlvido", () => {
	const base = (): EstadoExpedicion =>
		estado([
			{
				especie: "charmander",
				psPct: 100,
				nivel: 16,
				movimientos: ["a", "b", "c", "d"],
				recordables: ["x"],
				pendientesMovimiento: ["flamethrower"],
			},
		]);

	it("sustituye en la misma posición y manda el olvidado a recordables ordenados", () => {
		const r = elegirOlvido(base(), 0, "flamethrower", "b");
		expect(r.equipo[0]).toEqual({
			especie: "charmander",
			psPct: 100,
			nivel: 16,
			movimientos: ["a", "flamethrower", "c", "d"],
			recordables: ["b", "x"],
			pendientesMovimiento: [],
		});
	});

	it("renunciar quita el pendiente sin tocar movimientos ni recordables", () => {
		const r = elegirOlvido(base(), 0, "flamethrower");
		expect(r.equipo[0]).toEqual({
			especie: "charmander",
			psPct: 100,
			nivel: 16,
			movimientos: ["a", "b", "c", "d"],
			recordables: ["x"],
			pendientesMovimiento: [],
		});
	});

	it("con hueco aprende directamente e ignora el olvido", () => {
		const e = estado([
			{
				especie: "charmander",
				psPct: 100,
				nivel: 16,
				movimientos: ["a", "b"],
				recordables: ["x"],
				pendientesMovimiento: ["flamethrower"],
			},
		]);
		const r = elegirOlvido(e, 0, "flamethrower", "a");
		expect(r.equipo[0]).toEqual({
			especie: "charmander",
			psPct: 100,
			nivel: 16,
			movimientos: ["a", "b", "flamethrower"],
			recordables: ["x"],
			pendientesMovimiento: [],
		});
	});

	it("lanza si el movimiento no es pendiente o el índice no existe", () => {
		expect(() => elegirOlvido(base(), 0, "otro", "a")).toThrow(RangeError);
		expect(() => elegirOlvido(base(), 9, "flamethrower", "a")).toThrow(
			RangeError,
		);
	});

	it("no muta el estado", () => {
		const e = base();
		const antes = structuredClone(e);
		elegirOlvido(e, 0, "flamethrower", "b");
		expect(e).toEqual(antes);
	});
});

describe("evolucionar", () => {
	const conCharmander = (): EstadoExpedicion =>
		estado([
			{
				especie: "charmander",
				uid: "u1",
				psPct: 70,
				nivel: 16,
				movimientos: ["a"],
				recordables: ["b"],
				pendientesMovimiento: ["c"],
				amistad: 3,
			},
		]);

	const EVOLUCIONES: ContextoProgresion = ctx({
		evoluciones: {
			charmander: [
				{ a: "charmeleon", condicion: { tipo: "nivel", nivel: 16 } },
			],
		},
	});

	it("cambia la especie y conserva todo lo demás", () => {
		const r = evolucionar(conCharmander(), 0, "charmeleon", EVOLUCIONES);
		expect(r.equipo[0]).toEqual({
			especie: "charmeleon",
			uid: "u1",
			psPct: 70,
			nivel: 16,
			movimientos: ["a"],
			recordables: ["b"],
			pendientesMovimiento: ["c"],
			amistad: 3,
		});
	});

	it("lanza si el destino no está disponible ahora", () => {
		const nivelInsuficiente = estado([
			{ especie: "charmander", psPct: 100, nivel: 15 },
		]);
		expect(() =>
			evolucionar(nivelInsuficiente, 0, "charmeleon", EVOLUCIONES),
		).toThrow(RangeError);

		const porObjeto = estado([
			{ especie: "charmander", psPct: 100, nivel: 16 },
		]);
		expect(() =>
			evolucionar(
				porObjeto,
				0,
				"charmeleon",
				ctx({
					evoluciones: {
						charmander: [
							{ a: "charmeleon", condicion: { tipo: "objeto", objeto: "x" } },
						],
					},
				}),
			),
		).toThrow(RangeError);

		expect(() =>
			evolucionar(conCharmander(), 0, "pikachu", EVOLUCIONES),
		).toThrow(RangeError);
	});

	it("lanza si el miembro no tiene nivel o el índice no existe", () => {
		const sinNivel = estado([{ especie: "charmander", psPct: 100 }]);
		expect(() => evolucionar(sinNivel, 0, "charmeleon", EVOLUCIONES)).toThrow(
			RangeError,
		);
		expect(() =>
			evolucionar(conCharmander(), 9, "charmeleon", EVOLUCIONES),
		).toThrow(RangeError);
	});

	it("respeta el momento en la amistad", () => {
		const e = estado([
			{ especie: "charmander", psPct: 100, nivel: 20, amistad: 4 },
		]);
		const evoluciones: Readonly<Record<string, readonly Evolucion[]>> = {
			charmander: [
				{ a: "amigo", condicion: { tipo: "amistad", momento: "dia" } },
			],
		};
		expect(() =>
			evolucionar(e, 0, "amigo", ctx({ evoluciones, momento: "noche" })),
		).toThrow(RangeError);
		expect(
			evolucionar(e, 0, "amigo", ctx({ evoluciones, momento: "dia" })).equipo[0]
				?.especie,
		).toBe("amigo");
	});

	it("no muta el estado", () => {
		const e = conCharmander();
		const antes = structuredClone(e);
		evolucionar(e, 0, "charmeleon", EVOLUCIONES);
		expect(e).toEqual(antes);
	});
});

describe("integración: subir, evolucionar y volver a subir", () => {
	it("no se rompe al progresar con la especie nueva", () => {
		const e = estado([
			{
				especie: "charmander",
				psPct: 100,
				nivel: 15,
				movimientos: ["scratch"],
			},
		]);
		const c = ctx({
			aprendizaje: {
				charmander: [{ nivel: 16, movimiento: "ember" }],
				charmeleon: [{ nivel: 17, movimiento: "flamethrower" }],
			},
			evoluciones: {
				charmander: [
					{ a: "charmeleon", condicion: { tipo: "nivel", nivel: 16 } },
				],
			},
		});
		const primera = registrarVictoria(e, victoria([0]), c);
		expect(primera.eventos.some((ev) => ev.tipo === "puedeEvolucionar")).toBe(
			true,
		);
		const evolucionado = evolucionar(primera.estado, 0, "charmeleon", c);
		expect(evolucionado.equipo[0]?.especie).toBe("charmeleon");
		const segunda = registrarVictoria(evolucionado, victoria([0]), c);
		expect(segunda.estado.equipo[0]).toEqual({
			especie: "charmeleon",
			psPct: 100,
			nivel: 17,
			movimientos: ["scratch", "ember", "flamethrower"],
			recordables: [],
		});
		expect(segunda.eventos).toEqual([
			{ tipo: "subeNivel", indice: 0, especie: "charmeleon", de: 16, a: 17 },
			{
				tipo: "aprende",
				indice: 0,
				especie: "charmeleon",
				movimiento: "flamethrower",
			},
		]);
	});
});
