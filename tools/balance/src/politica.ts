import type { Eleccion, Peticion } from "@santuario/battle";

/** Datos mínimos para puntuar movimientos y aplicar STAB sin la efectividad. */
export interface DatosPolitica {
	/** Por id de movimiento: tipo, categoría, potencia y precisión del pack. */
	movimientos: Record<
		string,
		{
			tipo: string;
			categoria: string;
			potencia: number | null;
			precision: number | null;
		}
	>;
	/** Por id de especie: sus tipos (para el STAB). */
	tiposDe: Record<string, string[]>;
}

/** El primer compañero vivo, sin contar al activo (como la política anterior). */
function primerCompañeroVivo(p: Peticion): Eleccion {
	const indice = p.equipo.findIndex((m) => !m.activo && !m.debilitado);
	return { tipo: "cambio", indice };
}

/**
 * Política del jugador simulado:
 *
 * 1. Entre los movimientos habilitados con potencia, elige el de mayor
 *    `potencia × (precision ?? 100) / 100 × (1,5 si el tipo coincide con
 *    alguno del activo)`. Los empates se quedan con el primero de la lista.
 * 2. Si ninguno tiene potencia (o no hay datos), el primero habilitado.
 * 3. Si el cambio es forzado o no queda ningún movimiento habilitado, el
 *    primer compañero vivo.
 * 4. Nunca cambia por iniciativa propia.
 *
 * La efectividad de tipo contra el rival no se puede consultar porque
 * `Peticion` no expone el rival; por eso solo se aplica STAB.
 */
export function elegirJugadaInteligente(
	p: Peticion,
	datos: DatosPolitica,
): Eleccion {
	if (p.tipo === "cambio-forzado") return primerCompañeroVivo(p);

	const activo = p.equipo.find((m) => m.activo);
	const tiposDelActivo =
		activo === undefined ? [] : (datos.tiposDe[activo.especie] ?? []);

	let mejorIndice = -1;
	let mejorPuntuacion = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < p.movimientos.length; i++) {
		const opcion = p.movimientos[i];
		if (opcion === undefined || opcion.deshabilitado) continue;
		const movimiento = datos.movimientos[opcion.movimiento];
		if (movimiento === undefined || movimiento.potencia === null) continue;
		const precision = movimiento.precision ?? 100;
		const stab = tiposDelActivo.includes(movimiento.tipo) ? 1.5 : 1;
		const puntuacion = movimiento.potencia * (precision / 100) * stab;
		if (puntuacion > mejorPuntuacion) {
			mejorPuntuacion = puntuacion;
			mejorIndice = i;
		}
	}
	if (mejorIndice >= 0) return { tipo: "movimiento", indice: mejorIndice };

	const primeroHabilitado = p.movimientos.findIndex((m) => !m.deshabilitado);
	if (primeroHabilitado >= 0) {
		return { tipo: "movimiento", indice: primeroHabilitado };
	}
	return primerCompañeroVivo(p);
}

/**
 * Potencia por movimiento para elegir qué olvidar. Los movimientos de estado
 * (`potencia: null`) cuentan como 0, que es lo que son a efectos de daño.
 */
export function poderDeMovimientos(
	datos: DatosPolitica,
): Record<string, number> {
	const poder: Record<string, number> = {};
	for (const [id, movimiento] of Object.entries(datos.movimientos)) {
		poder[id] = movimiento.potencia ?? 0;
	}
	return poder;
}
