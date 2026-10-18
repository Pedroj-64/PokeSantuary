import { readFileSync } from "node:fs";
import { MessageChannel } from "node:worker_threads";
import type { SetCombate } from "@santuario/data";
import { expose, wrap } from "comlink";
import { describe, expect, it, vi } from "vitest";
import {
	abrirCombate,
	type CombateRemoto,
	type ResultadoTurno,
} from "./cliente.js";
import type { Eleccion, MiembroEquipo, Peticion } from "./combate.js";
import { esEleccionIlegal } from "./errores.js";
import { SesionCombate } from "./sesion.js";

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
const JUGADOR = equipo("squirtle", "pikachu", "machop");
const RIVAL = equipo("charmander", "geodude", "abra");

/** Abre el combate por un `MessageChannel` con la sesión expuesta en el otro extremo. */
async function abrir(semilla: string, jugador = JUGADOR, rival = RIVAL) {
	const { port1, port2 } = new MessageChannel();
	expose(new SesionCombate(), port2 as never);
	const abierto = await abrirCombate(
		{ semilla, jugador, rival },
		{ crearEndpoint: () => port1 as never },
	);
	return { ...abierto, port1, port2 };
}

/** Elección del jugador: primer movimiento usable, o primer cambio válido. */
function elegirPrimero(p: Peticion): Eleccion {
	if (p.tipo === "cambio-forzado") {
		return {
			tipo: "cambio",
			indice: p.equipo.findIndex((m) => !m.activo && !m.debilitado),
		};
	}
	return {
		tipo: "movimiento",
		indice: p.movimientos.findIndex((m) => !m.deshabilitado),
	};
}

/** Juega hasta el final; devuelve los resultados de cada turno. */
async function jugarTodo(
	remoto: CombateRemoto,
	peticion: Peticion | null,
): Promise<ResultadoTurno[]> {
	const out: ResultadoTurno[] = [];
	let p = peticion;
	while (p) {
		const r = await remoto.elegirJugador(elegirPrimero(p));
		out.push(r);
		p = r.peticion;
	}
	return out;
}

/** Guarda anti-cuelgue: rechaza si la promesa no resuelve a tiempo. */
const conLimite = <T>(p: Promise<T>, ms = 5000): Promise<T> =>
	Promise.race([
		p,
		new Promise<T>((_, rej) =>
			setTimeout(() => rej(new Error("tiempo agotado")), ms),
		),
	]);

