import type { MiembroEquipo } from "@santuario/battle";
import { crearRng } from "@santuario/core";
import type { SetCombate } from "@santuario/data";

const TAMANO = 3;

/**
 * Equipos de prueba, función pura de la semilla: se baraja la lista de sets
 * (Fisher-Yates con `crearRng`) y se reparten tres al jugador y tres al rival,
 * así no repiten especie ni se solapan. Con menos de 6 sets los lados se
 * solapan lo justo (nunca dentro de un mismo lado).
 */
export function crearEquipos(
	semilla: string,
	sets: readonly SetCombate[],
): { jugador: MiembroEquipo[]; rival: MiembroEquipo[] } {
	const rng = crearRng(semilla);
	const barajados = [...sets];
	for (let i = barajados.length - 1; i > 0; i--) {
		const j = rng.entero(0, i);
		[barajados[i], barajados[j]] = [
			barajados[j] as SetCombate,
			barajados[i] as SetCombate,
		];
	}
	const miembro = (set: SetCombate): MiembroEquipo => ({
		especie: set.especie,
		set,
	});
	const jugador = barajados.slice(0, TAMANO).map(miembro);
	// Con pocos sets, el rival toma desde el final para solaparse lo mínimo.
	const rival = barajados.slice(-TAMANO).map(miembro);
	return { jugador, rival };
}
