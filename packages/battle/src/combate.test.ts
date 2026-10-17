import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SetCombate } from "@santuario/data";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	Combate,
	type Eleccion,
	type MiembroEquipo,
	type Peticion,
} from "./combate.js";

const leer = (ruta: string) =>
	JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));
const SETS: SetCombate[] = leer("../../../packs/kanto/sets.json");

/** Equipo a partir de ids de especie del pack. */
const equipo = (...ids: string[]): MiembroEquipo[] =>
	ids.map((id) => {
		const set = SETS.find((s) => s.especie === id);
		if (!set) throw new Error(`sin set para ${id}`);
		return { especie: id, set };
	});

/** Primera elección legal de una petición: primer movimiento con PP o primer cambio posible. */
function primera(p: Peticion): Eleccion {
	if (p.tipo === "movimiento") {
		const i = p.movimientos.findIndex((m) => !m.deshabilitado);
		if (i >= 0) return { tipo: "movimiento", indice: i };
	}
	const i = p.equipo.findIndex((m) => !m.activo && !m.debilitado);
	return { tipo: "cambio", indice: i };
}

/** Juega hasta el final eligiendo siempre lo primero; devuelve los turnos jugados. */
async function jugar(c: Combate, tope = 100): Promise<number> {
	let n = 0;
	while (c.terminado() === null) {
		if (++n > tope) throw new Error("el combate no termina");
		const pj = c.peticion("jugador");
		const pr = c.peticion("rival");
		await c.resolver(pj && primera(pj), pr && primera(pr));
	}
	return n;
}

const A = () => equipo("pikachu", "machop", "zubat");
const B = () => equipo("geodude", "gastly", "eevee");
const crear = (semilla: string) =>
	Combate.crear({ semilla, jugador: A(), rival: B() });

describe("Combate: determinismo", () => {
	it("misma semilla y elecciones dan el mismo registro; otra semilla, distinto", async () => {
		const [a, b, c] = [await crear("s1"), await crear("s1"), await crear("s2")];
		for (const x of [a, b, c]) await jugar(x);
		expect(a.registro()).toBe(b.registro());
		expect(a.registro()).not.toBe(c.registro());
	});

	it.each(["", "ñandú"])("la semilla %j no lanza", async (semilla) => {
		const c = await crear(semilla);
		expect(c.peticion("jugador")?.tipo).toBe("movimiento");
		await jugar(c);
	});

	it("rechaza especies o movimientos inexistentes y equipos vacíos", async () => {
		const ok = A();
		const mal = [
			{
				especie: "noexiste",
				set: { ...(ok[0] as MiembroEquipo).set, especie: "noexiste" },
			},
		];
		await expect(
			Combate.crear({ semilla: "x", jugador: mal, rival: B() }),
		).rejects.toThrow(/noexiste/);
		const mov = [
			{
				...(ok[0] as MiembroEquipo),
				set: { ...(ok[0] as MiembroEquipo).set, movimientos: ["no-existe"] },
			},
		];
		await expect(
			Combate.crear({ semilla: "x", jugador: mov, rival: B() }),
		).rejects.toThrow(/no-existe/);
		await expect(
			Combate.crear({ semilla: "x", jugador: [], rival: B() }),
		).rejects.toThrow(/equipo/i);
	});
});

