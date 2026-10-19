import {
	crearSantuario,
	type EstadoSantuario,
	type SantuarioBalance,
} from "@santuario/core";
import { describe, expect, it } from "vitest";
import balanceCrudo from "../../../../packs/kanto/santuario.json";
import {
	bloqueado,
	edificioCercano,
	LADO,
	rectanguloDeEdificio,
	varianteDeLoseta,
} from "./colisiones.js";

const balance = balanceCrudo as unknown as SantuarioBalance;
const estado = (): EstadoSantuario => crearSantuario("s1", balance);

/** Cambia el tipo de una loseta en una copia del estado. */
const con = (e: EstadoSantuario, x: number, y: number, tipo: string) => ({
	...e,
	terreno: {
		...e.terreno,
		losetas: e.terreno.losetas.map((l, i) =>
			i === y * e.terreno.ancho + x ? { ...l, tipo: tipo as never } : l,
		),
	},
});

describe("bloqueado", () => {
	it("el borde de la isla bloquea", () => {
		const e = estado();
		expect(bloqueado(e, balance, -1, 50, 10, 6)).toBe(true);
		expect(bloqueado(e, balance, e.terreno.ancho * LADO - 5, 50, 10, 6)).toBe(
			true,
		);
	});

	it("el agua y la roca bloquean; la tierra, no", () => {
		const base = con(estado(), 3, 3, "tierra");
		const px = 3 * LADO + 3;
		const py = 3 * LADO + 3;
		expect(bloqueado(base, balance, px, py, 10, 6)).toBe(false);
		expect(bloqueado(con(base, 3, 3, "agua"), balance, px, py, 10, 6)).toBe(
			true,
		);
		expect(bloqueado(con(base, 3, 3, "roca"), balance, px, py, 10, 6)).toBe(
			true,
		);
	});

	it("el Árbol Cenit bloquea su rectángulo de 3×3 y un hueco al lado, no", () => {
		const e = estado();
		const r = rectanguloDeEdificio(e.edificios[0] as never, balance);
		expect(r.ancho).toBe(3);
		expect(
			bloqueado(e, balance, (r.x + 1) * LADO, (r.y + 1) * LADO, 4, 4),
		).toBe(true);
		const fuera = (r.x + r.ancho + 1) * LADO + 2;
		expect(
			bloqueado(
				con(e, r.x + r.ancho + 1, r.y, "tierra"),
				balance,
				fuera,
				r.y * LADO + 2,
				4,
				4,
			),
		).toBe(false);
	});

	it("un árbol, un tocón no: el árbol bloquea y el tocón se pisa", () => {
		const e = estado();
		const x = 3;
		const y = 3;
		const poner = (objeto: string) => ({
			...con(e, x, y, "pradera"),
			terreno: {
				...con(e, x, y, "pradera").terreno,
				losetas: con(e, x, y, "pradera").terreno.losetas.map((l, i) =>
					i === y * e.terreno.ancho + x ? { ...l, objeto } : l,
				),
			},
		});
		expect(
			bloqueado(poner("arbol"), balance, x * LADO + 3, y * LADO + 3, 10, 6),
		).toBe(true);
		expect(
			bloqueado(poner("tocon"), balance, x * LADO + 3, y * LADO + 3, 10, 6),
		).toBe(false);
	});
});

describe("edificioCercano", () => {
	it("devuelve el Árbol Cenit y su distancia al centro", () => {
		const e = estado();
		const r = rectanguloDeEdificio(e.edificios[0] as never, balance);
		const c = edificioCercano(
			e,
			balance,
			"arbol-cenit",
			(r.x + 1.5) * LADO,
			(r.y + 1.5) * LADO,
		);
		expect(c?.edificio.tipo).toBe("arbol-cenit");
		expect(c?.distancia).toBeCloseTo(0);
		expect(edificioCercano(e, balance, "cantera", 0, 0)).toBeUndefined();
	});
});

describe("varianteDeLoseta", () => {
	it("es determinista y está entre 0 y 3", () => {
		for (let y = 0; y < 30; y++)
			for (let x = 0; x < 40; x++) {
				const v = varianteDeLoseta(x, y);
				expect(v).toBe(varianteDeLoseta(x, y));
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThanOrEqual(3);
			}
	});
	it("usa las cuatro variantes", () => {
		const vistas = new Set<number>();
		for (let y = 0; y < 10; y++)
			for (let x = 0; x < 10; x++) vistas.add(varianteDeLoseta(x, y));
		expect(vistas.size).toBe(4);
	});
});