describe("cliente de combate sobre MessageChannel", () => {
	it("es determinista: misma semilla y elecciones dan el mismo registro; otra semilla, otro", async () => {
		const correr = async (semilla: string) => {
			const a = await abrir(semilla);
			const turnos = await jugarTodo(a.remoto, a.peticion);
			const registro = await a.remoto.registro();
			a.remoto.cerrar();
			return { registro, turnos };
		};
		const x = await correr("ñandú");
		const y = await correr("ñandú");
		const z = await correr("");
		expect(x.registro).toBe(y.registro);
		expect(x.turnos).toEqual(y.turnos);
		expect(z.registro).not.toBe(x.registro);
		expect(x.turnos.at(-1)?.terminado).not.toBeNull();
	});

	it("coincide con la sesión usada directamente, sin transporte", async () => {
		const directa = new SesionCombate();
		const ini = await directa.abrir({
			semilla: "equiv",
			jugador: JUGADOR,
			rival: RIVAL,
		});
		let p = ini.peticion;
		while (p) p = (await directa.elegirJugador(elegirPrimero(p))).peticion;
		const c = await abrir("equiv");
		await jugarTodo(c.remoto, c.peticion);
		expect(await c.remoto.registro()).toBe(directa.registro());
		c.remoto.cerrar();
	});

	it("elección ilegal: error en español y el combate sigue usable", async () => {
		const a = await abrir("ilegal");
		await expect(
			a.remoto.elegirJugador({ tipo: "movimiento", indice: 9 }),
		).rejects.toThrow(/fuera de rango/);
		await expect(
			a.remoto.elegirJugador({ tipo: "cambio", indice: 0 }),
		).rejects.toThrow(/ya está activo/);
		const r = await a.remoto.elegirJugador({ tipo: "movimiento", indice: 0 });
		expect(r.eventos.length).toBeGreaterThan(0);
		a.remoto.cerrar();
	});

	it("ilegal rechaza con name EleccionIlegal; un Worker caído no", async () => {
		const a = await abrir("discrimina");
		const ilegal = await a.remoto
			.elegirJugador({ tipo: "movimiento", indice: 9 })
			.catch((e: unknown) => e);
		expect(esEleccionIlegal(ilegal)).toBe(true);
		expect((ilegal as Error).name).toBe("EleccionIlegal");
		a.remoto.cerrar();
		const caido = await a.remoto
			.elegirJugador({ tipo: "movimiento", indice: 0 })
			.catch((e: unknown) => e);
		expect(caido).toBeInstanceOf(Error);
		expect(esEleccionIlegal(caido)).toBe(false);
		expect(esEleccionIlegal("texto")).toBe(false);
	});

	it("elección con forma inválida se rechaza con mensaje legible", async () => {
		const a = await abrir("forma");
		await expect(
			a.remoto.elegirJugador({ tipo: "x", indice: 0 } as never),
		).rejects.toThrow(/Elección inválida/);
		a.remoto.cerrar();
	});

	it("elección tras el final: rechazada", async () => {
		const a = await abrir("final");
		await jugarTodo(a.remoto, a.peticion);
		await expect(
			a.remoto.elegirJugador({ tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/ya terminó/);
		a.remoto.cerrar();
	});

	it("una sesión sana rechaza un método desconocido e ignora mensajes basura", async () => {
		const a = await abrir("malo");
		const crudo = wrap<Record<string, () => Promise<unknown>>>(
			a.port1 as never,
		);
		await expect(
			conLimite(crudo.noExiste?.() as Promise<unknown>),
		).rejects.toThrow();
		a.port1.postMessage("basura");
		a.port1.postMessage({ id: "1", type: "NOPE" });
		const r = await conLimite(
			a.remoto.elegirJugador({ tipo: "movimiento", indice: 0 }),
		);
		expect(r.eventos.length).toBeGreaterThan(0);
		a.remoto.cerrar();
	});

	it("cambio forzado solo del jugador: devuelve la petición cambio-forzado", async () => {
		let visto = false;
		for (let i = 0; i < 40 && !visto; i++) {
			const a = await abrir(`forzado-j-${i}`);
			for (const r of await jugarTodo(a.remoto, a.peticion)) {
				if (r.peticion?.tipo === "cambio-forzado") {
					expect(r.peticion.lado).toBe("jugador");
					visto = true;
				}
			}
			a.remoto.cerrar();
		}
		expect(visto).toBe(true);
	});

	it("cambio forzado solo de la IA: se resuelve dentro y vuelve una petición normal", async () => {
		let visto = false;
		for (let i = 0; i < 40 && !visto; i++) {
			const a = await abrir(`forzado-r-${i}`);
			for (const r of await jugarTodo(a.remoto, a.peticion)) {
				const cae = r.eventos.findIndex(
					(e) => e.tipo === "debilitado" && e.lado === "rival",
				);
				const cambia = r.eventos.some(
					(e, k) => k > cae && e.tipo === "cambio" && e.lado === "rival",
				);
				if (cae >= 0 && cambia && !r.terminado) {
					expect(r.peticion?.tipo).toBe("movimiento");
					visto = true;
				}
			}
			a.remoto.cerrar();
		}
		expect(visto).toBe(true);
	});

	it("cerrar() libera el puerto", async () => {
		const a = await abrir("cerrar");
		const cerrado = new Promise<void>((res) => a.port2.once("close", res));
		a.remoto.cerrar();
		await conLimite(cerrado);
	});

	it("latencia: mediana de 20 turnos por debajo de 50 ms", async () => {
		const tiempos: number[] = [];
		// Un combate dura pocos turnos: se encadenan combates hasta reunir 20 muestras.
		for (let i = 0; tiempos.length < 20; i++) {
			const a = await abrir(`latencia-${i}`);
			let p = a.peticion;
			while (p && tiempos.length < 20) {
				const t0 = performance.now();
				const r = await a.remoto.elegirJugador(elegirPrimero(p));
				tiempos.push(performance.now() - t0);
				p = r.peticion;
			}
			a.remoto.cerrar();
		}
		tiempos.sort((x, y) => x - y);
		const mediana = tiempos[Math.floor(tiempos.length / 2)] ?? Infinity;
		console.info(
			`mediana de ${tiempos.length} turnos: ${mediana.toFixed(2)} ms`,
		);
		expect(mediana).toBeLessThan(50);
	});
});

describe("cliente: Worker mudo, caído y cerrado", () => {
	const op = { semilla: "x", jugador: JUGADOR, rival: RIVAL };

	it("un extremo que nunca responde rechaza dentro del plazo", async () => {
		const { port1, port2 } = new MessageChannel();
		await expect(
			abrirCombate(op, {
				crearEndpoint: () => port1 as never,
				tiempoAbrirMs: 50,
			}),
		).rejects.toThrow(/dejó de responder/);
		port2.close();
	});

	it("un turno sin respuesta rechaza y la sesión queda muerta", async () => {
		const { port1, port2 } = new MessageChannel();
		const sesion = new SesionCombate();
		expose(sesion, port2 as never);
		const a = await abrirCombate(op, {
			crearEndpoint: () => port1 as never,
			tiempoTurnoMs: 30,
		});
		sesion.elegirJugador = () => new Promise(() => {});
		await expect(
			a.remoto.elegirJugador({ tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/dejó de responder/);
		await expect(a.remoto.registro()).rejects.toThrow(/dejó de responder/);
		a.remoto.cerrar();
	});

	it("un error del Worker rechaza lo pendiente y lo posterior", async () => {
		const { port1, port2 } = new MessageChannel();
		const sesion = new SesionCombate();
		expose(sesion, port2 as never);
		const a = await abrirCombate(op, { crearEndpoint: () => port1 as never });
		sesion.elegirJugador = () => new Promise(() => {});
		const pendiente = a.remoto.elegirJugador({ tipo: "movimiento", indice: 0 });
		const rechazo = expect(pendiente).rejects.toThrow(
			/dejó de responder: se cayó/,
		);
		const ev = new Event("error");
		Object.assign(ev, { message: "se cayó" });
		port1.dispatchEvent(ev);
		await rechazo;
		await expect(a.remoto.registro()).rejects.toThrow(/se cayó/);
		a.remoto.cerrar();
	});

	it("tras cerrar() las llamadas rechazan", async () => {
		const a = await abrir("cerrado");
		a.remoto.cerrar();
		await expect(
			a.remoto.elegirJugador({ tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/cerrado/);
		await expect(a.remoto.registro()).rejects.toThrow(/cerrado/);
	});

	it("dos elecciones simultáneas no se intercalan en el Worker", async () => {
		const { port1, port2 } = new MessageChannel();
		let enCurso = 0;
		let maximo = 0;
		const resultado = { eventos: [], peticion: null, terminado: null };
		expose(
			{
				abrir: async () => resultado,
				// La primera tarda más que la segunda: sin cola se solaparían.
				elegirJugador: async (e: Eleccion) => {
					enCurso++;
					maximo = Math.max(maximo, enCurso);
					await new Promise((r) => setTimeout(r, e.indice === 0 ? 30 : 1));
					enCurso--;
					return resultado;
				},
			},
			port2 as never,
		);
		const a = await abrirCombate(op, { crearEndpoint: () => port1 as never });
		await Promise.all([
			a.remoto.elegirJugador({ tipo: "movimiento", indice: 0 }),
			a.remoto.elegirJugador({ tipo: "movimiento", indice: 1 }),
		]);
		expect(maximo).toBe(1);
		a.remoto.cerrar();
	});

	it("tras morir o cerrar no quedan temporizadores armados", async () => {
		for (const como of ["error", "cerrar"] as const) {
			const { port1, port2 } = new MessageChannel();
			const sesion = new SesionCombate();
			expose(sesion, port2 as never);
			const a = await abrirCombate(op, { crearEndpoint: () => port1 as never });
			sesion.elegirJugador = () => new Promise(() => {});
			vi.useFakeTimers();
			try {
				const p = a.remoto.elegirJugador({ tipo: "movimiento", indice: 0 });
				const r = expect(p).rejects.toThrow();
				await vi.advanceTimersByTimeAsync(0);
				expect(vi.getTimerCount()).toBe(1);
				if (como === "error") port1.dispatchEvent(new Event("error"));
				else a.remoto.cerrar();
				await r;
				expect(vi.getTimerCount()).toBe(0);
			} finally {
				vi.useRealTimers();
			}
			a.remoto.cerrar();
		}
	});
});

describe("SesionCombate: tope de cambios de la IA", () => {
	it("falla con un error claro si la IA nunca termina de cambiar", async () => {
		const forzada: Peticion = {
			lado: "rival",
			tipo: "cambio-forzado",
			movimientos: [],
			equipo: [
				{ especie: "a", hp: 0, hpMax: 10, activo: true, debilitado: true },
				{ especie: "b", hp: 10, hpMax: 10, activo: false, debilitado: false },
			],
		};
		let escrituras = 0;
		const falso = {
			resolver: async () => {
				escrituras++;
				return [];
			},
			get escrituras() {
				return escrituras;
			},
			terminado: () => null,
			activo: () => null,
			peticion: (l: string) => (l === "rival" ? forzada : null),
		};
		const s = new SesionCombate();
		Object.assign(s, { combate: falso });
		await expect(
			s.elegirJugador({ tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/cambio forzado/);
		// El combate ya avanzó: la sesión queda inutilizable, con un error claro.
		await expect(
			s.elegirJugador({ tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/inconsistente/);
	});
});

describe("SesionCombate: errores del simulador a mitad de turno", () => {
	type Flujo = { write(texto: string): Promise<void> };
	const flujoDe = (s: SesionCombate): Flujo =>
		(s as unknown as { combate: { flujo: Flujo } }).combate.flujo;

	it("queda inconsistente si el simulador falla en la segunda escritura del turno", async () => {
		const s = new SesionCombate();
		await s.abrir({ semilla: "s1", jugador: JUGADOR, rival: RIVAL });
		const flujo = flujoDe(s);
		const real = flujo.write.bind(flujo);
		let n = 0;
		flujo.write = async (texto) => {
			if (++n === 2) throw new Error("simulador caído");
			return real(texto);
		};
		await expect(
			s.elegirJugador({ tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/caído/);
		// La primera escritura ya se aplicó: no se puede seguir como si nada.
		await expect(
			s.elegirJugador({ tipo: "movimiento", indice: 0 }),
		).rejects.toThrow(/inconsistente/);
	});

	it("una elección ilegal no consume aleatoriedad de la IA", async () => {
		const jugar = async (conIlegal: boolean) => {
			const s = new SesionCombate();
			await s.abrir({ semilla: "s4", jugador: JUGADOR, rival: RIVAL });
			if (conIlegal) {
				await expect(
					s.elegirJugador({ tipo: "movimiento", indice: 99 }),
				).rejects.toSatisfy(esEleccionIlegal);
			}
			await s.elegirJugador({ tipo: "movimiento", indice: 0 });
			return s.registro();
		};
		expect(await jugar(true)).toBe(await jugar(false));
	});
});

describe("SesionCombate: equipo final", () => {
	it("entrega el equipo final del jugador solo cuando el combate termina", async () => {
		const s = new SesionCombate();
		let r = await s.abrir({ semilla: "s4", jugador: JUGADOR, rival: RIVAL });
		expect(r.equipoFinal).toBeUndefined();
		for (let i = 0; r.terminado === null && i < 100; i++) {
			const p = r.peticion as Peticion;
			const eleccion: Eleccion =
				p.tipo === "movimiento"
					? {
							tipo: "movimiento",
							indice: p.movimientos.findIndex((m) => !m.deshabilitado),
						}
					: {
							tipo: "cambio",
							indice: p.equipo.findIndex((m) => !m.activo && !m.debilitado),
						};
			r = await s.elegirJugador(eleccion);
			if (r.terminado === null) expect(r.equipoFinal).toBeUndefined();
		}
		expect(r.terminado).not.toBeNull();
		expect(r.equipoFinal?.map((m) => m.especie)).toEqual(
			JUGADOR.map((m) => m.especie),
		);
	});
});

describe("módulo del cliente", () => {
	it("no importa ni reexporta en tiempo de ejecución el simulador, Combate ni la IA", () => {
		const src = readFileSync(new URL("./cliente.ts", import.meta.url), "utf8");
		const reales = [
			...src.matchAll(
				/^(?:import|export)\s+(?!type\b)(?:[^;]*?from\s+)?["\x27]([^"\x27]+)["\x27]/gms,
			),
		].map((m) => m[1]);
		expect(reales).toEqual(["comlink"]);
		expect(src).not.toMatch(/\bimport\s*\(/);
	});
});
