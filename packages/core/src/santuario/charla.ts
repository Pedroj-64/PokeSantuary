import { crearRng } from "../rng.js";
import type { TemaCharla } from "./estado.js";

export const TEMAS_CHARLA: readonly TemaCharla[] = [
	"animo",
	"trabajo",
	"valor",
	"calma",
	"cuidado",
	"raices",
];

const INDICE_TEMA: Map<TemaCharla, number> = new Map(
	TEMAS_CHARLA.map((tema, i) => [tema, i]),
);

/**
 * Devuelve los 3 temas de la Charla del Alba para la jornada, sacados de los 6
 * con la semilla de la jornada. Son distintos y estan ordenados como en
 * `TEMAS_CHARLA`.
 *
 * @throws {RangeError} Si `jornada` no es un entero mayor o igual que 1.
 */
export function temasDelDia(semilla: string, jornada: number): TemaCharla[] {
	if (!Number.isInteger(jornada) || jornada < 1) {
		throw new RangeError(
			`temasDelDia(): 'jornada' debe ser un entero >= 1 (recibido ${String(jornada)})`,
		);
	}
	const rng = crearRng(`${semilla}:charla:${jornada}`);
	const copia = [...TEMAS_CHARLA];
	// Barajado determinista de Fisher-Yates sobre una copia.
	for (let i = copia.length - 1; i > 0; i--) {
		const j = rng.entero(0, i);
		const temporal = copia[i] as TemaCharla;
		copia[i] = copia[j] as TemaCharla;
		copia[j] = temporal;
	}
	const elegidos = copia.slice(0, 3);
	// Ordena segun TEMAS_CHARLA para que la interfaz los muestre siempre igual.
	return [...elegidos].sort(
		(a, b) => (INDICE_TEMA.get(a) as number) - (INDICE_TEMA.get(b) as number),
	);
}

/**
 * `true` si el tema está entre los 3 de la Charla del Alba de esa jornada.
 */
export function esTemaDelDia(
	semilla: string,
	jornada: number,
	tema: string,
): boolean {
	if (!TEMAS_CHARLA.includes(tema as TemaCharla)) return false;
	return temasDelDia(semilla, jornada).includes(tema as TemaCharla);
}