describe("Combate: elecciones ilegales", () => {
	it("lanza con mensaje claro y el combate sigue usable", async () => {
		const c = await crear("ilegal");
		const antes = c.registro();
		const mov = (indice: number): Eleccion => ({ tipo: "movimiento", indice });
		await expect(c.elegir("jugador", mov(9))).rejects.toThrow(/movimiento/i);
		await expect(c.elegir("jugador", mov(-1))).rejects.toThrow(/movimiento/i);
		await expect(c.elegir("jugador", mov(0.5))).rejects.toThrow(/movimiento/i);
		await expect(
			c.elegir("jugador", { tipo: "cambio", indice: 0 }),
		).rejects.toThrow(/activo/i);
		await expect(
			c.elegir("jugador", { tipo: "cambio", indice: 7 }),
		).rejects.toThrow(/cambio/i);
		expect(c.registro()).toBe(antes);
		expect(c.peticion("jugador")).not.toBeNull();
		// elegir dos veces en el mismo turno es fuera de turno
		expect(await c.elegir("jugador", mov(0))).toEqual([]);
		expect(c.peticion("jugador")).toBeNull();
		await expect(c.elegir("jugador", mov(0))).rejects.toThrow(/turno/i);
		const eventos = await c.elegir("rival", mov(0));
		expect(eventos.some((e) => e.tipo === "turno")).toBe(true);
		await jugar(c);
	});

	it("rechaza un cambio a un debilitado", async () => {
		const c = await crear("pp");
		let bloqueado = false;
		while (c.terminado() === null) {
			const pj = c.peticion("jugador");
			const pr = c.peticion("rival");
			const caido = pj?.equipo.findIndex((m) => m.debilitado) ?? -1;
			if (pj && caido >= 0) {
				await expect(
					c.elegir("jugador", { tipo: "cambio", indice: caido }),
				).rejects.toThrow(/debilitado/i);
				bloqueado = true;
			}
			await c.resolver(pj && primera(pj), pr && primera(pr));
		}
		expect(bloqueado).toBe(true);
	});

	it("tras el fin cualquier elección lanza", async () => {
		const c = await crear("fin");
		await jugar(c);
		expect(c.peticion("jugador")).toBeNull();
		expect(c.peticion("rival")).toBeNull();
		const antes = c.registro();
		await expect(
			c.elegir("jugador", { tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/termin/i);
		await expect(
			c.elegir("rival", { tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/termin/i);
		expect(c.registro()).toBe(antes);
	});
});

describe("Combate: cambio forzado", () => {
	it("tras debilitarse solo elige el lado caído y el combate continúa", async () => {
		const c = await crear("forzado");
		let visto = false;
		while (c.terminado() === null) {
			const pj = c.peticion("jugador");
			const pr = c.peticion("rival");
			if (pj?.tipo === "cambio-forzado" || pr?.tipo === "cambio-forzado") {
				visto = true;
				const solo =
					pj?.tipo === "cambio-forzado" && pr?.tipo !== "cambio-forzado"
						? "jugador"
						: pr?.tipo === "cambio-forzado" && pj?.tipo !== "cambio-forzado"
							? "rival"
							: null;
				if (solo) {
					const otro = solo === "jugador" ? "rival" : "jugador";
					expect(c.peticion(otro)).toBeNull();
					await expect(
						c.elegir(otro, { tipo: "movimiento", indice: 0 }),
					).rejects.toThrow(/turno/i);
					await expect(
						c.elegir(solo, { tipo: "movimiento", indice: 0 }),
					).rejects.toThrow(/cambio/i);
				}
			}
			await c.resolver(pj && primera(pj), pr && primera(pr));
		}
		expect(visto).toBe(true);
	});
});

describe("Combate: eventos", () => {
	it("emite eventos tipados con slugs y números", async () => {
		const c = await crear("eventos");
		expect(c.inicio[0]).toEqual({
			tipo: "inicio",
			tamanoJugador: 3,
			tamanoRival: 3,
		});
		const todos = [...c.inicio];
		while (c.terminado() === null) {
			const pj = c.peticion("jugador");
			const pr = c.peticion("rival");
			todos.push(...(await c.resolver(pj && primera(pj), pr && primera(pr))));
		}
		const mov = todos.find((e) => e.tipo === "movimiento");
		expect(mov).toMatchObject({
			especie: expect.stringMatching(/^[a-z0-9-]+$/),
			movimiento: expect.stringMatching(/^[a-z0-9-]+$/),
		});
		for (const e of todos)
			if (e.tipo === "dano")
				expect(Number.isInteger(e.hp) && e.hp >= 0 && e.hp <= e.hpMax).toBe(
					true,
				);
		expect(todos.some((e) => e.tipo === "debilitado")).toBe(true);
		expect(todos.at(-1)).toMatchObject({ tipo: "fin" });
	});
});

describe("repeticiones doradas", () => {
	type Dorada = {
		semilla: string;
		equipoJugador: string[];
		equipoRival: string[];
		elecciones: { jugador: Eleccion | null; rival: Eleccion | null }[];
		esperado: { ganador: string; turnos: number; hashRegistro: string };
	};
	it.each([
		["victoria.json", "jugador"],
		["derrota.json", "rival"],
	])("%s se reproduce exactamente", async (archivo, ganador) => {
		const d: Dorada = leer(`../test/repeticiones/${archivo}`);
		const c = await Combate.crear({
			semilla: d.semilla,
			jugador: equipo(...d.equipoJugador),
			rival: equipo(...d.equipoRival),
		});
		for (const e of d.elecciones) await c.resolver(e.jugador, e.rival);
		expect(c.terminado()).toBe(d.esperado.ganador);
		expect(d.esperado.ganador).toBe(ganador);
		const turnos = Number(
			/\|turn\|(\d+)\n(?!.*\|turn\|)/s.exec(c.registro())?.[1],
		);
		expect(turnos).toBe(d.esperado.turnos);
		const hash = createHash("sha256").update(c.registro()).digest("hex");
		expect(hash).toBe(d.esperado.hashRegistro);
	});
});

describe("propiedad", () => {
	it("30 semillas: siempre termina en 100 turnos sin lanzar", async () => {
		await fc.assert(
			fc.asyncProperty(fc.string(), async (semilla) => {
				const c = await crear(semilla);
				await jugar(c);
				expect(c.terminado()).not.toBeNull();
			}),
			{ numRuns: 30 },
		);
	});
});
