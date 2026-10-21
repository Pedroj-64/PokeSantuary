import { describe, expect, it } from "vitest";
import {
	celebrar,
	ceremoniasDisponibles,
	type IdCeremonia,
	motivoNoPuede,
	puedeCelebrar,
	type RegistroCeremonias,
	type TablaCeremonias,
} from "./ceremonias.js";
import type { EstadoSantuario, Residente } from "./estado.js";

const TABLA: TablaCeremonias = {
	"festin-bayas": { armoniaMin: 30, coste: { bayas: 20 }, espera: 3 },
	"fogata-ascuas": {
		armoniaMin: 40,
		coste: { madera: 10 },
		espera: 3,
		soloDeNoche: true,
		requiereEspecialidad: "encender",
	},
	"bendicion-viajero": {
		armoniaMin: 50,
		coste: { bayas: 30, recuerdos: 1 },
		espera: 3,
	},
	purificacion: { armoniaMin: 40, coste: { fragmentos: 2 }, espera: 3 },
};

function residenteBase(overrides: Partial<Residente> = {}): Residente {
	return {
		uid: "r1",
		especie: "sp",
		naturaleza: "Hardy",
		nivel: 5,
		tipos: [],
		preferidos: [],
		especialidades: {},
		hambre: 50,
		animo: 50,
		amistad: 0,
		estado: "descansado",
		lecho: undefined,
		zona: 0,
		origen: "captura",
		trabajoHoy: "ninguno",
		habloHoy: false,
		peticionCumplidaHoy: false,
		...overrides,
	} as Residente;
}

function estadoBase(overrides: Partial<EstadoSantuario> = {}): EstadoSantuario {
	return {
		semilla: "s",
		jornada: 1,
		momento: "noche",
		recursos: {
			"baya:dulce": 15,
			"baya:seco": 10,
			madera: 10,
			fragmentos: 2,
			recuerdos: 1,
		},
		residentes: [],
		edificios: [],
		terreno: { ancho: 1, alto: 1, losetas: [] },
		armonia: 50,
		vistas: [],
		temaCharla: undefined,
		accionesMarcadas: [],
		habitatsCompletos: [],
		habitatsDescubiertos: [],
		habitatsPendientes: [],
		siguienteUid: 1,
		...overrides,
	};
}

const REGISTRO_VACIO: RegistroCeremonias = {};

describe("motivoNoPuede", () => {
	it("undefined si todo está bien", () => {
		const e = estadoBase();
		expect(motivoNoPuede(e, "festin-bayas", TABLA, REGISTRO_VACIO, true)).toBe(
			undefined,
		);
	});

	it("sin-altar si no hay altar", () => {
		const e = estadoBase();
		expect(motivoNoPuede(e, "festin-bayas", TABLA, REGISTRO_VACIO, false)).toBe(
			"sin-altar",
		);
	});

	it("armonia si no alcanza el mínimo", () => {
		const e = estadoBase({ armonia: 20 });
		expect(motivoNoPuede(e, "festin-bayas", TABLA, REGISTRO_VACIO, true)).toBe(
			"armonia",
		);
	});

	it("espera si no pasaron suficientes jornadas", () => {
		const e = estadoBase({ jornada: 5 });
		const registro: RegistroCeremonias = { "festin-bayas": 3 };
		expect(motivoNoPuede(e, "festin-bayas", TABLA, registro, true)).toBe(
			"espera",
		);
	});

	it("no espera si ya pasó el tiempo (jornada 6 con registro 3 y espera 3)", () => {
		const e = estadoBase({ jornada: 6 });
		const registro: RegistroCeremonias = { "festin-bayas": 3 };
		expect(motivoNoPuede(e, "festin-bayas", TABLA, registro, true)).toBe(
			undefined,
		);
	});

	it("recursos si no hay suficientes", () => {
		const e = estadoBase({ recursos: { "baya:dulce": 5 } });
		expect(motivoNoPuede(e, "festin-bayas", TABLA, REGISTRO_VACIO, true)).toBe(
			"recursos",
		);
	});

	it("noche si no es de noche", () => {
		const e = estadoBase({ momento: "alba" });
		expect(motivoNoPuede(e, "fogata-ascuas", TABLA, REGISTRO_VACIO, true)).toBe(
			"noche",
		);
	});

	it("especialidad si no hay residente apto", () => {
		const e = estadoBase({
			residentes: [residenteBase({ especialidades: {}, estado: "descansado" })],
		});
		expect(motivoNoPuede(e, "fogata-ascuas", TABLA, REGISTRO_VACIO, true)).toBe(
			"especialidad",
		);
	});

	it("prioridad: sin-altar gana a todo", () => {
		const e = estadoBase({ armonia: 0, jornada: 1, momento: "alba" });
		expect(motivoNoPuede(e, "festin-bayas", TABLA, REGISTRO_VACIO, false)).toBe(
			"sin-altar",
		);
	});

	it("prioridad: armonia gana a espera", () => {
		const e = estadoBase({ armonia: 10, jornada: 2 });
		const registro: RegistroCeremonias = { "festin-bayas": 1 };
		expect(motivoNoPuede(e, "festin-bayas", TABLA, registro, true)).toBe(
			"armonia",
		);
	});

	it("ceremonia desconocida lanza", () => {
		const e = estadoBase();
		expect(() =>
			motivoNoPuede(e, "no-existe" as IdCeremonia, TABLA, REGISTRO_VACIO, true),
		).toThrow(RangeError);
	});
});

