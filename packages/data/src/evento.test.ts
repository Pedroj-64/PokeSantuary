import { describe, expect, it } from "vitest";
import { EventoSchema, EventosSchema, OpcionEventoSchema } from "./evento.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

/** JSON real del pack, tal cual está en el repositorio. */
const LEIDO: unknown = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/eventos.json", import.meta.url),
		"utf8",
	),
);

/** Forma suelta del JSON para romper una regla a la vez. */
interface Crudo {
	id: string;
	nodo: string;
	titulo: string;
	texto: string;
	opciones: Array<{ texto: string; efectos: Array<Record<string, unknown>> }>;
	[k: string]: unknown;
}

/** Copia independiente del pack. */
const base = (): Crudo[] => structuredClone(LEIDO) as Crudo[];

/** Valida una copia del pack con una mutación aplicada. */
const roto = (romper: (crudo: Crudo[]) => void): boolean => {
	const crudo = base();
	romper(crudo);
	return EventosSchema.safeParse(crudo).success;
};

/** Primer efecto de un evento y opción; falla si el pack no lo trae. */
const efecto = (
	crudo: Crudo[],
	id: string,
	opcion: number,
	indice = 0,
): Record<string, unknown> => {
	const evento = crudo.find((e) => e.id === id);
	const efectos = evento?.opciones[opcion]?.efectos;
	const elegido = efectos?.[indice];
	if (elegido === undefined) {
		throw new Error(
			`el pack no trae el efecto ${indice} de ${id}.op${opcion + 1}`,
		);
	}
	return elegido;
};

/** Evento con forma válida para probar reglas sueltas fuera del pack. */
const eventoBase = (): Record<string, unknown> => ({
	id: "prueba",
	nodo: "evento",
	titulo: "evento.prueba.titulo",
	texto: "evento.prueba.texto",
	opciones: [
		{ texto: "evento.prueba.op1", efectos: [{ tipo: "curar", pct: 10 }] },
		{ texto: "evento.prueba.op2", efectos: [{ tipo: "dinero", cantidad: 5 }] },
	],
});

