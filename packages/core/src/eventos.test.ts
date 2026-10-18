import { describe, expect, it } from "vitest";
import {
	aplicarEfecto,
	type Efecto,
	type EventoElegible,
	elegirEvento,
	type NodoEvento,
	sustituirRuna,
} from "./eventos.js";
import { type EstadoExpedicion, iniciarExpedicion } from "./expedicion.js";
import { crearRng } from "./rng.js";
import { type IdRuna, MAX_RUNAS } from "./runas.js";

/** Congela en profundidad para detectar mutaciones. */
function congelar<T>(valor: T): T {
	if (valor === null || typeof valor !== "object") return valor;
	Object.freeze(valor);
	for (const hijo of Object.values(valor as Record<string, unknown>)) {
		congelar(hijo);
	}
	return valor;
}

/** Estado de prueba con equipo, dinero y runas a medida. */
function estado(
	opciones: { equipo?: number[]; dinero?: number; runas?: IdRuna[] } = {},
): EstadoExpedicion {
	const equipo = opciones.equipo ?? [100];
	const base = iniciarExpedicion(
		"s",
		equipo.map(() => "pikachu"),
	);
	return {
		...base,
		equipo: equipo.map((psPct) => ({ especie: "pikachu", psPct })),
		dinero: opciones.dinero ?? 0,
		runas: opciones.runas ?? [],
	};
}

/** PS del equipo, en el orden de la expedición. */
const ps = (e: EstadoExpedicion): number[] => e.equipo.map((m) => m.psPct);

/** Evento de prueba: solo el nodo importa para el sorteo. */
interface EventoPrueba extends EventoElegible {
	id: string;
}

const EVENTOS: readonly EventoPrueba[] = [
	{ id: "e1", nodo: "evento" },
	{ id: "e2", nodo: "evento" },
	{ id: "e3", nodo: "evento" },
	{ id: "m", nodo: "manantial" },
	{ id: "c", nodo: "cofre" },
];

describe("aplicarEfecto", () => {
	it("cura sin revivir a los debilitados", () => {
		const r = aplicarEfecto(
			estado({ equipo: [0, 50] }),
			{ tipo: "curar", pct: 50 },
			crearRng("c"),
		);
		expect(ps(r.estado)).toEqual([0, 100]);
	});

	it("cura sin pasar de 100", () => {
		const r = aplicarEfecto(
			estado({ equipo: [90, 100] }),
			{ tipo: "curar", pct: 50 },
			crearRng("c"),
		);
		expect(ps(r.estado)).toEqual([100, 100]);
	});

	it("rechaza un pct de cura fuera de 1..100", () => {
		const e = estado();
		expect(() =>
			aplicarEfecto(e, { tipo: "curar", pct: 0 }, crearRng("c")),
		).toThrow(RangeError);
		expect(() =>
			aplicarEfecto(e, { tipo: "curar", pct: 101 }, crearRng("c")),
		).toThrow(RangeError);
	});

	it("suma dinero y nunca lo deja por debajo de 0", () => {
		expect(
			aplicarEfecto(
				estado({ dinero: 30 }),
				{ tipo: "dinero", cantidad: 20 },
				crearRng("d"),
			).estado.dinero,
		).toBe(50);
		expect(
			aplicarEfecto(
				estado({ dinero: 10 }),
				{ tipo: "dinero", cantidad: -999 },
				crearRng("d"),
			).estado.dinero,
		).toBe(0);
	});

	it("costePs deja a los vivos en 1 o más y a los caídos en 0", () => {
		const r = aplicarEfecto(
			estado({ equipo: [100, 50, 1, 0] }),
			{ tipo: "costePs", pct: 20 },
			crearRng("d"),
		);
		expect(ps(r.estado)).toEqual([80, 30, 1, 0]);
	});

	it("añade una runa concreta que no tenía", () => {
		const r = aplicarEfecto(
			estado({ runas: ["A"] }),
			{ tipo: "runa", runa: "F" },
			crearRng("r"),
		);
		expect(r.estado.runas).toEqual(["A", "F"]);
		expect(r.ofreceSustituir).toBeUndefined();
	});

	it("no hace nada si ya tiene la runa", () => {
		const antes = estado({ runas: ["A"] });
		const r = aplicarEfecto(antes, { tipo: "runa", runa: "A" }, crearRng("r"));
		expect(r.estado).toEqual(antes);
		expect(r.ofreceSustituir).toBeUndefined();
	});

	it("con la mochila llena ofrece sustituir y deja el estado intacto", () => {
		// MAX_RUNAS coincide hoy con el número de ids, así que una mochila llena
		// siempre tiene todas las runas. Se duplica una a propósito para llegar
		// al tope sin tener la que se pide y cubrir la guarda.
		const lleno = estado({ runas: ["A", "A", "C", "F", "S"] });
		expect(lleno.runas).toHaveLength(MAX_RUNAS);
		const r = aplicarEfecto(lleno, { tipo: "runa", runa: "?" }, crearRng("r"));
		expect(r.estado).toEqual(lleno);
		expect(r.ofreceSustituir).toBe("?");
	});

	it("elige una runa aleatoria que no tenga, igual con la misma semilla", () => {
		for (let i = 0; i < 50; i++) {
			const semilla = `r${i}`;
			const antes = estado({ runas: ["A", "?"] });
			const uno = aplicarEfecto(
				antes,
				{ tipo: "runa", runa: "aleatoria" },
				crearRng(semilla),
			);
			const otro = aplicarEfecto(
				antes,
				{ tipo: "runa", runa: "aleatoria" },
				crearRng(semilla),
			);
			expect(uno.estado).toEqual(otro.estado);
			const nueva = uno.estado.runas[uno.estado.runas.length - 1];
			expect(["C", "F", "S"]).toContain(nueva);
			expect(uno.estado.runas.filter((runa) => runa === nueva)).toHaveLength(1);
			expect(uno.estado.runas).toHaveLength(3);
		}
	});

	it("con las cuatro runas reales no añade nada", () => {
		const antes = estado({ runas: ["A", "C", "F", "S"] });
		const r = aplicarEfecto(
			antes,
			{ tipo: "runa", runa: "aleatoria" },
			crearRng("r"),
		);
		expect(r.estado).toEqual(antes);
		expect(r.ofreceSustituir).toBeUndefined();
	});

	it("un combate no toca el estado y dice el rival", () => {
		const antes = estado({ equipo: [30] });
		const r = aplicarEfecto(
			antes,
			{ tipo: "combate", rival: "sombrio" },
			crearRng("c"),
		);
		expect(r.estado).toBe(antes);
		expect(r.combate).toBe("sombrio");
		expect(r.ofreceSustituir).toBeUndefined();
	});

	it("no muta el estado ni el efecto recibidos", () => {
		const antes = congelar(
			estado({ equipo: [80, 0], dinero: 20, runas: ["A", "C"] }),
		);
		const copia = JSON.stringify(antes);
		const efectos: Efecto[] = [
			{ tipo: "curar", pct: 30 },
			{ tipo: "dinero", cantidad: -50 },
			{ tipo: "costePs", pct: 10 },
			{ tipo: "runa", runa: "F" },
			{ tipo: "runa", runa: "aleatoria" },
			{ tipo: "combate", rival: "salvaje" },
		];
		for (const efecto of efectos) {
			aplicarEfecto(antes, congelar(efecto), crearRng("m"));
		}
		expect(JSON.stringify(antes)).toBe(copia);
	});

	it("rechaza una expedición que ya terminó", () => {
		const e = { ...estado(), estado: "victoria" as const };
		expect(() =>
			aplicarEfecto(e, { tipo: "dinero", cantidad: 10 }, crearRng("v")),
		).toThrow(RangeError);
	});

	it("rechaza un efecto desconocido y dice cuál llegó", () => {
		const e = estado();
		expect(() =>
			aplicarEfecto(
				e,
				{ tipo: "teletransporte" } as unknown as Efecto,
				crearRng("x"),
			),
		).toThrow("teletransporte");
	});
});

