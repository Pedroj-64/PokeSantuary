import type { Aprendizaje, SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { barrer, type ConfiguracionBarrido } from "./barrido.js";
import { cargarDatosPack } from "./datos.js";

const SEMILLAS = ["b0", "b1"];

const inofensivos = (sets: readonly SetCombate[]): SetCombate[] =>
	sets.map((s) => ({ ...s, movimientos: ["splash"] }));

const datos = cargarDatosPack({ progresion: true, politica: true });
if (datos.progresion === undefined || datos.politica === undefined)
	throw new Error("el pack no cargó progresión y política");

const aprendizaje: Aprendizaje = Object.fromEntries(
	[...new Set(datos.sets.map((s) => s.especie))].map((especie) => [
		especie,
		[{ nivel: 1, movimiento: "flamethrower" }],
	]),
);

const datosBase = {
	...datos,
	setsRival: inofensivos(datos.sets),
	elites: undefined,
	progresion: { ...datos.progresion, aprendizaje },
};

const CONFIGS: readonly ConfiguracionBarrido[] = [
	{ nombre: "G0", nivelGimnasio: 0, llamas: 1, tamanoEquipo: 3 },
	{ nombre: "G2", nivelGimnasio: 2, llamas: 2, tamanoEquipo: 4 },
];

describe("barrer", () => {
	it("devuelve una fila por configuración y es determinista", async () => {
		const a = await barrer(SEMILLAS, datosBase, CONFIGS);
		expect(a).toHaveLength(CONFIGS.length);
		expect(a.map((fila) => fila.nombre)).toEqual(["G0", "G2"]);
		expect(a.map((fila) => fila.total)).toEqual([
			SEMILLAS.length,
			SEMILLAS.length,
		]);
		for (const fila of a) {
			expect(fila.nivelMedioAlJefe).toBeDefined();
		}
		expect(await barrer(SEMILLAS, datosBase, CONFIGS)).toEqual(a);
	});
});