describe("puedeCelebrar", () => {
	it("es el inverso de motivoNoPuede", () => {
		const e = estadoBase();
		expect(puedeCelebrar(e, "festin-bayas", TABLA, REGISTRO_VACIO, true)).toBe(
			true,
		);
		const e2 = estadoBase({ armonia: 5 });
		expect(puedeCelebrar(e2, "festin-bayas", TABLA, REGISTRO_VACIO, true)).toBe(
			false,
		);
	});
});

describe("celebrar - festin-bayas", () => {
	it("paga 20 bayas del conjunto, hambre 100 y ánimo +10 con tope", () => {
		// Cálculo del pago de 20 bayas con 15 dulce y 10 seco:
		// 1-5: dulce 15->10 (igualan en 10/10)
		// 6-20: alternan empezando por dulce (dulce es alfabéticamente primero)
		//   dulce: 10->2, seco: 10->3
		// Resultado esperado: baya:dulce = 2, baya:seco = 3
		const e = estadoBase({
			residentes: [
				residenteBase({ uid: "r1", hambre: 20, animo: 95 }),
				residenteBase({ uid: "r2", hambre: 40, animo: 100 }),
			],
		});
		const r = celebrar(e, "festin-bayas", TABLA, REGISTRO_VACIO, true);
		expect(r.estado.recursos["baya:dulce"]).toBe(2);
		expect(r.estado.recursos["baya:seco"]).toBe(3);
		for (const res of r.estado.residentes) {
			expect(res.hambre).toBe(100);
		}
		const r0 = r.estado.residentes[0];
		expect(r0).toBeDefined();
		if (r0) expect(r0.animo).toBe(100); // 95+10 acotado a 100
		const r1 = r.estado.residentes[1];
		expect(r1).toBeDefined();
		if (r1) expect(r1.animo).toBe(100); // ya estaba en 100
		expect(r.registro["festin-bayas"]).toBe(1);
		expect(r.eventos).toEqual([{ tipo: "ceremonia", id: "festin-bayas" }]);
	});

	it("no muta la entrada congelada", () => {
		const e = Object.freeze(estadoBase());
		const antes = JSON.stringify(e);
		expect(() =>
			celebrar(e, "festin-bayas", TABLA, REGISTRO_VACIO, true),
		).not.toThrow();
		expect(JSON.stringify(e)).toBe(antes);
	});
});

describe("celebrar - fogata-ascuas", () => {
	it("exige noche y residente descansado con especialidad encender", () => {
		const e = estadoBase({
			momento: "alba",
			residentes: [
				residenteBase({
					uid: "r1",
					especialidades: { encender: 1 },
					estado: "descansado",
				}),
			],
		});
		expect(() =>
			celebrar(e, "fogata-ascuas", TABLA, REGISTRO_VACIO, true),
		).toThrow(RangeError);
	});

	it("funciona de noche con residente apto y sube ánimo +15", () => {
		const e = estadoBase({
			residentes: [
				residenteBase({
					uid: "r1",
					especialidades: { encender: 1 },
					estado: "descansado",
					animo: 90,
				}),
			],
		});
		const r = celebrar(e, "fogata-ascuas", TABLA, REGISTRO_VACIO, true);
		const r0 = r.estado.residentes[0];
		expect(r0).toBeDefined();
		if (r0) expect(r0.animo).toBe(100); // 90+15 acotado a 100
		expect(r.estado.recursos.madera).toBe(0); // 10-10
	});
});

