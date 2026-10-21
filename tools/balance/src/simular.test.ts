import type { Aprendizaje, SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { cargarDatosPack } from "./datos.js";
import { simular } from "./simular.js";

const SEMILLAS = ["b0", "b1", "b2", "b3"];
const datos = cargarDatosPack();

/** Mismos sets, pero cada uno solo sabe Splash (no hace daño). */
const inofensivos = (sets: readonly SetCombate[]): SetCombate[] =>
	sets.map((s) => ({ ...s, movimientos: ["splash"] }));

describe("simular", () => {
	it("la misma lista de semillas da el mismo resultado", async () => {
		const a = await simular(SEMILLAS, datos);
		expect(await simular(SEMILLAS, datos)).toEqual(a);
		expect(a.total).toBe(SEMILLAS.length);
		expect(a.victorias + a.muertesPorPiso.reduce((n, m) => n + m, 0)).toBe(
			a.total,
		);
	});

	it("con un equipo que no hace daño la tasa es 0", async () => {
		const r = await simular(SEMILLAS, {
			...datos,
			sets: inofensivos(datos.sets),
			setsRival: datos.sets,
		});
		expect(r.tasa).toBe(0);
		expect(r.victorias).toBe(0);
	});

	it("con rivales que no hacen daño la tasa es 1", async () => {
		const r = await simular(SEMILLAS, {
			...datos,
			setsRival: inofensivos(datos.sets),
			elites: undefined,
		});
		expect(r.tasa).toBe(1);
	});

	it("sin semillas la tasa es 0 y no hay derrotas", async () => {
		expect(await simular([], datos)).toEqual({
			victorias: 0,
			total: 0,
			tasa: 0,
			muertesPorPiso: [0, 0, 0],
		});
	});
});

describe("simular con progresión", () => {
	const conProgresion = cargarDatosPack({ progresion: true }).progresion;
	if (conProgresion === undefined)
		throw new Error("el pack no cargó la progresión");

	// Todos aprenden un movimiento que hace daño desde el nivel 1: así todos los
	// combates terminan y se llega a los tres jefes con rivales inofensivos. Se
	// usa Fuego (no Normal) para que los rivales Fantasma no sean inmunes.
	const aprendizaje: Aprendizaje = Object.fromEntries(
		[...new Set(datos.sets.map((s) => s.especie))].map((especie) => [
			especie,
			[{ nivel: 1, movimiento: "flamethrower" }],
		]),
	);

	const datosConNiveles = {
		...datos,
		setsRival: inofensivos(datos.sets),
		elites: undefined,
		progresion: { ...conProgresion, aprendizaje },
	};

	it("es determinista y mide el nivel medio al jefe de cada piso", async () => {
		const a = await simular(SEMILLAS, datosConNiveles);
		expect(await simular(SEMILLAS, datosConNiveles)).toEqual(a);
		expect(a.victorias).toBe(SEMILLAS.length);
		expect(a.nivelMedioAlJefe).toHaveLength(3);
		for (const nivel of a.nivelMedioAlJefe ?? []) {
			expect(nivel).toBeGreaterThanOrEqual(8);
		}
	});

	it("sin progresión no añade nivelMedioAlJefe", async () => {
		const r = await simular(["b0"], datos);
		expect(r).not.toHaveProperty("nivelMedioAlJefe");
	});
});
