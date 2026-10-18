import { describe, expect, it } from "vitest";
import {
	parsearColeccion,
	renderizarCancion,
	TASA_POR_DEFECTO,
} from "./index.js";
import type { Cancion, Pista } from "./modelo.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

const LEIDO: unknown = JSON.parse(
	readFileSync(new URL("../datos/audio.json", import.meta.url), "utf8"),
);
const COLECCION = parsearColeccion(LEIDO);

interface Ficha {
	/** Clases de altura de la escala declarada en la cabecera del .mml. */
	escala: ReadonlySet<number>;
	bpm: number;
	compases: number;
	/** Paso al que vuelve el bucle, o `undefined` si la pieza no repite. */
	bucle: number | undefined;
}

/** Las cuatro piezas del lote 1. */
const FICHAS: Record<string, Ficha> = {
	"combate-salvaje": {
		// Mi dórico: E F# G A B C# D.
		escala: new Set([4, 6, 7, 9, 11, 1, 2]),
		bpm: 160,
		compases: 32,
		bucle: 32,
	},
	"combate-entrenador": {
		// La menor natural.
		escala: new Set([9, 11, 0, 2, 4, 5, 7]),
		bpm: 148,
		compases: 32,
		bucle: 32,
	},
	"victoria-salvaje": {
		// Do mayor.
		escala: new Set([0, 2, 4, 5, 7, 9, 11]),
		bpm: 140,
		compases: 8,
		bucle: undefined,
	},
	"victoria-entrenador": {
		// Sol mayor.
		escala: new Set([7, 9, 11, 0, 2, 4, 6]),
		bpm: 132,
		compases: 12,
		bucle: undefined,
	},
};

const IDS = Object.keys(FICHAS);

const cancion = (id: string): Cancion => {
	const c = COLECCION.canciones.find((x) => x.id === id);
	if (!c) throw new Error(`falta la canción ${id}`);
	return c;
};

const pista = (id: string, canal: string): Pista => {
	const p = cancion(id).pistas.find((x) => x.canal === canal);
	if (!p) throw new Error(`a ${id} le falta el canal ${canal}`);
	return p;
};

const altura = (notas: Pista["notas"]): number[] => notas.map((n) => n.n);

/** Intervalos entre notas consecutivas de la melodía. */
const intervalos = (notas: number[]): number[] =>
	notas.slice(1).map((n, i) => n - (notas[i] ?? n));

/** Ventanas de 8 intervalos consecutivos, como clave comparable. */
const ventanas = (notas: number[]): string[] => {
	const iv = intervalos(notas);
	const salida: string[] = [];
	for (let i = 0; i + 8 <= iv.length; i++) {
		salida.push(iv.slice(i, i + 8).join(","));
	}
	return salida;
};

