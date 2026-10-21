import type { Eleccion, EventoCombate, Peticion } from "@santuario/battle";
import { multiplicadorDeTipo, tiposDeEspecie } from "@santuario/battle";
import type { DatosPolitica } from "./politica.js";

/**
 * Especie del rival que está en combate tras `eventos` (el último `cambio`
 * del lado rival), o `previo` si no hubo ninguno.
 */
export function rivalActivoTras(
	eventos: readonly EventoCombate[],
	previo: string | undefined,
): string | undefined {
	let resultado = previo;
	for (const evento of eventos) {
		if (evento.tipo === "cambio" && evento.lado === "rival") {
			resultado = evento.especie;
		}
	}
	return resultado;
}

/** Puntuación de un movimiento del activo contra el rival (0 si no hace daño o es inmune). */
export function puntuacionContra(
	movimiento: string,
	especieActiva: string,
	rival: string | undefined,
	datos: DatosPolitica,
): number {
	const mov = datos.movimientos[movimiento];
	if (mov === undefined || mov.potencia === null) return 0;

	const stab = tiposDeEspecie(especieActiva).includes(mov.tipo) ? 1.5 : 1;

	const tiposRival = rival === undefined ? [] : tiposDeEspecie(rival);
	const efectividad = multiplicadorDeTipo(mov.tipo, tiposRival);

	return mov.potencia * ((mov.precision ?? 100) / 100) * stab * efectividad;
}

/**
 * Elige una jugada con conocimiento de tipos.
 *
 * 1. Cambio forzado → primer compañero vivo no activo.
 * 2. Puntuación de cada movimiento habilitado del activo; elige el mayor
 *    (empate: el primero).
 * 3. Si todas las puntuaciones son 0 y hay compañero vivo no activo, cambia.
 * 4. Si no hay movimiento habilitado, cambia al primer compañero vivo.
 */
export function elegirJugadaConTipos(
	p: Peticion,
	datos: DatosPolitica,
	rival: string | undefined,
): Eleccion {
	if (p.tipo === "cambio-forzado") {
		return primerCompañeroVivo(p);
	}

	const activo = p.equipo.find((m) => m.activo);

	let mejorIndice = -1;
	let mejorPuntuacion = 0;
	let algunHabilitado = false;

	for (let i = 0; i < p.movimientos.length; i++) {
		const opcion = p.movimientos[i];
		if (opcion === undefined || opcion.deshabilitado) continue;
		algunHabilitado = true;
		const puntuacion =
			activo === undefined
				? 0
				: puntuacionContra(opcion.movimiento, activo.especie, rival, datos);
		if (puntuacion > mejorPuntuacion) {
			mejorPuntuacion = puntuacion;
			mejorIndice = i;
		}
	}

	if (mejorIndice >= 0) {
		return { tipo: "movimiento", indice: mejorIndice };
	}

	// Ningún movimiento daña al rival: cambiar si hay compañero vivo no activo
	const indiceCambio = p.equipo.findIndex((m) => !m.activo && !m.debilitado);
	if (indiceCambio >= 0) {
		return { tipo: "cambio", indice: indiceCambio };
	}

	// Sin compañeros vivos: usar el primer movimiento habilitado
	if (algunHabilitado) {
		const primeroHabilitado = p.movimientos.findIndex((m) => !m.deshabilitado);
		if (primeroHabilitado >= 0) {
			return { tipo: "movimiento", indice: primeroHabilitado };
		}
	}

	return primerCompañeroVivo(p);
}

/** El primer compañero vivo, sin contar al activo. */
function primerCompañeroVivo(p: Peticion): Eleccion {
	const indice = p.equipo.findIndex((m) => !m.activo && !m.debilitado);
	return { tipo: "cambio", indice };
}
