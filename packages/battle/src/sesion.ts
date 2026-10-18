import { crearRng, type Rng } from "@santuario/core";
import type { TerrenoFisura } from "./combate.js";
import {
	Combate,
	type Eleccion,
	type MiembroEquipo,
	type Peticion,
} from "./combate.js";
import { eleccionIlegal } from "./errores.js";
import { crearEstimador, elegirIA } from "./ia.js";
import type { EventoCombate, Lado } from "./protocolo.js";

/** Tope de cambios forzados consecutivos de la IA en una misma elección. */
const MAX_CAMBIOS_IA = 8;

/** Parámetros para abrir un combate. */
export interface OpcionesCombate {
	semilla: string;
	jugador: MiembroEquipo[];
	rival: MiembroEquipo[];
	/** Terreno permanente del combate (condición de fisura); sin él, campo normal. */
	terreno?: TerrenoFisura;
}

/** Lo que recibe la interfaz tras abrir el combate o tras cada elección del jugador. */
export interface ResultadoTurno {
	eventos: EventoCombate[];
	/** Lo que debe elegir el jugador ahora; null si el combate terminó. */
	peticion: Peticion | null;
	terminado: Lado | "empate" | null;
	/** PS finales del equipo del jugador, en el orden de entrada; solo cuando el combate terminó. */
	equipoFinal?: { especie: string; psPct: number }[];
}

/**
 * Orquesta un `Combate` y la IA rival. Es lo que el Worker expone por Comlink,
 * pero no depende de ningún Worker, así que se prueba en proceso.
 *
 * Todo el combate, IA incluida, es función pura de (semilla, equipos,
 * elecciones del jugador): el simulador usa la semilla y la IA saca su `Rng`
 * de `semilla + ":ia"`. Una elección rechazada no consume aleatoriedad de la IA.
 */
export class SesionCombate {
	private combate: Combate | null = null;
	private rng: Rng = crearRng("");
	private semillaIA = "";
	private inconsistente = false;
	private rival: MiembroEquipo[] = [];

	/** Crea el combate. @throws Error si los equipos son inválidos. */
	async abrir(op: OpcionesCombate): Promise<ResultadoTurno> {
		this.combate = await Combate.crear(op);
		this.semillaIA = `${op.semilla}:ia`;
		this.rng = crearRng(this.semillaIA);
		this.rival = op.rival;
		return this.resultado(this.combate.inicio);
	}

	/**
	 * Aplica la elección del jugador junto con la del rival y, si solo la IA
	 * debe cambiar de Pokémon tras debilitarse, resuelve ese cambio también:
	 * el jugador nunca elige por la IA.
	 * @throws Error si la elección es inválida o ilegal, o el combate terminó.
	 */
	async elegirJugador(e: Eleccion): Promise<ResultadoTurno> {
		const c = this.combate;
		if (!c) throw new Error("No hay un combate abierto");
		if (
			!e ||
			(e.tipo !== "movimiento" && e.tipo !== "cambio") ||
			!Number.isInteger(e.indice)
		) {
			throw eleccionIlegal(`Elección inválida: ${JSON.stringify(e)}`);
		}
		if (this.inconsistente) {
			throw new Error(
				"Sesión de combate inconsistente: ábrela de nuevo para seguir",
			);
		}
		const estadoRng = this.rng.estado();
		const escrituras = c.escrituras;
		try {
			const eventos = await c.resolver(e, this.elegirRival(c));
			// El rival se quedó solo con un cambio forzado: lo resuelve la IA.
			// Hay a lo sumo un cambio forzado seguido; el tope evita un bucle infinito.
			for (
				let i = 0;
				!c.terminado() && !c.peticion("jugador") && c.peticion("rival");
				i++
			) {
				if (i >= MAX_CAMBIOS_IA) {
					throw new Error("La IA rival no logró resolver su cambio forzado");
				}
				eventos.push(...(await c.resolver(null, this.elegirRival(c))));
			}
			return this.resultado(eventos);
		} catch (error) {
			// Antes de escribir nada (elección ilegal, IA sin jugada) el combate no
			// cambió: se devuelve el Rng de la IA y la sesión sigue usable. Si ya se
			// escribió algo en el simulador (la elección de un lado, un cambio forzado
			// posterior o un `|error|` del simulador), el combate avanzó y no hay
			// vuelta atrás: la sesión queda marcada como inconsistente.
			if (c.escrituras !== escrituras) this.inconsistente = true;
			else this.rng = crearRng(this.semillaIA, estadoRng);
			throw error;
		}
	}

	/** Registro omnisciente del combate (ver `Combate.registro`). */
	registro(): string {
		if (!this.combate) throw new Error("No hay un combate abierto");
		return this.combate.registro();
	}

	private elegirRival(c: Combate): Eleccion | null {
		const p = c.peticion("rival");
		return p
			? elegirIA(p, crearEstimador(c, "rival", this.rival), this.rng)
			: null;
	}

	private resultado(eventos: EventoCombate[]): ResultadoTurno {
		const c = this.combate as Combate;
		const terminado = c.terminado();
		return {
			eventos,
			peticion: c.peticion("jugador"),
			terminado,
			...(terminado !== null && { equipoFinal: c.equipoJugador() }),
		};
	}
}