describe("piezas del lote 1", () => {
	it("trae las cuatro piezas con su nombre i18n y sus canales", () => {
		for (const id of IDS) {
			const c = cancion(id);
			expect(c.nombre).toBe(`audio.${id}.nombre`);
			expect(c.pasosPorNegra).toBe(4);
			expect(c.pistas.map((p) => p.canal)).toEqual([
				"pulso1",
				"pulso2",
				"onda",
				"ruido",
			]);
		}
	});

	it("declara el tempo y la longitud en compases de la ficha", () => {
		for (const id of IDS) {
			const ficha = FICHAS[id];
			if (!ficha) throw new Error(`falta la ficha ${id}`);
			const c = cancion(id);
			expect(c.bpm).toBe(ficha.bpm);
			expect(c.pasos).toBe(ficha.compases * 16);
			expect(c.pasos % 16).toBe(0);
		}
	});

	it("el bucle empieza al inicio del tema A y la introducción queda fuera", () => {
		for (const id of IDS) {
			const ficha = FICHAS[id];
			if (!ficha) throw new Error(`falta la ficha ${id}`);
			const c = cancion(id);
			const bucle = ficha.bucle;
			if (bucle === undefined) {
				expect(c.bucle).toBeUndefined();
				expect(c.repetir).toBe(false);
				continue;
			}
			expect(c.repetir).toBe(true);
			expect(c.bucle?.desde).toBe(bucle);
			// La introducción son dos compases con notas propias y no se vuelve
			// a tocar: el primer compás del bucle no repite sus intervalos.
			const intro = pista(id, "pulso1").notas.filter((n) => n.t < 32);
			expect(intro.length).toBeGreaterThan(8);
			const primerCompasDelBucle = pista(id, "pulso1").notas.filter(
				(n) => n.t >= bucle && n.t < bucle + 16,
			);
			expect(intervalos(altura(primerCompasDelBucle))).not.toEqual(
				intervalos(altura(intro.filter((n) => n.t < 16))),
			);
		}
	});

	it("melodía y bajo se quedan en la escala declarada, con pocos cromatismos", () => {
		for (const id of IDS) {
			const ficha = FICHAS[id];
			if (!ficha) throw new Error(`falta la ficha ${id}`);
			let total = 0;
			let fuera = 0;
			for (const canal of ["pulso1", "onda"]) {
				for (const nota of pista(id, canal).notas) {
					total++;
					if (!ficha.escala.has(nota.n % 12)) fuera++;
				}
			}
			expect(total).toBeGreaterThan(0);
			// Como mucho un 8 % de notas de paso cromáticas.
			expect(fuera / total).toBeLessThanOrEqual(0.08);
		}
	});

	it("respeta los rangos de melodía (55..88) y bajo (28..55)", () => {
		for (const id of IDS) {
			for (const nota of pista(id, "pulso1").notas) {
				expect(nota.n).toBeGreaterThanOrEqual(55);
				expect(nota.n).toBeLessThanOrEqual(88);
			}
			for (const nota of pista(id, "onda").notas) {
				expect(nota.n).toBeGreaterThanOrEqual(28);
				expect(nota.n).toBeLessThanOrEqual(55);
			}
		}
	});

	it("ninguna pista se queda sin notas", () => {
		for (const id of IDS) {
			for (const canal of ["pulso1", "pulso2", "onda", "ruido"]) {
				expect(pista(id, canal).notas.length).toBeGreaterThan(0);
			}
		}
	});

	it("la mezcla no recorta y mantiene un RMS de pieza", () => {
		for (const id of IDS) {
			const c = cancion(id);
			const muestras = renderizarCancion(c, TASA_POR_DEFECTO);
			const muestrasPorPaso = (TASA_POR_DEFECTO * 60) / (c.bpm * 4);
			expect(muestras.length).toBe(Math.round(c.pasos * muestrasPorPaso));
			let pico = 0;
			let suma = 0;
			for (const m of muestras) {
				pico = Math.max(pico, Math.abs(m));
				suma += m * m;
			}
			expect(pico).toBeLessThanOrEqual(0.95);
			const rms = Math.sqrt(suma / muestras.length);
			expect(rms).toBeGreaterThanOrEqual(0.15);
			expect(rms).toBeLessThanOrEqual(0.35);
		}
	});

	it("las melodías no comparten secuencias de 8 intervalos entre piezas", () => {
		const porPieza = new Map<string, string[]>();
		for (const id of IDS) {
			porPieza.set(id, ventanas(altura(pista(id, "pulso1").notas)));
			expect(porPieza.get(id)?.length).toBeGreaterThan(0);
		}
		for (let i = 0; i < IDS.length; i++) {
			for (let j = i + 1; j < IDS.length; j++) {
				const a = new Set(porPieza.get(IDS[i] ?? "") ?? []);
				const b = porPieza.get(IDS[j] ?? "") ?? [];
				const comunes = b.filter((k) => a.has(k));
				expect(comunes, `${IDS[i]} y ${IDS[j]}`).toEqual([]);
			}
		}
	});

	it("ningún motivo de 8 intervalos se repite más de 4 veces en una pieza", () => {
		for (const id of IDS) {
			const cuenta = new Map<string, number>();
			for (const k of ventanas(altura(pista(id, "pulso1").notas))) {
				cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
			}
			for (const [k, veces] of cuenta) {
				expect(veces, `${id}: ${k}`).toBeLessThanOrEqual(4);
			}
		}
	});
});