describe("sustituirRuna", () => {
	it("cambia la runa en su sitio sin tocar la entrada", () => {
		const antes = congelar(estado({ runas: ["A", "C", "F"] }));
		const despues = sustituirRuna(antes, "C", "S");
		expect(despues.runas).toEqual(["A", "S", "F"]);
		expect(antes.runas).toEqual(["A", "C", "F"]);
		expect(despues).not.toBe(antes);
	});

	it("rechaza quitar una runa que no tienes o añadir una que ya tienes", () => {
		const e = estado({ runas: ["A", "C"] });
		expect(() => sustituirRuna(e, "F", "S")).toThrow(RangeError);
		expect(() => sustituirRuna(e, "A", "C")).toThrow(RangeError);
		expect(() => sustituirRuna(e, "A", "A")).toThrow(RangeError);
	});

	it("rechaza ids que no son runas", () => {
		const e = estado({ runas: ["A"] });
		expect(() => sustituirRuna(e, "X" as IdRuna, "F")).toThrow(RangeError);
		expect(() => sustituirRuna(e, "A", "X" as IdRuna)).toThrow(RangeError);
	});
});

describe("elegirEvento", () => {
	it("es determinista", () => {
		for (const semilla of ["s1", "s2", "ñandú"]) {
			expect(elegirEvento(EVENTOS, semilla, 2, "3-1", "evento").id).toBe(
				elegirEvento(EVENTOS, semilla, 2, "3-1", "evento").id,
			);
		}
	});

	it("solo devuelve eventos del nodo pedido", () => {
		expect(elegirEvento(EVENTOS, "s", 1, "1-0", "manantial").id).toBe("m");
		expect(elegirEvento(EVENTOS, "s", 1, "1-0", "cofre").id).toBe("c");
		const elegido = elegirEvento(EVENTOS, "s", 1, "1-0", "evento");
		expect(elegido.nodo).toBe("evento");
	});

	it("cambia el elegido según la semilla, el piso o el nodo", () => {
		const firmas = new Set([
			elegirEvento(EVENTOS, "s", 1, "1-0", "evento").id,
			elegirEvento(EVENTOS, "s", 2, "1-0", "evento").id,
			elegirEvento(EVENTOS, "s", 1, "2-0", "evento").id,
			elegirEvento(EVENTOS, "s", 1, "3-1", "evento").id,
			elegirEvento(EVENTOS, "otra", 1, "1-0", "evento").id,
		]);
		expect(firmas.size).toBeGreaterThan(1);
	});

	it("rechaza un nodo sin eventos y un piso fuera de 1..3", () => {
		const sinCofre = EVENTOS.filter(
			(evento): evento is EventoPrueba => evento.nodo !== "cofre",
		);
		expect(() => elegirEvento(sinCofre, "s", 1, "1-0", "cofre")).toThrow(
			RangeError,
		);
		expect(() =>
			elegirEvento(EVENTOS, "s", 4 as 1 | 2 | 3, "1-0", "evento" as NodoEvento),
		).toThrow(RangeError);
	});
});
