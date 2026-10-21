import type {
	EventoCombate,
	MiembroPeticion,
	OpcionMovimiento,
	Peticion,
} from "@santuario/battle";
import { describe, expect, it } from "vitest";
import type { DatosPolitica } from "./politica.js";
import {
	elegirJugadaConTipos,
	puntuacionContra,
	rivalActivoTras,
} from "./politicaTipos.js";

const DATOS: DatosPolitica = {
	movimientos: {
		placaje: {
			tipo: "normal",
			categoria: "fisico",
			potencia: 40,
			precision: 100,
		},
		ascuas: {
			tipo: "fire",
			categoria: "especial",
			potencia: 40,
			precision: 100,
		},
		lanzallamas: {
			tipo: "fire",
			categoria: "especial",
			potencia: 90,
			precision: 100,
		},
		hipnosis: {
			tipo: "psychic",
			categoria: "estado",
			potencia: null,
			precision: null,
		},
	},
	tiposDe: {
		charmander: ["fire"],
		bulbasaur: ["grass", "poison"],
		squirtle: ["water"],
		gengar: ["ghost"],
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

const BANCO_DEBILITADO: MiembroPeticion = {
	especie: "squirtle",
	hp: 0,
	hpMax: 20,
	activo: false,
	debilitado: true,
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

describe("rivalActivoTras", () => {
	it("sin eventos devuelve previo", () => {
		expect(rivalActivoTras([], "charmander")).toBe("charmander");
		expect(rivalActivoTras([], undefined)).toBeUndefined();
	});

	it("con varios cambio rival devuelve el último", () => {
		const eventos: EventoCombate[] = [
			{
				tipo: "cambio",
				lado: "rival",
				especie: "bulbasaur",
				hp: 20,
				hpMax: 20,
			},
			{
				tipo: "movimiento",
				lado: "jugador",
				especie: "charmander",
				movimiento: "placaje",
			},
			{ tipo: "cambio", lado: "rival", especie: "squirtle", hp: 20, hpMax: 20 },
		];
		expect(rivalActivoTras(eventos, "charmander")).toBe("squirtle");
	});

	it("ignora los cambio del lado jugador", () => {
		const eventos: EventoCombate[] = [
			{
				tipo: "cambio",
				lado: "jugador",
				especie: "bulbasaur",
				hp: 20,
				hpMax: 20,
			},
			{ tipo: "cambio", lado: "rival", especie: "gengar", hp: 20, hpMax: 20 },
		];
		expect(rivalActivoTras(eventos, "charmander")).toBe("gengar");
	});

	it("ignora otros eventos que no son cambio", () => {
		const eventos: EventoCombate[] = [
			{ tipo: "dano", lado: "rival", hp: 10, hpMax: 20 },
			{
				tipo: "cambio",
				lado: "rival",
				especie: "bulbasaur",
				hp: 20,
				hpMax: 20,
			},
		];
		expect(rivalActivoTras(eventos, "charmander")).toBe("bulbasaur");
	});
});

describe("puntuacionContra", () => {
	it("Charmander fire vs grass: 40 × 1 × 1,5 × 2 = 120", () => {
		expect(puntuacionContra("ascuas", "charmander", "bulbasaur", DATOS)).toBe(
			120,
		);
	});

	it("Charmander fire vs water: 40 × 1 × 1,5 × 0,5 = 30", () => {
		expect(puntuacionContra("ascuas", "charmander", "squirtle", DATOS)).toBe(
			30,
		);
	});

	it("rival undefined: efectividad 1 → 40 × 1 × 1,5 × 1 = 60", () => {
		expect(puntuacionContra("ascuas", "charmander", undefined, DATOS)).toBe(60);
	});

	it("movimiento de estado vale 0", () => {
		expect(puntuacionContra("hipnosis", "charmander", "bulbasaur", DATOS)).toBe(
			0,
		);
	});

	it("movimiento desconocido vale 0", () => {
		expect(
			puntuacionContra("desconocido", "charmander", "bulbasaur", DATOS),
		).toBe(0);
	});

	it("inmune (normal contra ghost) vale 0", () => {
		expect(puntuacionContra("placaje", "charmander", "gengar", DATOS)).toBe(0);
	});

	it("precisión 50 reduce a la mitad", () => {
		const datos: DatosPolitica = {
			movimientos: {
				...DATOS.movimientos,
				ascuas: {
					tipo: "fire",
					categoria: "especial",
					potencia: 40,
					precision: 50,
				},
			},
			tiposDe: DATOS.tiposDe,
		};
		expect(puntuacionContra("ascuas", "charmander", "bulbasaur", datos)).toBe(
			60,
		);
	});
});

describe("elegirJugadaConTipos", () => {
	it("prefiere el súper efectivo aunque tenga menos potencia", () => {
		// placaje: 40 × 1 × 1 × 1 = 40 (normal vs grass-poison: 1)
		// ascuas: 40 × 1 × 1,5 × 2 = 120 (fire vs grass-poison: 2)
		const r = elegirJugadaConTipos(
			peticion(["placaje", "ascuas"]),
			DATOS,
			"bulbasaur",
		);
		expect(r).toEqual({ tipo: "movimiento", indice: 1 });
	});

	it("respeta movimientos deshabilitados", () => {
		const r = elegirJugadaConTipos(
			peticion(["ascuas", "placaje"], { deshabilitados: ["ascuas"] }),
			DATOS,
			"bulbasaur",
		);
		expect(r).toEqual({ tipo: "movimiento", indice: 1 });
	});

	it("si ningún movimiento daña cambia al primer compañero vivo", () => {
		// placaje (normal) vs gengar (ghost) es inmune = 0; hipnosis es estado = 0
		const r = elegirJugadaConTipos(
			peticion(["placaje", "hipnosis"]),
			DATOS,
			"gengar",
		);
		expect(r).toEqual({ tipo: "cambio", indice: 1 });
	});

	it("sin compañeros vivos usa el primer movimiento habilitado", () => {
		const equipo: MiembroPeticion[] = [{ ...ACTIVO }, { ...BANCO_DEBILITADO }];
		const r = elegirJugadaConTipos(
			peticion(["placaje", "hipnosis"], { equipo }),
			DATOS,
			"gengar",
		);
		expect(r).toEqual({ tipo: "movimiento", indice: 0 });
	});

	it("sin compañeros vivos usa el primer movimiento habilitado", () => {
		const equipo: MiembroPeticion[] = [{ ...ACTIVO }, { ...BANCO_DEBILITADO }];
		const r = elegirJugadaConTipos(
			peticion(["placaje", "hipnosis"], { equipo }),
			DATOS,
			"gengar",
		);
		expect(r).toEqual({ tipo: "movimiento", indice: 0 });
	});

	it("cambio forzado → primer compañero vivo", () => {
		const equipo: MiembroPeticion[] = [
			{ ...ACTIVO, hp: 0, debilitado: true, activo: false },
			{ ...BANCO },
		];
		const r = elegirJugadaConTipos(
			peticion(["placaje"], { tipo: "cambio-forzado", equipo }),
			DATOS,
			"bulbasaur",
		);
		expect(r).toEqual({ tipo: "cambio", indice: 1 });
	});

	it("empates → el primero de la lista", () => {
		const r = elegirJugadaConTipos(
			peticion(["placaje", "ascuas"]),
			DATOS,
			undefined,
		);
		// placaje: 40 × 1 × 1 × 1 = 40; ascuas: 40 × 1 × 1,5 × 1 = 60 → ascuas gana
		expect(r).toEqual({ tipo: "movimiento", indice: 1 });
	});

	it("si no hay ningún movimiento habilitado cambia al primer compañero vivo", () => {
		const r = elegirJugadaConTipos(
			peticion(["hipnosis"], { deshabilitados: ["hipnosis"] }),
			DATOS,
			"bulbasaur",
		);
		expect(r).toEqual({ tipo: "cambio", indice: 1 });
	});

	it("entrada congelada no se muta", () => {
		const p = Object.freeze(peticion(["placaje", "ascuas"]));
		const d = Object.freeze(DATOS);
		expect(() => elegirJugadaConTipos(p, d, "bulbasaur")).not.toThrow();
		expect(p).toEqual(peticion(["placaje", "ascuas"]));
		expect(d).toEqual(DATOS);
	});
});
