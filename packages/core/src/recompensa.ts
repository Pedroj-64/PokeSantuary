import type { TipoNodo } from "./mapa.js";
import type { Rng } from "./rng.js";

/** Rango de dinero, en monedas enteras. */
export interface RangoDinero {
	min: number;
	max: number;
}

/** Tipos de nodo que dan recompensa, con un rango por piso (1, 2 y 3). */
export type TablaRecompensas = Record<
	"salvaje" | "entrenador" | "alfa" | "sombrio" | "jefe",
	readonly [RangoDinero, RangoDinero, RangoDinero]
>;

/** Tipos de nodo que dan recompensa de combate. */
const TIPOS_CON_RECOMPENSA = [
	"salvaje",
	"entrenador",
	"alfa",
	"sombrio",
	"jefe",
] as const;

type TipoConRecompensa = (typeof TIPOS_CON_RECOMPENSA)[number];

/** ¿El tipo de nodo da recompensa de combate? */
function conRecompensa(tipo: TipoNodo): tipo is TipoConRecompensa {
	return (TIPOS_CON_RECOMPENSA as readonly TipoNodo[]).includes(tipo);
}

/**
 * Dinero que suelta un combate: tira el rango del tipo de nodo y el piso con el
 * `rng` recibido, así que con el mismo `rng` da siempre el mismo resultado.
 *
 * @param tabla Rangos por tipo de nodo y piso; no se muta.
 * @param tipo Tipo del nodo del combate.
 * @param piso Piso de la expedición, 1 a 3.
 * @param rng Generador del que sale la tirada.
 * @throws {RangeError} Si el tipo no es de combate, si el piso no es 1, 2 o 3,
 * si la tabla no tiene el rango de ese tipo y piso o si el rango está invertido.
 */
export function recompensa(
	tabla: TablaRecompensas,
	tipo: TipoNodo,
	piso: 1 | 2 | 3,
	rng: Rng,
): number {
	if (piso !== 1 && piso !== 2 && piso !== 3) {
		throw new RangeError(
			`recompensa(): 'piso' debe ser 1, 2 o 3 (recibido ${String(piso)})`,
		);
	}
	if (!conRecompensa(tipo)) {
		throw new RangeError(`recompensa(): el nodo ${tipo} no da recompensa`);
	}
	if (tabla === null || typeof tabla !== "object") {
		throw new RangeError("recompensa(): se esperaba una tabla de recompensas");
	}
	const rangos = tabla[tipo];
	if (rangos === undefined) {
		throw new RangeError(`recompensa(): la tabla no tiene rangos de ${tipo}`);
	}
	const rango = rangos[piso - 1];
	if (rango === undefined) {
		throw new RangeError(
			`recompensa(): falta el rango de ${tipo} en el piso ${piso}`,
		);
	}
	if (
		!Number.isInteger(rango.min) ||
		!Number.isInteger(rango.max) ||
		rango.min > rango.max
	) {
		throw new RangeError(
			`recompensa(): rango inválido para ${tipo} en el piso ${piso} (${rango.min}-${rango.max})`,
		);
	}
	return rng.entero(rango.min, rango.max);
}
