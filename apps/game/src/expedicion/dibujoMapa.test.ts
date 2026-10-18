import { generarPiso } from "@santuario/core";
import { describe, expect, it } from "vitest";
import { posicionesNodos } from "./dibujoMapa.js";

const ANCHO = 480;
const ALTO = 270;

describe("posicionesNodos", () => {
	it("da una posición entera a cada nodo, dentro de la pantalla y de los márgenes", () => {
		for (let i = 0; i < 100; i++) {
			const mapa = generarPiso(`s${i}`, 1);
			const pos = posicionesNodos(mapa, ANCHO, ALTO);
			const ids = mapa.capas.flat().map((n) => n.id);
			expect(Object.keys(pos).sort()).toEqual([...ids].sort());
			for (const { x, y } of Object.values(pos)) {
				expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
				expect(x).toBeGreaterThanOrEqual(24);
				expect(x).toBeLessThanOrEqual(ANCHO - 24);
				expect(y).toBeGreaterThanOrEqual(40);
				expect(y).toBeLessThanOrEqual(ALTO - 24);
			}
		}
	});

	it("las capas avanzan de izquierda a derecha y comparten la x", () => {
		const mapa = generarPiso("s1", 2);
		const pos = posicionesNodos(mapa, ANCHO, ALTO);
		const xs = mapa.capas.map((capa) => {
			const capaX = new Set(capa.map((n) => pos[n.id]?.x));
			expect(capaX.size).toBe(1);
			return [...capaX][0] as number;
		});
		for (let c = 1; c < xs.length; c++) {
			expect(xs[c]).toBeGreaterThan(xs[c - 1] as number);
		}
	});

	it("dos nodos de una misma capa nunca se solapan (≥ 40 px) y siguen el orden del índice", () => {
		for (let i = 0; i < 100; i++) {
			const mapa = generarPiso(`s${i}`, 3);
			const pos = posicionesNodos(mapa, ANCHO, ALTO);
			for (const capa of mapa.capas) {
				for (let k = 1; k < capa.length; k++) {
					const antes = pos[(capa[k - 1] as { id: string }).id]?.y as number;
					const ahora = pos[(capa[k] as { id: string }).id]?.y as number;
					expect(ahora - antes).toBeGreaterThanOrEqual(40);
				}
			}
		}
	});

	it("el jefe, solo en su capa, queda centrado en vertical", () => {
		const pos = posicionesNodos(generarPiso("s1", 1), ANCHO, ALTO);
		const jefe = pos["5-0"] as { x: number; y: number };
		expect(Math.abs(jefe.y - ALTO / 2)).toBeLessThanOrEqual(12);
	});

	it("es función pura: misma entrada, mismo resultado", () => {
		const mapa = generarPiso("s7", 1);
		expect(posicionesNodos(mapa, ANCHO, ALTO)).toEqual(
			posicionesNodos(mapa, ANCHO, ALTO),
		);
	});

	it("rechaza un lienzo demasiado pequeño para los márgenes", () => {
		expect(() => posicionesNodos(generarPiso("s1", 1), 40, 40)).toThrow(
			RangeError,
		);
	});
});
