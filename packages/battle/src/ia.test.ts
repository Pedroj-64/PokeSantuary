import { readFileSync } from "node:fs";
import { crearRng } from "@santuario/core";
import type { SetCombate } from "@santuario/data";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Combate, type MiembroEquipo, type Peticion } from "./combate.js";
import { crearEstimador, type Estimador, elegirIA } from "./ia.js";

const SETS: SetCombate[] = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/sets.json", import.meta.url),
		"utf8",
	),
);
const equipo = (...ids: string[]): MiembroEquipo[] =>
	ids.map((id) => {
		const set = SETS.find((s) => s.especie === id);
		if (!set) throw new Error(`sin set para ${id}`);
		return { especie: id, set };
	});

const opcion = (movimiento: string, pp = 10, deshabilitado = false) => ({
	movimiento,
	pp,
	ppMax: 10,
	deshabilitado,
});
const miembro = (especie: string, activo = false, debilitado = false) => ({
	especie,
	hp: debilitado ? 0 : 100,
	hpMax: 100,
	activo,
	debilitado,
});
const peticion = (
	movimientos: string[],
	extra: Partial<Peticion> = {},
): Peticion => ({
	lado: "rival",
	tipo: "movimiento",
	movimientos: movimientos.map((m) => opcion(m)),
	equipo: [miembro("pikachu", true)],
	...extra,
});

/** Estimador a mano: potencia por movimiento, todo lo demás neutro. */
const falso = (potencias: Record<string, number>): Estimador => ({
	movimientos: () => Object.keys(potencias),
	datos: (_e, m) => ({
		potencia: potencias[m] ?? 0,
		precision: 100,
		efectividad: 1,
		stab: false,
	}),
	amenaza: () => 1,
});

describe("elegirIA: movimientos", () => {
	it("elige el de mayor daño esperado con datos reales (agua contra roca/tierra)", async () => {
		const c = await Combate.crear({
			semilla: "ia",
			jugador: equipo("geodude", "gastly", "eevee"),
			rival: equipo("squirtle", "pikachu", "zubat"),
		});
		const est = crearEstimador(
			c,
			"rival",
			equipo("squirtle", "pikachu", "zubat"),
		);
		const p = c.peticion("rival") as Peticion;
		const e = elegirIA(p, est, crearRng("x"));
		expect(p.movimientos[(e as { indice: number }).indice]?.movimiento).toBe(
			"surf",
		);
	});

	it("nunca elige un movimiento deshabilitado o sin PP", () => {
		const p = peticion(["a", "b", "c"]);
		p.movimientos[0] = opcion("a", 0, true);
		p.movimientos[1] = opcion("b", 0, true);
		for (let i = 0; i < 20; i++)
			expect(
				elegirIA(p, falso({ a: 999, b: 999, c: 1 }), crearRng(`s${i}`)),
			).toEqual({ tipo: "movimiento", indice: 2 });
	});

	it("no elige un movimiento con 0 PP aunque no esté marcado como deshabilitado", () => {
		const p = peticion(["a", "b"]);
		p.movimientos[0] = opcion("a", 0, false);
		expect(elegirIA(p, falso({ a: 999, b: 1 }), crearRng("z"))).toEqual({
			tipo: "movimiento",
			indice: 1,
		});
	});

	it("sin movimientos utilizables lanza error en vez de cambiar", () => {
		const p = peticion(["a"], {
			equipo: [miembro("pikachu", true), miembro("gastly")],
		});
		p.movimientos[0] = opcion("a", 0, true);
		expect(() => elegirIA(p, falso({ a: 1 }), crearRng("z"))).toThrow(
			/ningún movimiento utilizable/,
		);
	});

	it("prefiere daño a estado, y estado solo si no hay otra cosa", () => {
		const est = falso({ polvo: 0, golpe: 5 });
		expect(elegirIA(peticion(["polvo", "golpe"]), est, crearRng("a"))).toEqual({
			tipo: "movimiento",
			indice: 1,
		});
		const p = peticion(["polvo", "golpe"]);
		p.movimientos[1] = opcion("golpe", 0, true);
		expect(elegirIA(p, est, crearRng("a"))).toEqual({
			tipo: "movimiento",
			indice: 0,
		});
	});

	it("con empate decide el rng: misma semilla, misma elección; varias semillas, ambas", () => {
		const p = peticion(["a", "b"]);
		const est = falso({ a: 50, b: 50 });
		const vistos = new Set<number>();
		for (let i = 0; i < 40; i++) {
			const e1 = elegirIA(p, est, crearRng(`t${i}`));
			expect(elegirIA(p, est, crearRng(`t${i}`))).toEqual(e1);
			vistos.add(e1.indice);
		}
		expect(vistos).toEqual(new Set([0, 1]));
	});
});

