/** Condición para evolucionar (misma forma que `evoluciones.json`). */
export type CondicionEvolucion =
	| { tipo: "nivel"; nivel: number }
	| { tipo: "objeto"; objeto: string }
	| { tipo: "amistad"; momento?: "dia" | "noche"; nivel?: number }
	| { tipo: "intercambio"; objeto?: string }
	| { tipo: "otra"; detalle: string };

/** Evolución concreta: a qué especie lleva y con qué condición. */
export interface Evolucion {
	a: string;
	condicion: CondicionEvolucion;
}

/** Momentos de la jornada en los que se puede evolucionar. */
export type MomentoJornada = "alba" | "dia" | "atardecer" | "noche";

/** Estado del individuo relevante para decidir si evoluciona. */
export interface ContextoEvolucion {
	/** Nivel actual; entero >= 1. */
	nivel: number;
	/** Amistad actual; entero 0..5. */
	amistad: number;
	momento: MomentoJornada;
	/** Objeto que se le da en este momento (piedra evolutiva). */
	objeto?: string;
	/** true si es la Ceremonia del Envío (intercambio). */
	intercambio?: boolean;
	/** Objeto equipado, para las evoluciones por intercambio con objeto. */
	objetoEquipado?: string;
}

/** Amistad mínima para evolucionar por amistad (GDD §11.8). */
export const AMISTAD_EVOLUCION = 4;

/** Exige un contexto válido (nivel entero >= 1, amistad entero 0..5). */
function exigirContexto(ctx: ContextoEvolucion): void {
	const quien = "evolucionesDisponibles";
	if (!Number.isInteger(ctx.nivel) || ctx.nivel < 1) {
		throw new RangeError(
			`${quien}(): 'nivel' debe ser un entero >= 1 (recibido ${String(ctx.nivel)})`,
		);
	}
	if (!Number.isInteger(ctx.amistad) || ctx.amistad < 0 || ctx.amistad > 5) {
		throw new RangeError(
			`${quien}(): 'amistad' debe ser un entero entre 0 y 5 (recibido ${String(ctx.amistad)})`,
		);
	}
}

/** ¿Se cumple ahora la condición? */
function seCumple(
	condicion: CondicionEvolucion,
	ctx: ContextoEvolucion,
): boolean {
	switch (condicion.tipo) {
		case "nivel":
			return ctx.nivel >= condicion.nivel;
		case "objeto":
			return ctx.objeto === condicion.objeto;
		case "amistad": {
			if (ctx.amistad < AMISTAD_EVOLUCION) return false;
			if (condicion.nivel !== undefined && ctx.nivel < condicion.nivel) {
				return false;
			}
			if (condicion.momento === "dia") {
				return ctx.momento === "alba" || ctx.momento === "dia";
			}
			if (condicion.momento === "noche") {
				return ctx.momento === "atardecer" || ctx.momento === "noche";
			}
			return true;
		}
		case "intercambio":
			if (ctx.intercambio !== true) return false;
			if (condicion.objeto !== undefined) {
				return ctx.objetoEquipado === condicion.objeto;
			}
			return true;
		case "otra":
			// El juego todavía no usa este tipo de evolución.
			return false;
	}
}

/**
 * Evoluciones cuya condición se cumple con `ctx`, en el orden recibido.
 *
 * - `nivel`: `ctx.nivel >= condicion.nivel` (sigue disponible en subidas
 *   posteriores si el jugador cancela).
 * - `objeto`: se le da justo la piedra pedida.
 * - `amistad`: `amistad >= AMISTAD_EVOLUCION`; y además el `nivel` y el
 *   `momento` que indique la condición.
 * - `intercambio`: es la Ceremonia del Envío; y si trae objeto, lo lleva
 *   equipado.
 * - `otra`: nunca se cumple.
 *
 * No muta nada.
 *
 * @throws {RangeError} Si `ctx.nivel` no es un entero >= 1 o `ctx.amistad` no
 * es un entero entre 0 y 5.
 */
export function evolucionesDisponibles(
	evoluciones: readonly Evolucion[],
	ctx: ContextoEvolucion,
): Evolucion[] {
	exigirContexto(ctx);
	return evoluciones.filter((evolucion) => seCumple(evolucion.condicion, ctx));
}
