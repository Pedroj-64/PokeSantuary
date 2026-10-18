import { type EstadoExpedicion, iniciarExpedicion } from "@santuario/core";
import type { ExpedicionBalance, SetCombate } from "@santuario/data";
import { crearEquipos } from "../combate/equipos.js";

/**
 * Expedición de prueba: el equipo son tres especies del catálogo elegidas con la
 * semilla (hasta que el equipo salga del Santuario, en la Fase 3) y el dinero
 * inicial sale del balance del pack.
 */
export function expedicionInicial(
	semilla: string,
	sets: readonly SetCombate[],
	balance: ExpedicionBalance,
): EstadoExpedicion {
	const { jugador } = crearEquipos(semilla, sets);
	return {
		...iniciarExpedicion(
			semilla,
			jugador.map((m) => m.especie),
		),
		dinero: balance.dineroInicial,
	};
}
