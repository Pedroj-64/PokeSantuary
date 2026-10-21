import { describe, expect, it } from "vitest";
import {
	comprarRama,
	costeDelSiguiente,
	costeTotal,
	motivoNoPuedeComprar,
	type RangosRamas,
	rangoDe,
	rangoMaximo,
	type TablaRamas,
} from "./ramas.js";

const TABLA: TablaRamas = {
	farol: [15, 40],
	"mochila-amplia": [5, 10, 20],
	"equipo-expedicion": [10, 25, 50],
	"ojo-del-coro": [30],
	"bendicion-del-alba": [20, 45],
	"raices-firmes": [15, 35],
	"afinidad-sombria": [10, 30],
	"memoria-del-eco": [20],
};

const RANGOS_VACIOS: RangosRamas = {};

describe("costeTotal", () => {
	it("es 380 comprando todas las ramas", () => {
		expect(costeTotal(TABLA)).toBe(380);
	});
});

describe("rangoMaximo", () => {
	it("farol devuelve 2", () => {
		expect(rangoMaximo("farol", TABLA)).toBe(2);
	});
	it("mochila-amplia devuelve 3", () => {
		expect(rangoMaximo("mochila-amplia", TABLA)).toBe(3);
	});
	it("ojo-del-coro devuelve 1", () => {
		expect(rangoMaximo("ojo-del-coro", TABLA)).toBe(1);
	});
	it("rama inexistente lanza RangeError", () => {
		expect(() => rangoMaximo("no-existe", TABLA)).toThrow(RangeError);
	});
});

describe("rangoDe", () => {
	it("rama ausente devuelve 0", () => {
		expect(rangoDe(RANGOS_VACIOS, "farol")).toBe(0);
		expect(rangoDe(RANGOS_VACIOS, "mochila-amplia")).toBe(0);
	});
	it("devuelve el rango comprado", () => {
		expect(rangoDe({ farol: 1 }, "farol")).toBe(1);
		expect(rangoDe({ farol: 2 }, "farol")).toBe(2);
		expect(rangoDe({ "mochila-amplia": 3 }, "mochila-amplia")).toBe(3);
	});
});

describe("costeDelSiguiente", () => {
	it("sin nada, farol cuesta 15", () => {
		expect(costeDelSiguiente("farol", RANGOS_VACIOS, TABLA)).toBe(15);
	});
	it("con farol 1, el siguiente cuesta 40", () => {
		expect(costeDelSiguiente("farol", { farol: 1 }, TABLA)).toBe(40);
	});
	it("mochila-amplia con rango 2 cuesta 20", () => {
		expect(
			costeDelSiguiente("mochila-amplia", { "mochila-amplia": 2 }, TABLA),
		).toBe(20);
	});
	it("farol al máximo lanza RangeError", () => {
		expect(() => costeDelSiguiente("farol", { farol: 2 }, TABLA)).toThrow(
			RangeError,
		);
	});
	it("rama inexistente lanza RangeError", () => {
		expect(() => costeDelSiguiente("no-existe", RANGOS_VACIOS, TABLA)).toThrow(
			RangeError,
		);
	});
});

describe("motivoNoPuedeComprar", () => {
	it("rama inexistente → 'rama'", () => {
		expect(motivoNoPuedeComprar("no-existe", RANGOS_VACIOS, 1000, TABLA)).toBe(
			"rama",
		);
	});
	it("farol al máximo → 'maximo'", () => {
		expect(motivoNoPuedeComprar("farol", { farol: 2 }, 1000, TABLA)).toBe(
			"maximo",
		);
	});
	it("14 recuerdos para farol → 'recuerdos'", () => {
		expect(motivoNoPuedeComprar("farol", RANGOS_VACIOS, 14, TABLA)).toBe(
			"recuerdos",
		);
	});
	it("exactamente 15 → undefined", () => {
		expect(motivoNoPuedeComprar("farol", RANGOS_VACIOS, 15, TABLA)).toBe(
			undefined,
		);
	});
	it("prioridad: 'rama' gana a 'maximo'", () => {
		expect(motivoNoPuedeComprar("no-existe", { farol: 2 }, 1000, TABLA)).toBe(
			"rama",
		);
	});
	it("prioridad: 'maximo' gana a 'recuerdos'", () => {
		expect(motivoNoPuedeComprar("farol", { farol: 2 }, 0, TABLA)).toBe(
			"maximo",
		);
	});
});

