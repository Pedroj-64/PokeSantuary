/** Costes por rango de cada rama (vendrá de `packs/`; aquí se recibe). El rango r cuesta `costes[r - 1]`. */
export type TablaRamas = Readonly<Record<string, readonly number[]>>;

/** Rango comprado de cada rama (ausente = 0). */
export type RangosRamas = Readonly<Record<string, number>>;

/** Rango comprado de una rama, o 0 si no tiene ninguno. */
export function rangoDe(rangos: RangosRamas, rama: string): number {
	return rangos[rama] ?? 0;
}

/** Número máximo de rangos de una rama. Lanza si la rama no está en la tabla. */
export function rangoMaximo(rama: string, t: TablaRamas): number {
	const costes = t[rama];
	if (costes === undefined) {
		throw new RangeError(`rangoMaximo(): rama '${rama}' no está en la tabla`);
	}
	return costes.length;
}

/** Coste del próximo rango de una rama. Lanza si la rama no existe o ya está al máximo. */
export function costeDelSiguiente(
	rama: string,
	rangos: RangosRamas,
	t: TablaRamas,
): number {
	const costes = t[rama];
	if (costes === undefined) {
		throw new RangeError(
			`costeDelSiguiente(): rama '${rama}' no está en la tabla`,
		);
	}
	const actual = rangoDe(rangos, rama);
	const siguiente = costes[actual];
	if (siguiente === undefined) {
		throw new RangeError(
			`costeDelSiguiente(): rama '${rama}' ya está al máximo`,
		);
	}
	return siguiente;
}

/**
 * Motivo por el que no se puede comprar un rango, o `undefined` si se puede.
 * Prioridad: `rama`, `maximo`, `recuerdos`.
 */
export function motivoNoPuedeComprar(
	rama: string,
	rangos: RangosRamas,
	recuerdos: number,
	t: TablaRamas,
): "rama" | "maximo" | "recuerdos" | undefined {
	const costes = t[rama];
	if (costes === undefined) return "rama";
	const actual = rangoDe(rangos, rama);
	if (actual >= costes.length) return "maximo";
	const siguiente = costes[actual];
	if (siguiente === undefined) return "maximo";
	if (recuerdos < siguiente) return "recuerdos";
	return undefined;
}

/**
 * Compra un rango de una rama y devuelve rangos NUEVOS y los recuerdos
 * restantes. No muta nada.
 *
 * @throws {RangeError} Con el motivo si no se puede comprar.
 */
export function comprarRama(
	rama: string,
	rangos: RangosRamas,
	recuerdos: number,
	t: TablaRamas,
): { rangos: Record<string, number>; recuerdos: number } {
	const motivo = motivoNoPuedeComprar(rama, rangos, recuerdos, t);
	if (motivo !== undefined) {
		throw new RangeError(`comprarRama(): ${motivo}`);
	}
	const coste = costeDelSiguiente(rama, rangos, t);
	const nuevosRangos: Record<string, number> = { ...rangos };
	nuevosRangos[rama] = rangoDe(rangos, rama) + 1;
	return { rangos: nuevosRangos, recuerdos: recuerdos - coste };
}

/** Suma de todos los costes de la tabla (comprar cada rama al máximo). */
export function costeTotal(t: TablaRamas): number {
	let total = 0;
	for (const costes of Object.values(t)) {
		for (const coste of costes) {
			total += coste;
		}
	}
	return total;
}
