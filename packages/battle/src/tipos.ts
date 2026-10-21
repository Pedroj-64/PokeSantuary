import { Dex } from "@pkmn/sim";

/** "fire" → "Fire": el simulador nombra los tipos con mayúscula inicial. */
const nombreDeTipo = (tipo: string): string =>
	tipo.charAt(0).toUpperCase() + tipo.slice(1);

/**
 * Tipos de una especie (slugs en minúscula, como los del pack), según el simulador.
 * Una especie desconocida da una lista vacía.
 */
export function tiposDeEspecie(especie: string): string[] {
	const datos = Dex.species.get(especie);
	return datos.exists ? datos.types.map((t) => t.toLowerCase()) : [];
}

/**
 * Multiplicador de un movimiento de tipo `tipoAtaque` contra un defensor de
 * esos tipos (0, 0,25, 0,5, 1, 2 o 4). Sin tipos del defensor, es 1.
 */
export function multiplicadorDeTipo(
	tipoAtaque: string,
	tiposDefensor: readonly string[],
): number {
	const ataque = nombreDeTipo(tipoAtaque);
	const defensor = tiposDefensor.map(nombreDeTipo);
	if (!Dex.getImmunity(ataque, defensor)) return 0;
	return 2 ** Dex.getEffectiveness(ataque, defensor);
}
