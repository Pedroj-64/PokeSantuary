import { expedicionInicial, prepararCombate } from "@santuario/battle";
import type { Aprendizaje, SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { cargarDatosPack } from "./datos.js";
import { equipoConNiveles } from "./niveles.js";
import { simular, simularExpedicion } from "./simular.js";

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

describe("simular con política inteligente", () => {
	const conPolitica = cargarDatosPack({ politica: true }).politica;
	if (conPolitica === undefined)
		throw new Error("el pack no cargó la política");

	const datosConPolitica = { ...datos, politica: conPolitica };

	it("con rivales inofensivos la tasa es 1", async () => {
		const r = await simular(SEMILLAS, {
			...datosConPolitica,
			setsRival: inofensivos(datos.sets),
			elites: undefined,
		});
		expect(r.tasa).toBe(1);
	});

	it("con un equipo inofensivo la tasa sigue siendo 0", async () => {
		const r = await simular(SEMILLAS, {
			...datosConPolitica,
			sets: inofensivos(datos.sets),
			setsRival: datos.sets,
		});
		expect(r.tasa).toBe(0);
		expect(r.victorias).toBe(0);
	});

	it("usa la política: si el primer movimiento es de estado, elige el que hace daño", async () => {
		const sets = datos.sets.map((s) => ({
			...s,
			movimientos: ["growl", "flamethrower"],
		}));
		// Rivales que solo usan Placaje: con la política vieja el jugador pierde
		// turnos usando Gruñido; con la inteligente ataca desde el primero.
		const setsRival = datos.sets.map((s) => ({
			...s,
			movimientos: ["tackle"],
		}));
		const r = await simular(SEMILLAS, {
			...datosConPolitica,
			sets,
			setsRival,
			elites: undefined,
		});
		expect(r.tasa).toBe(1);
	});

	it("con progresión y política olvida el movimiento de menor potencia", async () => {
		const conProgresion = cargarDatosPack({ progresion: true }).progresion;
		if (conProgresion === undefined)
			throw new Error("el pack no cargó la progresión");

		const movimientosBase = [
			{ nivel: 1, movimiento: "flamethrower" },
			{ nivel: 1, movimiento: "growl" },
			{ nivel: 1, movimiento: "scratch" },
			{ nivel: 1, movimiento: "ember" },
			{ nivel: 9, movimiento: "water-gun" },
		];
		const aprendizaje: Aprendizaje = Object.fromEntries(
			[...new Set(datos.sets.map((s) => s.especie))].map((especie) => [
				especie,
				movimientosBase,
			]),
		);
		const resultado = await simularExpedicion("b0", {
			...datosConPolitica,
			setsRival: inofensivos(datos.sets),
			elites: undefined,
			progresion: { ...conProgresion, aprendizaje },
		});
		const miembro = resultado.estado.equipo.find((m) =>
			m.movimientos?.includes("water-gun"),
		);
		expect(miembro).toBeDefined();
		expect(miembro?.movimientos).toContain("flamethrower");
		expect(miembro?.movimientos).not.toContain("growl");
	});

	it("es determinista con progresión", async () => {
		const conProgresion = cargarDatosPack({ progresion: true }).progresion;
		if (conProgresion === undefined)
			throw new Error("el pack no cargó la progresión");

		const aprendizaje: Aprendizaje = Object.fromEntries(
			[...new Set(datos.sets.map((s) => s.especie))].map((especie) => [
				especie,
				[{ nivel: 1, movimiento: "flamethrower" }],
			]),
		);

		const datosCompletos = {
			...datosConPolitica,
			setsRival: inofensivos(datos.sets),
			elites: undefined,
			progresion: { ...conProgresion, aprendizaje },
		};
		const a = await simular(SEMILLAS, datosCompletos);
		expect(await simular(SEMILLAS, datosCompletos)).toEqual(a);
		expect(a.victorias).toBe(SEMILLAS.length);
		expect(a.nivelMedioAlJefe).toHaveLength(3);
	});
});

describe("simular con tabla de niveles, llamas y tamaño de equipo", () => {
	const conProgresion = cargarDatosPack({ progresion: true }).progresion;
	if (conProgresion === undefined)
		throw new Error("el pack no cargó la progresión");

	it("con tablaNiveles los rivales del piso 1 están entre 8 y 11", () => {
		const e = equipoConNiveles(
			expedicionInicial("b0", datos.sets, datos.balance),
			conProgresion,
		);
		const nodo = e.mapa.capas
			.flat()
			.find((n) => n.tipo === "salvaje" || n.tipo === "entrenador");
		if (nodo === undefined)
			throw new Error("el mapa no tiene combate corriente");
		const prep = prepararCombate(e, nodo.id, datos.sets, {
			setsRival: datos.sets,
			tamanos: datos.balance.tamanoRival,
			niveles: datos.balance.nivelRival,
			tablaNiveles: conProgresion.niveles.nivel,
		});
		expect(prep.rival.length).toBeGreaterThan(0);
		for (const miembro of prep.rival) {
			expect(miembro.nivel).toBeGreaterThanOrEqual(8);
			expect(miembro.nivel).toBeLessThanOrEqual(11);
		}
	});

	it("con llamas 0 una derrota termina como siempre", async () => {
		const r = await simularExpedicion("b0", {
			...datos,
			sets: inofensivos(datos.sets),
			setsRival: datos.sets,
			elites: undefined,
			llamas: 0,
		});
		expect(r.estado.estado).toBe("derrota");
		expect(r.estado.llamas).toBe(0);
		expect(r.estado.fallidos).toEqual([]);
	});

	it("con llamas una derrota sigue en curso, gasta una llama y luego termina", async () => {
		const r = await simularExpedicion("b0", {
			...datos,
			sets: inofensivos(datos.sets),
			setsRival: datos.sets,
			elites: undefined,
			llamas: 1,
			tamanoEquipo: 6,
		});
		expect(r.estado.estado).toBe("derrota");
		expect(r.estado.llamas).toBe(0);
		expect(r.estado.fallidos).toHaveLength(1);
	});

	it("tamanoEquipo forma equipos distintos y deterministas", async () => {
		const datosConSeis = { ...datos, tamanoEquipo: 6 };
		const a = await simularExpedicion("b0", datosConSeis);
		expect(await simularExpedicion("b0", datosConSeis)).toEqual(a);
		expect(a.estado.equipo).toHaveLength(6);
		expect(new Set(a.estado.equipo.map((m) => m.especie)).size).toBe(6);
	});

	it("tamanoEquipo fuera de 1..6 lanza RangeError", async () => {
		for (const tamanoEquipo of [0, 7, 1.5]) {
			await expect(
				simularExpedicion("b0", { ...datos, tamanoEquipo }),
			).rejects.toThrow(RangeError);
		}
	});

	it("llamas inválidas lanzan RangeError", async () => {
		for (const llamas of [-1, 1.5]) {
			await expect(
				simularExpedicion("b0", { ...datos, llamas }),
			).rejects.toThrow(RangeError);
		}
	});
});