describe("EventosSchema", () => {
	it("acepta el JSON real del pack", () => {
		const resultado = EventosSchema.safeParse(LEIDO);
		expect(resultado.success ? [] : resultado.error.issues).toEqual([]);
	});

	it("el pack trae un manantial, un cofre y al menos 4 eventos", () => {
		const eventos = EventosSchema.parse(LEIDO);
		expect(eventos.filter((e) => e.nodo === "manantial")).toHaveLength(1);
		expect(eventos.filter((e) => e.nodo === "cofre")).toHaveLength(1);
		expect(
			eventos.filter((e) => e.nodo === "evento").length,
		).toBeGreaterThanOrEqual(4);
		expect(eventos.find((e) => e.nodo === "manantial")?.id).toBe("manantial");
		expect(eventos.find((e) => e.nodo === "cofre")?.id).toBe("cofre");
	});

	it("el pack ofrece riesgo y recompensa en sus eventos", () => {
		const eventos = EventosSchema.parse(LEIDO);
		const efectos = eventos.flatMap((e) =>
			e.opciones.flatMap((o) => o.efectos),
		);
		expect(efectos.some((ef) => ef.tipo === "dinero" && ef.cantidad < 0)).toBe(
			true,
		);
		expect(efectos.some((ef) => ef.tipo === "costePs")).toBe(true);
		// La escena todavía no sabe lanzar combates de evento.
		expect(efectos.some((ef) => ef.tipo === "combate")).toBe(false);
	});

	it("las opciones del pack siguen la convención de claves", () => {
		const eventos = EventosSchema.parse(LEIDO);
		for (const evento of eventos) {
			for (const opcion of evento.opciones) {
				expect(opcion.efectos.length).toBeGreaterThanOrEqual(1);
				expect(opcion.texto.startsWith(`evento.${evento.id}.op`)).toBe(true);
			}
		}
	});

	it("rechaza un pct de 0 o de 101", () => {
		expect(roto((crudo) => (efecto(crudo, "manantial", 0).pct = 0))).toBe(
			false,
		);
		expect(roto((crudo) => (efecto(crudo, "manantial", 0).pct = 101))).toBe(
			false,
		);
		expect(roto((crudo) => (efecto(crudo, "cofre", 1).pct = 100))).toBe(false);
	});

	it("rechaza un dinero de 0", () => {
		expect(roto((crudo) => (efecto(crudo, "cofre", 0).cantidad = 0))).toBe(
			false,
		);
	});

	it("rechaza un efecto desconocido", () => {
		expect(
			roto((crudo) => {
				efecto(crudo, "manantial", 0).tipo = "teletransporte";
			}),
		).toBe(false);
	});

	it("rechaza claves extra en evento, opción y efecto", () => {
		expect(
			roto((crudo) => {
				const primero = crudo[0];
				if (!primero) throw new Error("el pack está vacío");
				primero.extra = 1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				const evento = crudo.find((e) => e.id === "pozo");
				const opcion = evento?.opciones[0];
				if (!opcion) throw new Error("el pack no trae pozo.op1");
				(opcion as Record<string, unknown>).extra = 1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				efecto(crudo, "pozo", 0).extra = 1;
			}),
		).toBe(false);
	});

	it("rechaza un combate que no sea el último efecto", () => {
		const combate = { tipo: "combate", rival: "salvaje" };
		const despues = { tipo: "dinero", cantidad: 10 };
		expect(
			OpcionEventoSchema.safeParse({
				texto: "evento.prueba.op1",
				efectos: [combate, despues],
			}).success,
		).toBe(false);
		expect(
			OpcionEventoSchema.safeParse({
				texto: "evento.prueba.op1",
				efectos: [despues, combate],
			}).success,
		).toBe(true);
	});

	it("rechaza ids repetidos", () => {
		expect(
			roto((crudo) => {
				(crudo[1] as Crudo).id = crudo[0]?.id ?? "manantial";
			}),
		).toBe(false);
	});

	it("rechaza que falte el manantial o el cofre", () => {
		expect(
			roto((crudo) => {
				crudo.splice(0, 1);
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.splice(1, 1);
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				(crudo[0] as Crudo).nodo = "evento";
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				(crudo[1] as Crudo).nodo = "evento";
			}),
		).toBe(false);
	});

	it("rechaza menos de 4 eventos comunes", () => {
		expect(
			roto((crudo) => {
				const comunes = crudo.filter((e) => e.nodo === "evento").slice(0, 3);
				crudo.splice(2, crudo.length - 2, ...comunes);
			}),
		).toBe(false);
	});

	it("rechaza opciones fuera de 2..3", () => {
		expect(
			roto((crudo) => {
				(crudo[0] as Crudo).opciones = [];
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				const opcion = crudo[2]?.opciones[0];
				if (!opcion) throw new Error("el pack no trae pozo.op1");
				(crudo[2] as Crudo).opciones = [opcion];
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				const opcion = crudo[2]?.opciones[0];
				if (!opcion) throw new Error("el pack no trae pozo.op1");
				(crudo[2] as Crudo).opciones = [opcion, opcion, opcion, opcion];
			}),
		).toBe(false);
	});

	it("rechaza una clave i18n inválida", () => {
		expect(
			roto((crudo) => {
				(crudo[0] as Crudo).titulo = "Evento del manantial";
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				(crudo[0] as Crudo).texto = "evento..texto";
			}),
		).toBe(false);
	});

	it("acepta un evento con combate al final", () => {
		const evento = eventoBase();
		evento.opciones = [
			{
				texto: "evento.prueba.op1",
				efectos: [{ tipo: "combate", rival: "sombrio" }],
			},
			{ texto: "evento.prueba.op2", efectos: [{ tipo: "curar", pct: 10 }] },
		];
		expect(EventoSchema.safeParse(evento).success).toBe(true);
		expect(EventoSchema.safeParse({ ...evento, extra: 1 }).success).toBe(false);
	});

	it("acepta las runas válidas y rechaza una inventada", () => {
		for (const runa of ["A", "C", "F", "S", "?", "aleatoria"]) {
			expect(
				OpcionEventoSchema.safeParse({
					texto: "evento.prueba.op1",
					efectos: [{ tipo: "runa", runa }],
				}).success,
			).toBe(true);
		}
		expect(
			OpcionEventoSchema.safeParse({
				texto: "evento.prueba.op1",
				efectos: [{ tipo: "runa", runa: "X" }],
			}).success,
		).toBe(false);
	});
});
