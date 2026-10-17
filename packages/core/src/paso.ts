import type { Rng } from "./rng.js";

/** Estado mínimo del juego; el real llega en Fase 2/3. */
export interface Estado {
	turno: number;
	bayas: number;
}

/** Acción que el jugador puede emprender en un turno. */
export type Accion = { tipo: "recolectar" } | { tipo: "descansar" };

/** Hecho observable producido por una acción. */
export type Evento =
	| { tipo: "recolectado"; cantidad: number }
	| { tipo: "descansado" };

/**
 * Función pura `step(estado, acción, rng)` del GDD §9.2.
 * No muta `estado`; todo azar sale del `rng` recibido.
 */
export function paso(
	estado: Estado,
	accion: Accion,
	rng: Rng,
): { estado: Estado; eventos: Evento[] } {
	const turno = estado.turno + 1;
	switch (accion.tipo) {
		case "descansar":
			return {
				estado: { ...estado, turno },
				eventos: [{ tipo: "descansado" }],
			};
		case "recolectar": {
			const cantidad = rng.entero(1, 3);
			return {
				estado: { ...estado, turno, bayas: estado.bayas + cantidad },
				eventos: [{ tipo: "recolectado", cantidad }],
			};
		}
	}
}
