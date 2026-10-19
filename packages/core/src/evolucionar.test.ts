import { describe, expect, it } from "vitest";
import {
	type ContextoEvolucion,
	type Evolucion,
	evolucionesDisponibles,
} from "./evolucionar.js";

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

const ctx = (parcial: Partial<ContextoEvolucion> = {}): ContextoEvolucion =>
	congelar({
		nivel: 10,
		amistad: 0,
		momento: "dia",
		...parcial,
	});

const CHARMANDER: readonly Evolucion[] = congelar([
	{ a: "charmeleon", condicion: { tipo: "nivel", nivel: 16 } },
]);

const PIKACHU: readonly Evolucion[] = congelar([
	{ a: "raichu", condicion: { tipo: "objeto", objeto: "thunder-stone" } },
]);

const EEVEE: readonly Evolucion[] = congelar([
	{ a: "espeon", condicion: { tipo: "amistad", momento: "dia" } },
	{ a: "umbreon", condicion: { tipo: "amistad", momento: "noche" } },
	{ a: "vaporeon", condicion: { tipo: "objeto", objeto: "water-stone" } },
	{ a: "jolteon", condicion: { tipo: "objeto", objeto: "thunder-stone" } },
	{ a: "flareon", condicion: { tipo: "objeto", objeto: "fire-stone" } },
	{ a: "leafeon", condicion: { tipo: "objeto", objeto: "leaf-stone" } },
	{ a: "glaceon", condicion: { tipo: "objeto", objeto: "ice-stone" } },
	{ a: "sylveon", condicion: { tipo: "otra", detalle: "movimiento Hada" } },
]);

const GOLBAT: readonly Evolucion[] = congelar([
	{ a: "crobat", condicion: { tipo: "amistad" } },
]);

const KADABRA: readonly Evolucion[] = congelar([
	{ a: "alakazam", condicion: { tipo: "intercambio" } },
]);

const conObjetoDeIntercambio: readonly Evolucion[] = congelar([
	{ a: "scizor", condicion: { tipo: "intercambio", objeto: "metal-coat" } },
]);

const conNivelDeAmistad: readonly Evolucion[] = congelar([
	{ a: "amigo", condicion: { tipo: "amistad", nivel: 20 } },
]);

const SOLO_OTRA: readonly Evolucion[] = congelar([
	{ a: "raro", condicion: { tipo: "otra", detalle: "sin uso" } },
]);

describe("evolucionesDisponibles por nivel", () => {
	it("exige el nivel exacto y sigue disponible por encima", () => {
		expect(evolucionesDisponibles(CHARMANDER, ctx({ nivel: 15 }))).toEqual([]);
		expect(evolucionesDisponibles(CHARMANDER, ctx({ nivel: 16 }))).toEqual([
			{ a: "charmeleon", condicion: { tipo: "nivel", nivel: 16 } },
		]);
		expect(evolucionesDisponibles(CHARMANDER, ctx({ nivel: 40 }))).toHaveLength(
			1,
		);
	});
});

describe("evolucionesDisponibles por objeto", () => {
	it("exige la piedra exacta", () => {
		expect(
			evolucionesDisponibles(PIKACHU, ctx({ objeto: "thunder-stone" })),
		).toHaveLength(1);
		expect(evolucionesDisponibles(PIKACHU, ctx())).toEqual([]);
		expect(
			evolucionesDisponibles(PIKACHU, ctx({ objeto: "water-stone" })),
		).toEqual([]);
	});
});

