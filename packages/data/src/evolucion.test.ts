import { describe, expect, it } from "vitest";
import { EvolucionesSchema } from "./evolucion.js";

interface CondicionCruda {
	tipo: string;
	[k: string]: unknown;
}

interface EvolucionCruda {
	a: string;
	condicion: CondicionCruda;
	[k: string]: unknown;
}

interface EspecieCruda {
	nivelEtapa: number;
	evoluciones: EvolucionCruda[];
	[k: string]: unknown;
}

interface Crudo {
	bulbasaur: EspecieCruda;
	pikachu: EspecieCruda;
	eevee: EspecieCruda;
	[k: string]: EspecieCruda;
}

const c = (campos: Record<string, unknown>): CondicionCruda =>
	campos as CondicionCruda;

/** Caso válido con los cinco tipos de condición. */
const VALIDO: Crudo = {
	bulbasaur: {
		nivelEtapa: 0,
		evoluciones: [{ a: "ivysaur", condicion: c({ tipo: "nivel", nivel: 16 }) }],
	},
	pikachu: {
		nivelEtapa: 10,
		evoluciones: [
			{
				a: "raichu",
				condicion: c({ tipo: "objeto", objeto: "thunder-stone" }),
			},
		],
	},
	eevee: {
		nivelEtapa: 0,
		evoluciones: [
			{ a: "espeon", condicion: c({ tipo: "amistad", momento: "dia" }) },
			{
				a: "umbreon",
				condicion: c({ tipo: "amistad", momento: "noche", nivel: 2 }),
			},
			{
				a: "golem",
				condicion: c({ tipo: "intercambio", objeto: "king-s-rock" }),
			},
			{
				a: "sylveon",
				condicion: c({
					tipo: "otra",
					detalle: "con un movimiento de tipo Hada",
				}),
			},
		],
	},
};

/** Copia independiente del caso válido. */
const base = (): Crudo => structuredClone(VALIDO) as Crudo;

/** Evolución concreta del caso crudo; falla si no existe. */
const ev = (crudo: Crudo, id: string, i: number): EvolucionCruda => {
	const entrada = crudo[id]?.evoluciones[i];
	if (!entrada) throw new Error(`el caso no trae ${id}[${i}]`);
	return entrada;
};

/** Valida una copia con una mutación aplicada. */
const roto = (romper: (crudo: Crudo) => void): boolean => {
	const crudo = base();
	romper(crudo);
	return EvolucionesSchema.safeParse(crudo).success;
};

describe("EvolucionesSchema", () => {
	it("acepta el caso válido con todos los tipos de condición", () => {
		expect(EvolucionesSchema.safeParse(VALIDO).success).toBe(true);
	});

	it("rechaza claves desconocidas en cualquier nivel", () => {
		expect(roto((e) => (e.bulbasaur.extra = 1))).toBe(false);
		expect(roto((e) => (ev(e, "bulbasaur", 0).extra = 1))).toBe(false);
		expect(roto((e) => (ev(e, "bulbasaur", 0).condicion.extra = 1))).toBe(
			false,
		);
	});

	it("rechaza una clave de especie que no es slug y un tipo inventado", () => {
		expect(
			roto((e) => (e.Bulbasaur = { nivelEtapa: 0, evoluciones: [] })),
		).toBe(false);
		expect(
			roto((e) => (ev(e, "bulbasaur", 0).condicion = c({ tipo: "magia" }))),
		).toBe(false);
	});

	it("rechaza nivel 1 y 101, no entero y momento inválido", () => {
		expect(
			roto(
				(e) =>
					(ev(e, "bulbasaur", 0).condicion = c({ tipo: "nivel", nivel: 1 })),
			),
		).toBe(false);
		expect(
			roto(
				(e) =>
					(ev(e, "bulbasaur", 0).condicion = c({ tipo: "nivel", nivel: 101 })),
			),
		).toBe(false);
		expect(
			roto(
				(e) =>
					(ev(e, "bulbasaur", 0).condicion = c({ tipo: "nivel", nivel: 16.5 })),
			),
		).toBe(false);
		expect(
			roto(
				(e) =>
					(ev(e, "eevee", 0).condicion = c({
						tipo: "amistad",
						momento: "tarde",
					})),
			),
		).toBe(false);
	});

	it("rechaza un detalle vacío en la condición 'otra'", () => {
		expect(
			roto(
				(e) => (ev(e, "eevee", 3).condicion = c({ tipo: "otra", detalle: "" })),
			),
		).toBe(false);
	});

	it("rechaza dos evoluciones al mismo destino", () => {
		expect(
			roto((e) => {
				e.bulbasaur.evoluciones = [
					{ a: "ivysaur", condicion: c({ tipo: "nivel", nivel: 16 }) },
					{ a: "ivysaur", condicion: c({ tipo: "nivel", nivel: 20 }) },
				];
			}),
		).toBe(false);
	});

	it("rechaza nivelEtapa fuera de 0..100", () => {
		expect(roto((e) => (e.bulbasaur.nivelEtapa = -1))).toBe(false);
		expect(roto((e) => (e.bulbasaur.nivelEtapa = 101))).toBe(false);
		expect(roto((e) => (e.bulbasaur.nivelEtapa = 16.5))).toBe(false);
	});
});
