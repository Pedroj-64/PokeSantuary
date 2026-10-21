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

describe("Combate: activo", () => {
	it("expone el Pokémon en campo de cada lado y su salud", async () => {
		const c = await crear("act");
		expect(c.activo("jugador")).toMatchObject({ especie: "pikachu" });
		expect(c.activo("rival")).toMatchObject({ especie: "geodude" });
		const antes = c.activo("rival");
		const antesJ = c.activo("jugador");
		await c.resolver(
			primera(c.peticion("jugador") as Peticion),
			primera(c.peticion("rival") as Peticion),
		);
		const ahora = c.activo("rival");
		expect(ahora?.hpMax).toBe(antes?.hpMax);
		// Pikachu no daña a Geodude (inmune), pero Rock Slide sí daña a Pikachu.
		expect(ahora?.hp).toBe(antes?.hp);
		expect(c.activo("jugador")?.hp).toBeLessThan(antesJ?.hp ?? 0);
		// Tras un debilitamiento y el cambio forzado, el activo es el relevo.
		await jugar(c);
		const fin = c.activo("jugador");
		expect(fin?.especie).toBeTruthy();
		expect(c.activo("jugador")?.hp === 0 || c.activo("rival")?.hp === 0).toBe(
			true,
		);
	});
});

describe("Combate: PS iniciales y finales por miembro", () => {
	const conPs = (ps: (number | undefined)[]): MiembroEquipo[] =>
		A().map((m, i) => (ps[i] === undefined ? m : { ...m, psPct: ps[i] }));

	it("un miembro con psPct 40 arranca con el 40 % de sus PS máximos (redondeo hacia arriba)", async () => {
		const c = await Combate.crear({
			semilla: "s1",
			jugador: conPs([40]),
			rival: B(),
		});
		const activo = c.activo("jugador");
		expect(activo?.hp).toBe(Math.ceil((activo?.hpMax ?? 0) * 0.4));
		expect(c.activo("rival")?.hp).toBe(c.activo("rival")?.hpMax);
	});

	it("el miembro herido también llega herido al resto del equipo", async () => {
		const c = await Combate.crear({
			semilla: "s1",
			jugador: conPs([100, 25]),
			rival: B(),
		});
		const equipoInicial = c.equipoJugador();
		expect(equipoInicial.map((m) => m.psPct)).toEqual([100, 25, 100]);
	});

	it.each([0, 101, 50.5, Number.NaN])(
		"rechaza psPct %j con un error claro",
		async (ps) => {
			await expect(
				Combate.crear({ semilla: "s1", jugador: conPs([ps]), rival: B() }),
			).rejects.toThrow(/psPct/);
		},
	);

	it("rechaza psPct en el rival: solo el jugador arrastra PS entre combates", async () => {
		const rival = B().map((m, i) => (i === 0 ? { ...m, psPct: 50 } : m));
		await expect(
			Combate.crear({ semilla: "s1", jugador: A(), rival }),
		).rejects.toThrow(/psPct/);
	});

	it("equipoJugador() devuelve un porcentaje por miembro, en el orden de entrada, con 0 para los debilitados", async () => {
		const c = await crear("s4");
		await jugar(c);
		const final = c.equipoJugador();
		expect(final.map((m) => m.especie)).toEqual(A().map((m) => m.especie));
		for (const m of final) {
			expect(Number.isInteger(m.psPct)).toBe(true);
			expect(m.psPct).toBeGreaterThanOrEqual(0);
			expect(m.psPct).toBeLessThanOrEqual(100);
		}
		// Perder = todo el equipo a 0; ganar = al menos un superviviente con PS.
		const vivos = final.filter((m) => m.psPct > 0).length;
		expect(c.terminado() === "jugador" ? vivos > 0 : vivos === 0).toBe(true);
	});

	it("sin psPct el registro no cambia respecto a un equipo a plena salud", async () => {
		const [a, b] = [
			await Combate.crear({ semilla: "s1", jugador: A(), rival: B() }),
			await Combate.crear({
				semilla: "s1",
				jugador: conPs([100, 100, 100]),
				rival: B(),
			}),
		];
		await jugar(a);
		await jugar(b);
		expect(b.registro()).toBe(a.registro());
	});
});

describe("Combate: terreno de fisura", () => {
	it("el terreno pedido está activo desde el primer turno y dura todo el combate", async () => {
		const c = await Combate.crear({
			semilla: "terreno",
			jugador: equipo("geodude", "squirtle", "bulbasaur"),
			rival: equipo("geodude", "squirtle", "bulbasaur"),
			terreno: "grassyterrain",
		});
		expect(c.registro()).toContain("-fieldstart|move: Grassy Terrain");
		// Pasados más de 5 turnos (la duración normal del terreno) no ha terminado.
		let turnos = 0;
		for (; turnos < 7 && !c.terminado(); turnos++) {
			const p = c.peticion("jugador");
			if (p) await c.elegir("jugador", primera(p));
			const r = c.peticion("rival");
			if (r) await c.elegir("rival", primera(r));
		}
		expect(turnos).toBeGreaterThanOrEqual(6);
		expect(c.registro()).not.toContain("-fieldend|move: Grassy Terrain");
	});

	it("sin terreno no hay ninguno", async () => {
		const c = await Combate.crear({
			semilla: "terreno",
			jugador: equipo("bulbasaur"),
			rival: equipo("charmander"),
		});
		expect(c.registro()).not.toContain("-fieldstart");
	});
});

describe("Combate: individuo propio", () => {
	const conPropio = (extra: Partial<MiembroEquipo>) =>
		Combate.crear({
			semilla: "s1",
			jugador: [{ ...(equipo("pikachu")[0] as MiembroEquipo), ...extra }],
			rival: equipo("geodude"),
		});

	it("usa los movimientos propios en lugar de los del set", async () => {
		const c = await conPropio({ movimientos: ["growl", "tackle"] });
		const p = c.peticion("jugador");
		expect(p?.movimientos.map((m) => m.movimiento)).toEqual([
			"growl",
			"tackle",
		]);
	});

	it("los IV propios cambian los PS máximos", async () => {
		const base = (await conPropio({})).peticion("jugador")?.equipo[0]?.hpMax;
		const sin = (
			await conPropio({ iv: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } })
		).peticion("jugador")?.equipo[0]?.hpMax;
		expect(sin).toBeLessThan(base as number);
	});

	it.each([
		["movimientos vacíos", { movimientos: [] }],
		["movimientos repetidos", { movimientos: ["tackle", "tackle"] }],
		["movimiento inexistente", { movimientos: ["noexiste"] }],
		["naturaleza inexistente", { naturaleza: "Feliz" }],
		[
			"IV fuera de rango",
			{ iv: { hp: 32, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } },
		],
	])("rechaza %s", async (_n, extra) => {
		await expect(conPropio(extra)).rejects.toThrow();
	});
});