describe("elegirIA: cambio forzado", () => {
	const forzado = (...equipoPet: ReturnType<typeof miembro>[]): Peticion => ({
		lado: "rival",
		tipo: "cambio-forzado",
		movimientos: [],
		equipo: equipoPet,
	});

	async function estimador() {
		const eq = equipo("geodude", "gastly", "pikachu");
		const c = await Combate.crear({
			semilla: "cf",
			jugador: equipo("squirtle", "zubat", "eevee"),
			rival: eq,
		});
		return crearEstimador(c, "rival", eq);
	}

	it("elige al vivo con mejor ventaja contra el activo rival", async () => {
		const p = forzado(
			miembro("geodude", true, true),
			miembro("gastly"),
			miembro("pikachu"),
		);
		expect(elegirIA(p, await estimador(), crearRng("a"))).toEqual({
			tipo: "cambio",
			indice: 2,
		});
	});

	it("nunca elige al debilitado ni al activo", async () => {
		const p = forzado(
			miembro("geodude", true, true),
			miembro("gastly"),
			miembro("pikachu", false, true),
		);
		expect(elegirIA(p, await estimador(), crearRng("a"))).toEqual({
			tipo: "cambio",
			indice: 1,
		});
	});

	it("falla con claridad si no hay a quién cambiar", async () => {
		const p = forzado(miembro("geodude", true, true));
		expect(() => elegirIA(p, falso({}), crearRng("a"))).toThrow(
			/elección legal/,
		);
	});
});

describe("IA contra IA", () => {
	it("termina en menos de 60 turnos sin lanzar, con cambios forzados incluidos", async () => {
		const ids = SETS.map((s) => s.especie);
		const tres = (n: number, desfase: number) => {
			const r = crearRng(`eq-${n}-${desfase}`);
			const pool = [...ids];
			return equipo(
				...[0, 1, 2].map(
					() => pool.splice(r.entero(0, pool.length - 1), 1)[0] as string,
				),
			);
		};
		let forzados = 0;
		await fc.assert(
			fc.asyncProperty(fc.integer({ min: 0, max: 1e6 }), async (n) => {
				const a = tres(n, 1);
				const b = tres(n, 2);
				const c = await Combate.crear({
					semilla: `ia-${n}`,
					jugador: a,
					rival: b,
				});
				const rng = crearRng(`ia-${n}`);
				let turnos = 0;
				while (c.terminado() === null) {
					expect(++turnos).toBeLessThan(60);
					const pj = c.peticion("jugador");
					const pr = c.peticion("rival");
					if (pj?.tipo === "cambio-forzado") forzados++;
					if (pr?.tipo === "cambio-forzado") forzados++;
					await c.resolver(
						pj && elegirIA(pj, crearEstimador(c, "jugador", a), rng),
						pr && elegirIA(pr, crearEstimador(c, "rival", b), rng),
					);
				}
				expect(c.terminado()).not.toBeNull();
			}),
			{ numRuns: 50 },
		);
		expect(forzados).toBeGreaterThan(0);
	});
});