describe("evolucionesDisponibles por amistad", () => {
	it("Espeon de día y Umbreon de noche", () => {
		expect(
			evolucionesDisponibles(EEVEE, ctx({ amistad: 4, momento: "dia" })),
		).toEqual([
			{ a: "espeon", condicion: { tipo: "amistad", momento: "dia" } },
		]);
		expect(
			evolucionesDisponibles(EEVEE, ctx({ amistad: 4, momento: "alba" })),
		).toHaveLength(1);
		expect(
			evolucionesDisponibles(EEVEE, ctx({ amistad: 4, momento: "noche" })),
		).toEqual([
			{ a: "umbreon", condicion: { tipo: "amistad", momento: "noche" } },
		]);
		expect(
			evolucionesDisponibles(EEVEE, ctx({ amistad: 4, momento: "atardecer" })),
		).toHaveLength(1);
	});

	it("no evoluciona con amistad 3", () => {
		expect(
			evolucionesDisponibles(EEVEE, ctx({ amistad: 3, momento: "dia" })),
		).toEqual([]);
	});

	it("las piedras de Eevee dan la evolución correspondiente", () => {
		expect(
			evolucionesDisponibles(EEVEE, ctx({ objeto: "thunder-stone" })),
		).toEqual([
			{ a: "jolteon", condicion: { tipo: "objeto", objeto: "thunder-stone" } },
		]);
		expect(
			evolucionesDisponibles(EEVEE, ctx({ objeto: "water-stone" })),
		).toEqual([
			{ a: "vaporeon", condicion: { tipo: "objeto", objeto: "water-stone" } },
		]);
		expect(
			evolucionesDisponibles(EEVEE, ctx({ objeto: "fire-stone" })),
		).toHaveLength(1);
		expect(
			evolucionesDisponibles(EEVEE, ctx({ objeto: "leaf-stone" })),
		).toHaveLength(1);
		expect(
			evolucionesDisponibles(EEVEE, ctx({ objeto: "ice-stone" })),
		).toHaveLength(1);
	});

	it("Golbat evoluciona a Crobat con amistad, sin importar el momento", () => {
		expect(
			evolucionesDisponibles(GOLBAT, ctx({ amistad: 4, momento: "dia" })),
		).toEqual([{ a: "crobat", condicion: { tipo: "amistad" } }]);
		expect(
			evolucionesDisponibles(GOLBAT, ctx({ amistad: 4, momento: "atardecer" })),
		).toHaveLength(1);
		expect(
			evolucionesDisponibles(GOLBAT, ctx({ amistad: 3, momento: "noche" })),
		).toEqual([]);
	});

	it("la condición de amistad con nivel exige ambos", () => {
		expect(
			evolucionesDisponibles(conNivelDeAmistad, ctx({ amistad: 4, nivel: 19 })),
		).toEqual([]);
		expect(
			evolucionesDisponibles(conNivelDeAmistad, ctx({ amistad: 4, nivel: 20 })),
		).toEqual([{ a: "amigo", condicion: { tipo: "amistad", nivel: 20 } }]);
		expect(
			evolucionesDisponibles(conNivelDeAmistad, ctx({ amistad: 3, nivel: 30 })),
		).toEqual([]);
	});
});

describe("evolucionesDisponibles por intercambio y 'otra'", () => {
	it("solo con intercambio verdadero", () => {
		expect(
			evolucionesDisponibles(KADABRA, ctx({ intercambio: true })),
		).toHaveLength(1);
		expect(
			evolucionesDisponibles(KADABRA, ctx({ intercambio: false })),
		).toEqual([]);
		expect(evolucionesDisponibles(KADABRA, ctx())).toEqual([]);
	});

	it("el objeto equipado debe coincidir", () => {
		expect(
			evolucionesDisponibles(
				conObjetoDeIntercambio,
				ctx({ intercambio: true, objetoEquipado: "metal-coat" }),
			),
		).toHaveLength(1);
		expect(
			evolucionesDisponibles(
				conObjetoDeIntercambio,
				ctx({ intercambio: true, objetoEquipado: "otro" }),
			),
		).toEqual([]);
	});

	it("las de tipo 'otra' nunca se cumplen", () => {
		expect(
			evolucionesDisponibles(
				SOLO_OTRA,
				ctx({
					nivel: 100,
					amistad: 5,
					objeto: "thunder-stone",
					intercambio: true,
					objetoEquipado: "metal-coat",
				}),
			),
		).toEqual([]);
	});
});

describe("evolucionesDisponibles: contrato", () => {
	it("respeta el orden de entrada y devuelve una lista nueva", () => {
		const lista: readonly Evolucion[] = congelar([
			{ a: "primero", condicion: { tipo: "nivel", nivel: 5 } },
			{ a: "segundo", condicion: { tipo: "objeto", objeto: "piedra" } },
		]);
		const r = evolucionesDisponibles(
			lista,
			ctx({ nivel: 5, objeto: "piedra" }),
		);
		expect(r.map((e) => e.a)).toEqual(["primero", "segundo"]);
		expect(r).not.toBe(lista);
	});

	it("no muta las entradas", () => {
		const lista: readonly Evolucion[] = congelar([
			{ a: "espeon", condicion: { tipo: "amistad", momento: "dia" } },
			{ a: "jolteon", condicion: { tipo: "objeto", objeto: "thunder-stone" } },
		]);
		const antes = structuredClone(lista);
		const contexto = ctx({ amistad: 4, objeto: "thunder-stone" });
		const antesCtx = structuredClone(contexto);
		evolucionesDisponibles(lista, contexto);
		expect(lista).toEqual(antes);
		expect(contexto).toEqual(antesCtx);
	});

	it("lanza con un contexto inválido", () => {
		for (const nivel of [0, -1, 1.5, Number.NaN]) {
			expect(() => evolucionesDisponibles(CHARMANDER, ctx({ nivel }))).toThrow(
				RangeError,
			);
		}
		for (const amistad of [-1, 6, 2.5, Number.NaN]) {
			expect(() =>
				evolucionesDisponibles(CHARMANDER, ctx({ amistad })),
			).toThrow(RangeError);
		}
	});
});