describe("celebrar - purificacion", () => {
	it("resta 2 de sombrio, mínimo 0, no toca estado ni residentes sin sombrío", () => {
		const e = estadoBase({
			residentes: [
				residenteBase({ uid: "r1", estado: "sombrio", sombrio: 1 }),
				residenteBase({ uid: "r2", estado: "descansado", sombrio: 3 }),
				residenteBase({ uid: "r3", estado: "descansado" }),
			],
		});
		const r = celebrar(e, "purificacion", TABLA, REGISTRO_VACIO, true);
		const r0 = r.estado.residentes[0];
		expect(r0).toBeDefined();
		if (r0) {
			expect(r0.sombrio).toBe(0);
			expect(r0.estado).toBe("sombrio"); // no cambia el estado
		}
		const r1 = r.estado.residentes[1];
		expect(r1).toBeDefined();
		if (r1) expect(r1.sombrio).toBe(1); // 3-2
		const r2 = r.estado.residentes[2];
		expect(r2).toBeDefined();
		if (r2) expect(r2.sombrio).toBeUndefined(); // sin sombrío, no toca
		expect(r.estado.recursos.fragmentos).toBe(0);
	});
});

describe("celebrar - bendicion-viajero", () => {
	it("devuelve bendicionViajero true y no cambia residentes", () => {
		const e = estadoBase({
			armonia: 60,
			recursos: {
				...estadoBase().recursos,
				"baya:dulce": 30,
				"baya:seco": 0,
				recuerdos: 1,
			},
			residentes: [residenteBase({ uid: "r1", hambre: 30, animo: 40 })],
		});
		const r = celebrar(e, "bendicion-viajero", TABLA, REGISTRO_VACIO, true);
		expect(r.bendicionViajero).toBe(true);
		const r0 = r.estado.residentes[0];
		expect(r0).toBeDefined();
		if (r0) {
			expect(r0.hambre).toBe(30);
			expect(r0.animo).toBe(40);
		}
		expect(r.estado.recursos.recuerdos).toBe(0);
		expect(r.estado.recursos["baya:dulce"]).toBe(0); // 30-30
	});
});

describe("ceremoniasDisponibles", () => {
	it("devuelve las disponibles en orden canónico", () => {
		const e = estadoBase({
			armonia: 60,
			recursos: {
				...estadoBase().recursos,
				"baya:dulce": 40,
				madera: 10,
				fragmentos: 2,
				recuerdos: 1,
			},
			residentes: [
				residenteBase({
					uid: "r1",
					especialidades: { encender: 1 },
					estado: "descansado",
				}),
			],
		});
		const disponibles = ceremoniasDisponibles(e, TABLA, REGISTRO_VACIO, true);
		expect(disponibles).toEqual([
			"festin-bayas",
			"fogata-ascuas",
			"bendicion-viajero",
			"purificacion",
		]);
	});

	it("filtra las no disponibles", () => {
		const e = estadoBase({ armonia: 20 }); // muy baja para todas
		expect(ceremoniasDisponibles(e, TABLA, REGISTRO_VACIO, true)).toEqual([]);
	});
});

describe("registro y repetición", () => {
	it("el registro devuelto es una copia nueva", () => {
		const e = estadoBase();
		const registroInicial: RegistroCeremonias = { "festin-bayas": 1 };
		const r = celebrar(e, "purificacion", TABLA, registroInicial, true);
		expect(r.registro).not.toBe(registroInicial);
		expect(r.registro.purificacion).toBe(1);
		expect(registroInicial.purificacion).toBeUndefined();
	});

	it("una ceremonia celebrada dos veces seguidas falla por espera", () => {
		const e = estadoBase({ jornada: 5 });
		const registro: RegistroCeremonias = { "festin-bayas": 5 };
		expect(motivoNoPuede(e, "festin-bayas", TABLA, registro, true)).toBe(
			"espera",
		);
		// jornada 8 con registro 5 y espera 3 -> sí se puede
		const e2 = estadoBase({ jornada: 8 });
		expect(motivoNoPuede(e2, "festin-bayas", TABLA, registro, true)).toBe(
			undefined,
		);
	});
});
