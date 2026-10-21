import { describe, expect, it } from "vitest";
import {
	costeDeSubir,
	motivoNoPuedeSubir,
	nivelMaximo,
	type OpcionesGimnasio,
	subirGimnasio,
	type TablaGimnasio,
} from "./gimnasio.js";

const TABLA: TablaGimnasio = {
	fragmentos: [2, 3, 4, 5, 6],
	pokedolares: 100,
	maximoSinSable: 3,
	descuentoSable: 0.25,
};

const RECURSOS_BASE = { fragmentos: 20, pokedolares: 1000, madera: 7 };

function opciones(sableVecino: boolean): OpcionesGimnasio {
	return { sableVecino };
}

describe("nivelMaximo", () => {
	it("sin Sable devuelve maximoSinSable (3)", () => {
		expect(nivelMaximo(TABLA, opciones(false))).toBe(3);
	});
	it("con Sable devuelve fragmentos.length (5)", () => {
		expect(nivelMaximo(TABLA, opciones(true))).toBe(5);
	});
});

describe("costeDeSubir", () => {
	it("0 → fragmentos 2, pokedolares 100", () => {
		expect(costeDeSubir(0, TABLA, opciones(false))).toEqual({
			fragmentos: 2,
			pokedolares: 100,
		});
	});
	it("2 → fragmentos 4, pokedolares 100", () => {
		expect(costeDeSubir(2, TABLA, opciones(false))).toEqual({
			fragmentos: 4,
			pokedolares: 100,
		});
	});
	it("con Sable: 0 → fragmentos 2 (1,5 sube a 2), pokedolares 75", () => {
		expect(costeDeSubir(0, TABLA, opciones(true))).toEqual({
			fragmentos: 2,
			pokedolares: 75,
		});
	});
	it("con Sable: 1 → fragmentos 3 (2,25 sube a 3), pokedolares 75", () => {
		expect(costeDeSubir(1, TABLA, opciones(true))).toEqual({
			fragmentos: 3,
			pokedolares: 75,
		});
	});
	it("con Sable: 4 → fragmentos 5 (4,5 sube a 5), pokedolares 75", () => {
		expect(costeDeSubir(4, TABLA, opciones(true))).toEqual({
			fragmentos: 5,
			pokedolares: 75,
		});
	});
	it("nivel 5 lanza RangeError", () => {
		expect(() => costeDeSubir(5, TABLA, opciones(false))).toThrow(RangeError);
	});
	it("nivel -1 lanza RangeError", () => {
		expect(() => costeDeSubir(-1, TABLA, opciones(false))).toThrow(RangeError);
	});
	it("nivel 1,5 lanza RangeError", () => {
		expect(() => costeDeSubir(1.5, TABLA, opciones(false))).toThrow(RangeError);
	});
	it("mensaje de RangeError incluye el nivel", () => {
		expect(() => costeDeSubir(5, TABLA, opciones(false))).toThrow(RangeError);
	});
});

describe("motivoNoPuedeSubir", () => {
	it("nivel 3 sin Sable → 'sable'", () => {
		expect(motivoNoPuedeSubir(3, RECURSOS_BASE, TABLA, opciones(false))).toBe(
			"sable",
		);
	});
	it("nivel 3 con Sable y recursos → undefined", () => {
		expect(
			motivoNoPuedeSubir(3, RECURSOS_BASE, TABLA, opciones(true)),
		).toBeUndefined();
	});
	it("nivel 5 → 'maximo'", () => {
		expect(motivoNoPuedeSubir(5, RECURSOS_BASE, TABLA, opciones(true))).toBe(
			"maximo",
		);
	});
	it("faltan fragmentos → 'recursos'", () => {
		const recursos = { ...RECURSOS_BASE, fragmentos: 1 };
		expect(motivoNoPuedeSubir(0, recursos, TABLA, opciones(false))).toBe(
			"recursos",
		);
	});
	it("faltan pokédólares → 'recursos'", () => {
		const recursos = { ...RECURSOS_BASE, pokedolares: 50 };
		expect(motivoNoPuedeSubir(0, recursos, TABLA, opciones(false))).toBe(
			"recursos",
		);
	});
	it("recursos exactamente justos → undefined", () => {
		const recursos = { fragmentos: 2, pokedolares: 100 };
		expect(
			motivoNoPuedeSubir(0, recursos, TABLA, opciones(false)),
		).toBeUndefined();
	});
	it("clave ausente vale 0 → 'recursos'", () => {
		expect(
			motivoNoPuedeSubir(0, { pokedolares: 100 }, TABLA, opciones(false)),
		).toBe("recursos");
		expect(
			motivoNoPuedeSubir(0, { fragmentos: 2 }, TABLA, opciones(false)),
		).toBe("recursos");
	});
	it("prioridad: 'maximo' gana a 'sable' (nivel 5 sin Sable)", () => {
		expect(motivoNoPuedeSubir(5, RECURSOS_BASE, TABLA, opciones(false))).toBe(
			"maximo",
		);
	});
	it("prioridad: 'sable' gana a 'recursos'", () => {
		const recursos = { fragmentos: 0, pokedolares: 0 };
		expect(motivoNoPuedeSubir(4, recursos, TABLA, opciones(false))).toBe(
			"sable",
		);
	});
});

describe("subirGimnasio", () => {
	it("sube de 0 a 1 gastando 2 fragmentos y 100 ₽, deja otras claves intactas", () => {
		const r = subirGimnasio(0, RECURSOS_BASE, TABLA, opciones(false));
		expect(r.nivel).toBe(1);
		expect(r.recursos.fragmentos).toBe(18);
		expect(r.recursos.pokedolares).toBe(900);
		expect(r.recursos.madera).toBe(7);
	});
	it("con Sable gasta menos (2 fragmentos, 75 pokedolares)", () => {
		const r = subirGimnasio(0, RECURSOS_BASE, TABLA, opciones(true));
		expect(r.nivel).toBe(1);
		expect(r.recursos.fragmentos).toBe(18);
		expect(r.recursos.pokedolares).toBe(925);
	});
	it("entrada congelada no se muta", () => {
		const e = Object.freeze(RECURSOS_BASE);
		expect(() => subirGimnasio(0, e, TABLA, opciones(false))).not.toThrow();
		expect(e).toEqual(RECURSOS_BASE);
	});
	it("recursos devueltos son un objeto nuevo", () => {
		const r = subirGimnasio(0, RECURSOS_BASE, TABLA, opciones(false));
		expect(r.recursos).not.toBe(RECURSOS_BASE);
	});
	it("falta de recursos lanza RangeError con el motivo", () => {
		expect(() =>
			subirGimnasio(
				0,
				{ fragmentos: 1, pokedolares: 1000 },
				TABLA,
				opciones(false),
			),
		).toThrow(/recursos/);
	});
	it("sable sin vecino lanza RangeError con el motivo", () => {
		expect(() =>
			subirGimnasio(4, RECURSOS_BASE, TABLA, opciones(false)),
		).toThrow(/sable/);
	});
	it("nivel máximo lanza RangeError con el motivo", () => {
		expect(() =>
			subirGimnasio(5, RECURSOS_BASE, TABLA, opciones(true)),
		).toThrow(/maximo/);
	});
	it("no deja subir de 5 a 6 (techo de la tabla)", () => {
		expect(() =>
			subirGimnasio(5, RECURSOS_BASE, TABLA, opciones(true)),
		).toThrow(RangeError);
	});
});
