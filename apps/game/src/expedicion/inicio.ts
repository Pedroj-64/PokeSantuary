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
		mochila: bolasIniciales(balance),
	};
}

/** Las bolas con las que se sale: del tipo más barato del catálogo. */
function bolasIniciales(balance: ExpedicionBalance): Record<string, number> {
	const bola = balance.catalogoTienda
		.filter((a) => a.tipo === "ball")
		.sort((a, b) => a.precio - b.precio)[0];
	return bola === undefined || balance.bolasIniciales === 0
		? {}
		: { [bola.id]: balance.bolasIniciales };
}
