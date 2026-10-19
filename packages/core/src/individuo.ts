import type { Rng } from "./rng.js";

export type Estadistica = "atk" | "def" | "spa" | "spd" | "spe";

export const ESTADISTICAS: readonly Estadistica[] = [
	"atk",
	"def",
	"spa",
	"spd",
	"spe",
];

export interface IV {
	hp: number;
	atk: number;
	def: number;
	spa: number;
	spd: number;
	spe: number;
}

/** Los 25 nombres de naturaleza, en el orden canónico de la lista. */
const NATURALEZAS: readonly string[] = [
	"Hardy",
	"Lonely",
	"Brave",
	"Adamant",
	"Naughty",
	"Bold",
	"Docile",
	"Relaxed",
	"Impish",
	"Lax",
	"Timid",
	"Hasty",
	"Serious",
	"Jolly",
	"Naive",
	"Modest",
	"Mild",
	"Quiet",
	"Bashful",
	"Rash",
	"Calm",
	"Gentle",
	"Sassy",
	"Careful",
	"Quirky",
];

/** Naturalezas neutras: no suben ni bajan ninguna estadística. */
const NEUTRAS: readonly string[] = [
	"Hardy",
	"Docile",
	"Serious",
	"Bashful",
	"Quirky",
];

/** Tabla clásica de las 20 naturalezas que alteran una estadística. */
const EFECTOS: Record<string, { sube: Estadistica; baja: Estadistica }> = {
	Lonely: { sube: "atk", baja: "def" },
	Brave: { sube: "atk", baja: "spe" },
	Adamant: { sube: "atk", baja: "spa" },
	Naughty: { sube: "atk", baja: "spd" },
	Bold: { sube: "def", baja: "atk" },
	Relaxed: { sube: "def", baja: "spe" },
	Impish: { sube: "def", baja: "spa" },
	Lax: { sube: "def", baja: "spd" },
	Timid: { sube: "spe", baja: "atk" },
	Hasty: { sube: "spe", baja: "def" },
	Jolly: { sube: "spe", baja: "spa" },
	Naive: { sube: "spe", baja: "spd" },
	Modest: { sube: "spa", baja: "atk" },
	Mild: { sube: "spa", baja: "def" },
	Quiet: { sube: "spa", baja: "spe" },
	Rash: { sube: "spa", baja: "spd" },
	Calm: { sube: "spd", baja: "atk" },
	Gentle: { sube: "spd", baja: "def" },
	Sassy: { sube: "spd", baja: "spe" },
	Careful: { sube: "spd", baja: "spa" },
};

/** Valida que `naturaleza` esté entre las 25 admitidas. */
function exigirNaturalezaValida(naturaleza: string, quien: string): void {
	if (!NATURALEZAS.includes(naturaleza)) {
		throw new RangeError(`${quien}(): naturaleza desconocida '${naturaleza}'`);
	}
}

/**
 * Genera los IV de un individuo: cada estadística es `rng.entero(0, 31)`,
 * consumidas SIEMPRE en el orden hp, atk, def, spa, spd, spe.
 */
export function generarIV(rng: Rng): IV {
	return {
		hp: rng.entero(0, 31),
		atk: rng.entero(0, 31),
		def: rng.entero(0, 31),
		spa: rng.entero(0, 31),
		spd: rng.entero(0, 31),
		spe: rng.entero(0, 31),
	};
}

/**
 * Efecto de una naturaleza sobre las estadísticas.
 *
 * @returns `{ sube, baja }` para las 20 naturalezas que alteran stats,
 * `undefined` para las 5 neutras.
 * @throws {RangeError} Si `naturaleza` no está entre las 25 admitidas.
 */
export function efectoNaturaleza(
	naturaleza: string,
): { sube: Estadistica; baja: Estadistica } | undefined {
	exigirNaturalezaValida(naturaleza, "efectoNaturaleza");
	if (NEUTRAS.includes(naturaleza)) return undefined;
	return EFECTOS[naturaleza];
}

/**
 * Multiplicador de una estadística por naturaleza: `1.1` si la sube, `0.9`
 * si la baja, `1` en el resto.
 *
 * @throws {RangeError} Si `naturaleza` no está entre las 25 admitidas.
 */
export function multiplicadorNaturaleza(
	naturaleza: string,
	estadistica: Estadistica,
): number {
	const efecto = efectoNaturaleza(naturaleza);
	if (efecto === undefined) return 1;
	if (efecto.sube === estadistica) return 1.1;
	if (efecto.baja === estadistica) return 0.9;
	return 1;
}

/**
 * Elige una de las 25 naturalezas con `rng.entero(0, 24)` sobre la lista
 * canónica. Es determinista.
 */
export function elegirNaturaleza(rng: Rng): string {
	return NATURALEZAS[rng.entero(0, 24)] as string;
}
