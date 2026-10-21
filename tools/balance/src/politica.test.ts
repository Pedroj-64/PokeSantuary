import type {
	MiembroPeticion,
	OpcionMovimiento,
	Peticion,
} from "@santuario/battle";
import { describe, expect, it } from "vitest";
import { cargarDatosPack } from "./datos.js";
import {
	type DatosPolitica,
	elegirJugadaInteligente,
	poderDeMovimientos,
} from "./politica.js";

const DATOS: DatosPolitica = {
	movimientos: {
		tackle: {
			tipo: "normal",
			categoria: "fisico",
			potencia: 40,
			precision: 100,
		},
		ember: {
			tipo: "fire",
			categoria: "especial",
			potencia: 35,
			precision: 100,
		},
		"fire-fang": {
			tipo: "fire",
			categoria: "fisico",
			potencia: 65,
			precision: 95,
		},
		scratch: {
			tipo: "normal",
			categoria: "fisico",
			potencia: 40,
			precision: 100,
		},
		inferno: {
			tipo: "fire",
			categoria: "especial",
			potencia: 100,
			precision: 50,
		},
		growl: {
			tipo: "normal",
			categoria: "estado",
			potencia: null,
			precision: null,
		},
		leer: {
			tipo: "normal",
			categoria: "estado",
			potencia: null,
			precision: null,
		},
	},
	tiposDe: {
		charmander: ["fire"],
		bulbasaur: ["grass", "poison"],
	},
};

const ACTIVO: MiembroPeticion = {
	especie: "charmander",
	hp: 20,
	hpMax: 20,
	activo: true,
	debilitado: false,
};

const BANCO: MiembroPeticion = {
	especie: "bulbasaur",
	hp: 20,
	hpMax: 20,
	activo: false,
	debilitado: false,
};

function peticion(
	movimientos: readonly string[],
	opciones: {
		tipo?: Peticion["tipo"];
		deshabilitados?: readonly string[];
		equipo?: readonly MiembroPeticion[];
	} = {},
): Peticion {
	const deshabilitados = new Set(opciones.deshabilitados ?? []);
	const opcionesMovimiento: OpcionMovimiento[] = movimientos.map(
		(movimiento) => ({
			movimiento,
			pp: 10,
			ppMax: 10,
			deshabilitado: deshabilitados.has(movimiento),
		}),
	);
	return {
		lado: "jugador",
		tipo: opciones.tipo ?? "movimiento",
		movimientos: opcionesMovimiento,
		equipo: [...(opciones.equipo ?? [ACTIVO, BANCO])],
	};
}

describe("elegirJugadaInteligente", () => {
	it("prefiere el movimiento de mayor puntuación con STAB", () => {
		// Placaje: 40 × 1 × 1 = 40. Ascuas: 35 × 1 × 1,5 = 52,5.
		const r = elegirJugadaInteligente(peticion(["tackle", "ember"]), DATOS);
		expect(r).toEqual({ tipo: "movimiento", indice: 1 });
	});

	it("tiene en cuenta la precisión además de la potencia y el STAB", () => {
		// Infierno: 100 × 0,5 × 1,5 = 75.
		// Colmillo Ígneo: 65 × 0,95 × 1,5 = 92,625.
		const r = elegirJugadaInteligente(
			peticion(["inferno", "fire-fang"]),
			DATOS,
		);
		expect(r).toEqual({ tipo: "movimiento", indice: 1 });
	});

	it("en un empate se queda con el primero de la lista", () => {
		const r = elegirJugadaInteligente(peticion(["tackle", "scratch"]), DATOS);
		expect(r).toEqual({ tipo: "movimiento", indice: 0 });
	});

	it("respeta los movimientos deshabilitados", () => {
		const r = elegirJugadaInteligente(
			peticion(["ember", "tackle"], { deshabilitados: ["ember"] }),
			DATOS,
		);
		expect(r).toEqual({ tipo: "movimiento", indice: 1 });
	});

	it("si todo es de estado usa el primer movimiento no deshabilitado", () => {
		const r = elegirJugadaInteligente(
			peticion(["growl", "leer"], { deshabilitados: ["growl"] }),
			DATOS,
		);
		expect(r).toEqual({ tipo: "movimiento", indice: 1 });
	});

	it("en un cambio forzado elige el primer compañero vivo", () => {
		const equipo: MiembroPeticion[] = [
			{
				especie: "charmander",
				hp: 0,
				hpMax: 20,
				activo: false,
				debilitado: true,
			},
			{
				especie: "bulbasaur",
				hp: 20,
				hpMax: 20,
				activo: false,
				debilitado: false,
			},
			{
				especie: "squirtle",
				hp: 20,
				hpMax: 20,
				activo: false,
				debilitado: false,
			},
		];
		const r = elegirJugadaInteligente(
			peticion([], { tipo: "cambio-forzado", equipo }),
			DATOS,
		);
		expect(r).toEqual({ tipo: "cambio", indice: 1 });
	});

	it("si no queda ningún movimiento habilitado cambia al primer compañero vivo", () => {
		const r = elegirJugadaInteligente(
			peticion(["growl"], { deshabilitados: ["growl"] }),
			DATOS,
		);
		expect(r).toEqual({ tipo: "cambio", indice: 1 });
	});

	it("nunca cambia por iniciativa propia", () => {
		const r = elegirJugadaInteligente(peticion(["tackle"]), DATOS);
		expect(r).toEqual({ tipo: "movimiento", indice: 0 });
	});

	it("con datos de movimiento desconocidos cae al primer habilitado", () => {
		const r = elegirJugadaInteligente(
			peticion(["desconocido", "growl"]),
			DATOS,
		);
		expect(r).toEqual({ tipo: "movimiento", indice: 0 });
	});

	it("no muta la petición ni los datos", () => {
		const p = peticion(["tackle", "ember"]);
		const antesP = structuredClone(p);
		const antesDatos = structuredClone(DATOS);
		elegirJugadaInteligente(p, DATOS);
		expect(p).toEqual(antesP);
		expect(DATOS).toEqual(antesDatos);
	});
});

describe("poderDeMovimientos", () => {
	it("mapea la potencia y cuenta los movimientos de estado como 0", () => {
		expect(poderDeMovimientos(DATOS)).toEqual({
			tackle: 40,
			ember: 35,
			"fire-fang": 65,
			scratch: 40,
			inferno: 100,
			growl: 0,
			leer: 0,
		});
	});
});

describe("cargarDatosPack con política", () => {
	it("solo adjunta la política si se pide", () => {
		expect(cargarDatosPack().politica).toBeUndefined();
		const politica = cargarDatosPack({ politica: true }).politica;
		expect(politica).toBeDefined();
		expect(politica?.movimientos.tackle).toEqual({
			tipo: "normal",
			categoria: "fisico",
			potencia: 40,
			precision: 100,
		});
		expect(politica?.tiposDe.charmander).toEqual(["fire"]);
	});
});
