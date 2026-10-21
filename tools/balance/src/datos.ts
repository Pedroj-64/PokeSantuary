import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nivelBaseGimnasio } from "@santuario/core";
import {
	AprendizajeSchema,
	ElitesSchema,
	EventosSchema,
	EvolucionesSchema,
	ExpedicionBalanceSchema,
	NivelesSchema,
	SetCombateSchema,
} from "@santuario/data";
import { z } from "zod";
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
}

/**
 * Datos del pack kanto tal como los usa el juego; lanza si no validan. Siempre
 * valida `niveles.json`, `aprendizaje.json` y `evoluciones.json`, pero solo los
 * adjunta a `progresion` si se piden.
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
	return {
		sets: z.array(SetCombateSchema).parse(pack("sets.json")),
		balance: ExpedicionBalanceSchema.parse(pack("expedicion.json")),
		eventos: EventosSchema.parse(pack("eventos.json")),
		elites: ElitesSchema.parse(pack("elites.json")),
		...(opciones.progresion === true
			? {
					progresion: { niveles, aprendizaje, evoluciones, nivelGimnasio },
				}
			: {}),
	};
}
