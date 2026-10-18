import type { SetCombate } from "@santuario/data";
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
