import { describe, expect, it } from "vitest";
import {
	parsearColeccion,
	renderizarCancion,
	renderizarEfecto,
} from "./index.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

const LEIDO: unknown = JSON.parse(
	readFileSync(new URL("../datos/audio.json", import.meta.url), "utf8"),
);
const COLECCION = parsearColeccion(LEIDO);

// Escalas declaradas en el generador (scripts/generar.ts), como clases de altura.
const ESCALAS: Record<string, Set<number>> = {
	mapa: new Set([9, 11, 0, 2, 4, 5, 7]), // La menor natural
	combate: new Set([4, 6, 7, 9, 11, 0, 2]), // Mi menor natural
	victoria: new Set([0, 2, 4, 5, 7, 9, 11]), // Do mayor
};
const COMPASES: Record<string, number> = { mapa: 16, combate: 16, victoria: 8 };
const BPM: Record<string, number> = { mapa: 100, combate: 150, victoria: 132 };
const CANALES = ["pulso1", "pulso2", "onda", "ruido"];

const cancion = (id: string) => {
	const c = COLECCION.canciones.find((x) => x.id === id);
	if (!c) throw new Error(`falta la canción ${id}`);
	return c;
};

const pista = (id: string, canal: string) => {
	const p = cancion(id).pistas.find((x) => x.canal === canal);
	if (!p) throw new Error(`a ${id} le falta el canal ${canal}`);
	return p;
};

describe("colección de audio", () => {
	it("trae tres temas con sus compases, tempo y canales", () => {
		for (const id of ["mapa", "combate", "victoria"]) {
			const c = cancion(id);
			expect(c.pasos).toBe((COMPASES[id] ?? 0) * 16);
			expect(c.bpm).toBe(BPM[id]);
			expect(c.pasosPorNegra).toBe(4);
			expect(c.pistas.map((p) => p.canal)).toEqual(CANALES);
		}
		expect(cancion("mapa").repetir).toBe(true);
		expect(cancion("combate").repetir).toBe(true);
		expect(cancion("victoria").repetir).toBe(false);
	});

	it("el bajo usa el canal de onda con una tabla de 32 muestras", () => {
		for (const id of ["mapa", "combate", "victoria"]) {
			const onda = pista(id, "onda");
			expect(onda.onda).toHaveLength(32);
			expect(onda.onda?.every((m) => m >= 0 && m <= 15)).toBe(true);
		}
	});

	it("todas las notas con altura caen en la escala del tema", () => {
		for (const id of Object.keys(ESCALAS)) {
			const escala = ESCALAS[id];
			if (!escala) throw new Error(`falta la escala ${id}`);
			for (const canal of ["pulso1", "pulso2", "onda"]) {
				for (const nota of pista(id, canal).notas) {
					expect(escala.has(nota.n % 12)).toBe(true);
				}
			}
		}
	});

	it("la melodía se queda entre MIDI 55 y 88 y el bajo entre 28 y 55", () => {
		for (const id of Object.keys(ESCALAS)) {
			const melodia = pista(id, "pulso1").notas;
			expect(melodia.length).toBeGreaterThan(0);
			for (const nota of melodia) {
				expect(nota.n).toBeGreaterThanOrEqual(55);
				expect(nota.n).toBeLessThanOrEqual(88);
			}
			const bajo = pista(id, "onda").notas;
			expect(bajo.length).toBeGreaterThan(0);
			for (const nota of bajo) {
				expect(nota.n).toBeGreaterThanOrEqual(28);
				expect(nota.n).toBeLessThanOrEqual(55);
			}
		}
	});

	it("no hay más de dos saltos de octava seguidos en la melodía", () => {
		for (const id of Object.keys(ESCALAS)) {
			const notas = pista(id, "pulso1").notas;
			let seguidos = 0;
			for (let i = 1; i < notas.length; i++) {
				const previa = notas[i - 1];
				const actual = notas[i];
				if (!previa || !actual) continue;
				seguidos = Math.abs(actual.n - previa.n) > 12 ? seguidos + 1 : 0;
				expect(seguidos).toBeLessThanOrEqual(2);
			}
		}
	});

	it("cada tema se renderiza sin silencio, en rango y de forma determinista", () => {
		for (const id of Object.keys(ESCALAS)) {
			const c = cancion(id);
			const a = renderizarCancion(c);
			const b = renderizarCancion(c);
			const muestrasPorPaso = (44100 * 60) / (c.bpm * c.pasosPorNegra);
			expect(a.length).toBe(Math.round(c.pasos * muestrasPorPaso));
			expect(Array.from(a)).toEqual(Array.from(b));
			let pico = 0;
			let minimo = 0;
			for (const m of a) {
				pico = Math.max(pico, Math.abs(m));
				minimo = Math.min(minimo, m);
			}
			expect(minimo).toBeGreaterThanOrEqual(-1);
			expect(pico).toBeLessThanOrEqual(1);
			expect(pico).toBeGreaterThan(0.2);
		}
	});
});

describe("efectos", () => {
	it("trae los ocho efectos con el carácter pedido", () => {
		expect(COLECCION.efectos).toHaveLength(8);
		const porId = (id: string) => {
			const e = COLECCION.efectos.find((x) => x.id === id);
			if (!e) throw new Error(`falta el efecto ${id}`);
			return e;
		};
		expect(porId("captura-exito").deslizamiento).toBeGreaterThan(0);
		expect(porId("captura-fallo").deslizamiento).toBeLessThan(0);
		expect(porId("golpe").canal).toBe("ruido");
		expect(porId("golpe-fuerte").canal).toBe("ruido");
		expect(porId("curar").deslizamiento).toBeGreaterThan(0);
		for (const efecto of COLECCION.efectos) {
			expect(efecto.duracionMs).toBeGreaterThanOrEqual(20);
			expect(efecto.duracionMs).toBeLessThanOrEqual(2000);
		}
	});

	it("todos se renderizan con señal y dentro de [-1, 1]", () => {
		for (const efecto of COLECCION.efectos) {
			const muestras = renderizarEfecto(efecto);
			let pico = 0;
			let minimo = 0;
			for (const m of muestras) {
				pico = Math.max(pico, Math.abs(m));
				minimo = Math.min(minimo, m);
			}
			expect(minimo).toBeGreaterThanOrEqual(-1);
			expect(pico).toBeLessThanOrEqual(1);
			expect(pico).toBeGreaterThan(0.05);
		}
	});
});
