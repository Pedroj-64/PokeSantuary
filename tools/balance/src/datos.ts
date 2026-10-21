import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nivelBaseGimnasio } from "@santuario/core";
import {
	AprendizajeSchema,
	ElitesSchema,
	EspecieSchema,
	EventosSchema,
	EvolucionesSchema,
	ExpedicionBalanceSchema,
	MovimientoSchema,
	NivelesSchema,
	SetCombateSchema,
} from "@santuario/data";
import { z } from "zod";
import { type DatosPolitica, poderDeMovimientos } from "./politica.js";
import type { DatosSimulacion } from "./simular.js";

const pack = (f: string): unknown =>
	JSON.parse(
		readFileSync(
			fileURLToPath(new URL(`../../../packs/kanto/${f}`, import.meta.url)),
			"utf8",
		),
	);

/** Opciones de carga del pack. */
export interface OpcionesCarga {
	/**
	 * Activa los datos de progresión. Por defecto no se adjuntan para que el
	 * simulador dé exactamente el mismo resultado que antes.
	 */
	progresion?: boolean;
	/** Nivel de gimnasio (0..5) cuando la progresión está activa. */
	nivelGimnasio?: number;
	/**
	 * Activa la política inteligente. Por defecto no se adjunta para que el
	 * simulador se comporte exactamente como antes.
	 */
	politica?: boolean;
}

/**
 * Datos del pack kanto tal como los usa el juego; lanza si no validan. Siempre
 * valida también `niveles.json`, `aprendizaje.json`, `evoluciones.json`,
 * `movimientos.json` y `especies.json`, pero solo adjunta la progresión y la
 * política si se piden.
 *
 * @throws {RangeError} Si `nivelGimnasio` no es un entero entre 0 y 5 con la
 * progresión activa.
 */
export function cargarDatosPack(opciones: OpcionesCarga = {}): DatosSimulacion {
	const nivelGimnasio = opciones.nivelGimnasio ?? 0;
	if (opciones.progresion === true) nivelBaseGimnasio(nivelGimnasio);
	const niveles = NivelesSchema.parse(pack("niveles.json"));
	const aprendizaje = AprendizajeSchema.parse(pack("aprendizaje.json"));
	const evoluciones = EvolucionesSchema.parse(pack("evoluciones.json"));
	const movimientos = z.array(MovimientoSchema).parse(pack("movimientos.json"));
	const especies = z.array(EspecieSchema).parse(pack("especies.json"));

	const politica: DatosPolitica | undefined =
		opciones.politica === true
			? {
					movimientos: Object.fromEntries(
						movimientos.map((m) => [
							m.id,
							{
								tipo: m.tipo,
								categoria: m.categoria,
								potencia: m.potencia,
								precision: m.precision,
							},
						]),
					),
					tiposDe: Object.fromEntries(especies.map((e) => [e.id, e.tipos])),
				}
			: undefined;
	const poder =
		politica === undefined ? undefined : poderDeMovimientos(politica);

	return {
		sets: z.array(SetCombateSchema).parse(pack("sets.json")),
		balance: ExpedicionBalanceSchema.parse(pack("expedicion.json")),
		eventos: EventosSchema.parse(pack("eventos.json")),
		elites: ElitesSchema.parse(pack("elites.json")),
		...(opciones.progresion === true
			? {
					progresion: {
						niveles,
						aprendizaje,
						evoluciones,
						nivelGimnasio,
						...(poder !== undefined ? { poder } : {}),
					},
				}
			: {}),
		...(politica !== undefined ? { politica } : {}),
	};
}
