import { describe, expect, it } from "vitest";
import type { MiembroExp } from "../expedicion.js";
import { iniciarExpedicion } from "../expedicion.js";
import type { TablaSubida } from "../niveles.js";
import {
	type ContextoProgresion,
	evolucionar,
	registrarVictoria,
} from "../progresion.js";
import type { Residente } from "./estado.js";
import {
	aplicarRetorno,
	aplicarRetornoACapturado,
	type CatalogoProgresion,
	miembroDeResidente,
	miembroNuevoDeCaptura,
	nivelDeSalida,
} from "./puente.js";

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

function residente(uid: string, opciones: Partial<Residente> = {}): Residente {
	return {
		uid,
		especie: "charmander",
		naturaleza: "Hardy",
		nivel: 5,
		tipos: ["fire"],
		preferidos: ["forja"],
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

const APRENDIZAJE_CHARMANDER = [
	{ nivel: 1, movimiento: "scratch" },
	{ nivel: 1, movimiento: "growl" },
	{ nivel: 7, movimiento: "ember" },
	{ nivel: 13, movimiento: "smokescreen" },
	{ nivel: 19, movimiento: "dragon-breath" },
];

const CATALOGO: CatalogoProgresion = congelar({
	charmander: {
		aprendizaje: APRENDIZAJE_CHARMANDER,
		nivelEtapa: 0,
		tipos: ["fire"],
		preferidos: ["forja"],
		especialidades: ["calor"],
	},
	charmeleon: {
		aprendizaje: [
			{ nivel: 1, movimiento: "scratch" },
			{ nivel: 1, movimiento: "growl" },
			{ nivel: 16, movimiento: "flamethrower" },
		],
		nivelEtapa: 16,
		tipos: ["fire"],
		preferidos: ["forja", "cocina"],
		especialidades: ["calor", "vuelo"],
	},
	pikachu: {
		aprendizaje: [{ nivel: 1, movimiento: "thunder-shock" }],
		nivelEtapa: 0,
		tipos: ["electric"],
		preferidos: ["central"],
		especialidades: ["chispa"],
	},
});

const APRENDIZAJE_PIKACHU = [
	{ nivel: 1, movimiento: "impactrueno" },
	{ nivel: 4, movimiento: "onda-trueno" },
	{ nivel: 8, movimiento: "doble-equipo" },
	{ nivel: 12, movimiento: "electropelota" },
	{ nivel: 16, movimiento: "finta" },
];

const PODER_PIKACHU = {
	impactrueno: 40,
	electropelota: 0,
	finta: 30,
};

const CATALOGO_PODER: CatalogoProgresion = congelar({
	pikachu: {
		aprendizaje: APRENDIZAJE_PIKACHU,
		nivelEtapa: 0,
		tipos: ["electric"],
		preferidos: ["central"],
		especialidades: ["chispa"],
		poder: PODER_PIKACHU,
	},
});

const CATALOGO_SIN_PODER: CatalogoProgresion = congelar({
	pikachu: {
		aprendizaje: APRENDIZAJE_PIKACHU,
		nivelEtapa: 0,
		tipos: ["electric"],
		preferidos: ["central"],
		especialidades: ["chispa"],
	},
});

describe("nivelDeSalida", () => {
	it("calcula el nivel inicial con la nivelEtapa del catálogo", () => {
		expect(nivelDeSalida(0, "charmander", CATALOGO)).toBe(8);
		expect(nivelDeSalida(0, "charmeleon", CATALOGO)).toBe(14);
	});

	it("lanza si la especie no está en el catálogo", () => {
		expect(() => nivelDeSalida(0, "mew", CATALOGO)).toThrow(RangeError);
	});
});

describe("miembroDeResidente", () => {
	it("usa los movimientos iniciales si el residente no tiene", () => {
		const r = residente("r1", { nivel: 5, amistad: 2 });
		expect(miembroDeResidente(r, 0, CATALOGO)).toEqual({
			uid: "r1",
			especie: "charmander",
			psPct: 100,
			nivel: 8,
			movimientos: ["scratch", "growl", "ember"],
			recordables: [],
			amistad: 2,
		});
	});

	it("conserva los movimientos y recordables propios", () => {
		const r = residente("r2", {
			movimientos: ["ember", "scratch"],
			recordables: ["growl"],
			amistad: 4,
		});
		expect(miembroDeResidente(r, 0, CATALOGO)).toEqual({
			uid: "r2",
			especie: "charmander",
			psPct: 100,
			nivel: 8,
			movimientos: ["ember", "scratch"],
			recordables: ["growl"],
			amistad: 4,
		});
	});

	it("recorta a cuatro los movimientos del residente", () => {
		const r = residente("r3", { movimientos: ["a", "b", "c", "d", "e"] });
		expect(miembroDeResidente(r, 0, CATALOGO).movimientos).toEqual([
			"a",
			"b",
			"c",
			"d",
		]);
	});

	it("lanza si la especie no está en el catálogo", () => {
		const r = residente("r4", { especie: "mew" });
		expect(() => miembroDeResidente(r, 0, CATALOGO)).toThrow(RangeError);
	});

	it("no muta el residente", () => {
		const r = congelar(
			residente("r5", {
				movimientos: ["ember"],
				recordables: ["growl"],
				amistad: 3,
			}),
		);
		const antes = structuredClone(r);
		miembroDeResidente(r, 0, CATALOGO);
		expect(r).toEqual(antes);
	});
});

describe("poder de los movimientos en el puente", () => {
	it("miembroDeResidente usa el poder del catálogo", () => {
		const r = residente("r1", { especie: "pikachu" });
		expect(miembroDeResidente(r, 5, CATALOGO_PODER).movimientos).toEqual([
			"impactrueno",
			"doble-equipo",
			"electropelota",
			"finta",
		]);
	});

	it("miembroDeResidente sin poder conserva la regla anterior", () => {
		const r = residente("r1", { especie: "pikachu" });
		expect(miembroDeResidente(r, 5, CATALOGO_SIN_PODER).movimientos).toEqual([
			"onda-trueno",
			"doble-equipo",
			"electropelota",
			"finta",
		]);
	});

	it("miembroNuevoDeCaptura usa el poder del catálogo", () => {
		expect(
			miembroNuevoDeCaptura("pikachu", 40, 18, CATALOGO_PODER).movimientos,
		).toEqual(["impactrueno", "doble-equipo", "electropelota", "finta"]);
	});

	it("no muta el catálogo con poder", () => {
		const antes = structuredClone(CATALOGO_PODER);
		miembroNuevoDeCaptura("pikachu", 40, 18, CATALOGO_PODER);
		expect(CATALOGO_PODER).toEqual(antes);
	});
});

describe("aplicarRetorno", () => {
	it("conserva lo aprendido y no cambia el nivel si no evoluciona", () => {
		const r = residente("r1", {
			nivel: 12,
			movimientos: ["scratch"],
			recordables: ["growl"],
		});
		const m: MiembroExp = {
			uid: "r1",
			especie: "charmander",
			psPct: 100,
			nivel: 30,
			movimientos: ["scratch", "ember", "flamethrower"],
			recordables: ["growl", "smokescreen"],
		};
		const r2 = aplicarRetorno(r, m, CATALOGO, 0);
		expect(r2.especie).toBe("charmander");
		expect(r2.nivel).toBe(12);
		expect(r2.movimientos).toEqual(["scratch", "ember", "flamethrower"]);
		expect(r2.recordables).toEqual(["growl", "smokescreen"]);
	});

	it("si el miembro no trae movimientos, conserva los del residente", () => {
		const r = residente("r1", {
			movimientos: ["scratch"],
			recordables: ["growl"],
		});
		const m: MiembroExp = {
			uid: "r1",
			especie: "charmander",
			psPct: 100,
			nivel: 8,
		};
		const r2 = aplicarRetorno(r, m, CATALOGO, 0);
		expect(r2.movimientos).toEqual(["scratch"]);
		expect(r2.recordables).toEqual(["growl"]);
	});

	it("al evolucionar cambia especie, tipos y preferidos, y conserva especialidades", () => {
		const tarea: Residente["tarea"] = { tipo: "trabajo", edificio: "forja" };
		const r = residente("r1", {
			nivel: 12,
			tipos: ["fire"],
			preferidos: ["forja"],
			especialidades: { calor: 2, raices: 3 },
			usosEspecialidad: { calor: 5 },
			estado: "agotado",
			tarea,
			hambre: 55,
			amistad: 4,
		});
		const m: MiembroExp = {
			uid: "r1",
			especie: "charmeleon",
			psPct: 100,
			nivel: 16,
			movimientos: ["scratch", "ember"],
			recordables: ["growl"],
			pendientesMovimiento: ["flamethrower"],
			amistad: 4,
		};
		const r2 = aplicarRetorno(r, m, CATALOGO, 0);
		expect(r2).toEqual({
			...r,
			especie: "charmeleon",
			nivel: 14,
			tipos: ["fire"],
			preferidos: ["forja", "cocina"],
			// calor conserva su nivel, raices se queda y vuelo entra a nivel 1
			especialidades: { calor: 2, raices: 3, vuelo: 1 },
			movimientos: ["scratch", "ember"],
			recordables: ["growl"],
		});
		expect(r2.estado).toBe("agotado");
		expect(r2.tarea).toBe(tarea);
		expect(r2.hambre).toBe(55);
		expect(r2.amistad).toBe(4);
		expect("pendientesMovimiento" in r2).toBe(false);
	});

	it("lanza si la especie nueva no está en el catálogo", () => {
		const r = residente("r1");
		const m: MiembroExp = {
			uid: "r1",
			especie: "mew",
			psPct: 100,
			nivel: 16,
		};
		expect(() => aplicarRetorno(r, m, CATALOGO, 0)).toThrow(RangeError);
	});

	it("no muta el residente ni el miembro", () => {
		const r = congelar(
			residente("r1", {
				nivel: 8,
				especialidades: { calor: 2 },
				movimientos: ["scratch"],
			}),
		);
		const m = congelar<MiembroExp>({
			uid: "r1",
			especie: "charmeleon",
			psPct: 100,
			nivel: 16,
			movimientos: ["ember"],
			recordables: [],
		});
		const antesR = structuredClone(r);
		const antesM = structuredClone(m);
		aplicarRetorno(r, m, CATALOGO, 0);
		expect(r).toEqual(antesR);
		expect(m).toEqual(antesM);
	});
});

describe("miembroNuevoDeCaptura", () => {
	it("usa los movimientos iniciales y no lleva uid", () => {
		const m = miembroNuevoDeCaptura("charmander", 40, 8, CATALOGO);
		expect(m).toEqual({
			especie: "charmander",
			psPct: 40,
			nivel: 8,
			movimientos: ["scratch", "growl", "ember"],
		});
		expect("uid" in m).toBe(false);
	});

	it("lanza con especie fuera del catálogo o nivel inválido", () => {
		expect(() => miembroNuevoDeCaptura("mew", 40, 8, CATALOGO)).toThrow(
			RangeError,
		);
		expect(() => miembroNuevoDeCaptura("charmander", 40, 0, CATALOGO)).toThrow(
			RangeError,
		);
	});

	it("no muta el catálogo", () => {
		const antes = structuredClone(CATALOGO);
		miembroNuevoDeCaptura("charmander", 40, 8, CATALOGO);
		expect(CATALOGO).toEqual(antes);
	});
});

describe("aplicarRetornoACapturado", () => {
	it("devuelve copias de movimientos y recordables", () => {
		const m: MiembroExp = {
			especie: "charmander",
			psPct: 100,
			nivel: 8,
			movimientos: ["scratch", "ember"],
			recordables: ["growl"],
		};
		const p = aplicarRetornoACapturado(m);
		expect(p).toEqual({
			movimientos: ["scratch", "ember"],
			recordables: ["growl"],
		});
		expect(p.movimientos).not.toBe(m.movimientos);
		expect(p.recordables).not.toBe(m.recordables);
	});

	it("devuelve listas vacías si el miembro no las trae", () => {
		const m: MiembroExp = { especie: "charmander", psPct: 100, nivel: 8 };
		expect(aplicarRetornoACapturado(m)).toEqual({
			movimientos: [],
			recordables: [],
		});
	});

	it("no muta el miembro", () => {
		const m = congelar<MiembroExp>({
			especie: "charmander",
			psPct: 100,
			nivel: 8,
			movimientos: ["scratch"],
			recordables: ["growl"],
		});
		const antes = structuredClone(m);
		aplicarRetornoACapturado(m);
		expect(m).toEqual(antes);
	});
});

describe("ida y vuelta: residente → expedición → residente", () => {
	const TABLA: TablaSubida = congelar({
		porRival: { jefe: [8, 0], salvaje: [1, 0] },
		umbralPonerseAlDia: 4,
		extraPonerseAlDia: 1,
		margenTope: 10,
	});

	const CTX: ContextoProgresion = congelar({
		tabla: TABLA,
		aprendizaje: { charmander: APRENDIZAJE_CHARMANDER },
		evoluciones: {
			charmander: [
				{ a: "charmeleon", condicion: { tipo: "nivel", nivel: 16 } },
			],
		},
		momento: "dia",
	});

	it("sube, aprende, evoluciona y vuelve al Santuario sin romperse", () => {
		const r = residente("r1", {
			nivel: 5,
			especialidades: { calor: 2 },
			amistad: 4,
		});
		const m = miembroDeResidente(r, 0, CATALOGO);
		const e = {
			...iniciarExpedicion("s", ["charmander"]),
			equipo: [m],
		};
		const subida = registrarVictoria(
			e,
			{ rival: "jefe", participantes: [0], techo: 30 },
			CTX,
		);
		expect(subida.eventos).toContainEqual({
			tipo: "puedeEvolucionar",
			indice: 0,
			especie: "charmander",
			opciones: ["charmeleon"],
		});
		const evolucionado = evolucionar(subida.estado, 0, "charmeleon", CTX);
		const miembro = evolucionado.equipo[0] as MiembroExp;
		expect(miembro.especie).toBe("charmeleon");
		const vuelto = aplicarRetorno(r, miembro, CATALOGO, 0);
		expect(vuelto).toEqual({
			...r,
			especie: "charmeleon",
			nivel: 14,
			tipos: ["fire"],
			preferidos: ["forja", "cocina"],
			especialidades: { calor: 2, vuelo: 1 },
			movimientos: ["scratch", "growl", "ember", "smokescreen"],
			recordables: [],
		});
	});
});