describe("comprarRama", () => {
	it("farol con 50 recuerdos → {farol: 1} y 35 recuerdos", () => {
		const r = comprarRama("farol", RANGOS_VACIOS, 50, TABLA);
		expect(r.rangos).toEqual({ farol: 1 });
		expect(r.recuerdos).toBe(35);
	});
	it("segunda compra de farol con 35 recuerdos lanza 'recuerdos'", () => {
		expect(() => comprarRama("farol", { farol: 1 }, 35, TABLA)).toThrow(
			/recuerdos/,
		);
	});
	it("con 100 recuerdos las dos compras de farol funcionan y sobran 45", () => {
		const r1 = comprarRama("farol", RANGOS_VACIOS, 100, TABLA);
		expect(r1.rangos).toEqual({ farol: 1 });
		expect(r1.recuerdos).toBe(85);
		const r2 = comprarRama("farol", r1.rangos, r1.recuerdos, TABLA);
		expect(r2.rangos).toEqual({ farol: 2 });
		expect(r2.recuerdos).toBe(45);
	});
	it("otras ramas intactas", () => {
		const r = comprarRama("farol", { "mochila-amplia": 2 }, 50, TABLA);
		expect(r.rangos["mochila-amplia"]).toBe(2);
		expect(r.rangos.farol).toBe(1);
	});
	it("entrada congelada no se muta", () => {
		const congelado = Object.freeze({ farol: 0 } as RangosRamas);
		expect(() => comprarRama("farol", congelado, 50, TABLA)).not.toThrow();
		expect(congelado).toEqual({ farol: 0 });
	});
	it("rangos devueltos son un objeto nuevo", () => {
		const r = comprarRama("farol", RANGOS_VACIOS, 50, TABLA);
		expect(r.rangos).not.toBe(RANGOS_VACIOS);
	});
	it("rama inexistente lanza RangeError con el motivo", () => {
		expect(() => comprarRama("no-existe", RANGOS_VACIOS, 50, TABLA)).toThrow(
			/rama/,
		);
	});
	it("al máximo lanza RangeError con el motivo", () => {
		expect(() => comprarRama("farol", { farol: 2 }, 1000, TABLA)).toThrow(
			/maximo/,
		);
	});
	it("falta de recuerdos lanza RangeError con el motivo", () => {
		expect(() => comprarRama("farol", RANGOS_VACIOS, 14, TABLA)).toThrow(
			/recuerdos/,
		);
	});
});

describe("comprar TODO en orden", () => {
	it("con 380 recuerdos deja 0 y todas las ramas al máximo", () => {
		let recuerdos = 380;
		let rangos: RangosRamas = {};
		for (const [rama, costes] of Object.entries(TABLA)) {
			for (let i = 0; i < costes.length; i++) {
				const r = comprarRama(rama, rangos, recuerdos, TABLA);
				rangos = r.rangos;
				recuerdos = r.recuerdos;
			}
		}
		expect(recuerdos).toBe(0);
		expect(rangoDe(rangos, "farol")).toBe(2);
		expect(rangoDe(rangos, "mochila-amplia")).toBe(3);
		expect(rangoDe(rangos, "equipo-expedicion")).toBe(3);
		expect(rangoDe(rangos, "ojo-del-coro")).toBe(1);
		expect(rangoDe(rangos, "bendicion-del-alba")).toBe(2);
		expect(rangoDe(rangos, "raices-firmes")).toBe(2);
		expect(rangoDe(rangos, "afinidad-sombria")).toBe(2);
		expect(rangoDe(rangos, "memoria-del-eco")).toBe(1);
	});
});
