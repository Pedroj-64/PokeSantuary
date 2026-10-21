import { type RangosRamas, rangoDe } from "./ramas.js";

/** Efecto de un rango; todo opcional. Los valores son TOTALES de ese rango. */
export interface EfectoRama {
	/** Llamas del Farol con las que se sale. */
	llamas?: number;
	/** Poké Balls extra al salir. */
	bolasExtra?: number;
	/** Bayas extra al salir. */
	bayasExtra?: number;
	/** Objetos del Almacén que se pueden llevar. */
	objetosAlmacen?: number;
	/** Miembros del equipo de expedición. */
	equipoMax?: number;
	/** Opciones al elegir runa. */
	opcionesRuna?: number;
	/** La Bendición del Alba también en la Raíz del Árbol. */
	bendicionEnRaiz?: boolean;
	/** La de la Raíz puede ser de Lamento. */
	bendicionDeLamento?: boolean;
	/** Curación entre pisos, en %. */
	curaEntrePisosPct?: number;
	/** Revive a los debilitados a este % entre pisos. */
	reviveAlPct?: number;
	/** Suma a la probabilidad de rendición sombría. */
	bonusRendicion?: number;
	/** Recuerdos extra al dejar ir un Eco. */
	recuerdosAlDejarIr?: number;
	/** Pistas de hechos en la Bitácora. */
	pistasBitacora?: boolean;
}

/** Efecto de cada rango: el rango r usa `efectos[r - 1]`. */
export type TablaEfectosRamas = Readonly<Record<string, readonly EfectoRama[]>>;

/**
 * Efecto del `rango` de la rama (`efectos[rango - 1]`); rango 0 devuelve {}.
 *
 * @throws {RangeError} Si la rama no está en la tabla o el rango es negativo,
 * no entero o mayor que los rangos de la tabla.
 */
export function efectoDeRama(
	rama: string,
	rango: number,
	t: TablaEfectosRamas,
): EfectoRama {
	const efectos = t[rama];
	if (efectos === undefined) {
		throw new RangeError(`efectoDeRama(): rama '${rama}' no está en la tabla`);
	}
	if (!Number.isInteger(rango) || rango < 0 || rango > efectos.length) {
		throw new RangeError(
			`efectoDeRama(): rango '${String(rango)}' inválido para '${rama}' (debe ser 0..${efectos.length})`,
		);
	}
	if (rango === 0) return {};
	const efecto = efectos[rango - 1];
	if (efecto === undefined) {
		throw new RangeError(
			`efectoDeRama(): no hay efecto para el rango ${rango} de '${rama}'`,
		);
	}
	return efecto;
}

/**
 * Combina en un único efecto los efectos del rango comprado de cada rama.
 *
 * Los campos numéricos toman el MÁXIMO entre las ramas que los definen; los
 * booleanos se combinan con OR. Un campo que ninguna rama define no aparece
 * en el resultado. Una rama con rango 0 o ausente no aporta.
 *
 * @throws {RangeError} Si alguna rama de `rangos` no está en la tabla.
 */
export function efectosDeRamas(
	rangos: RangosRamas,
	t: TablaEfectosRamas,
): EfectoRama {
	const resultado: Record<string, number | boolean> = {};
	for (const rama of Object.keys(rangos)) {
		const rango = rangoDe(rangos, rama);
		if (rango === 0) continue;
		const efecto = efectoDeRama(rama, rango, t);
		for (const [clave, valor] of Object.entries(efecto)) {
			if (valor === undefined) continue;
			const previo = resultado[clave];
			if (typeof valor === "boolean") {
				if (valor === true) {
					resultado[clave] = true;
				}
			} else {
				if (previo === undefined || valor > (previo as number)) {
					resultado[clave] = valor;
				}
			}
		}
	}
	return resultado as EfectoRama;
}
