/** Tamaño de una alineación de combate. */
export const TAMANO_ALINEACION = 3;

/** Índices de los Pokémon conscientes (psPct > 0), en orden del equipo. */
export function conscientes(psPct: readonly number[]): number[] {
	const resultado: number[] = [];
	for (let i = 0; i < psPct.length; i++) {
		const p = psPct[i];
		if (p === undefined) continue;
		if (p > 0) resultado.push(i);
	}
	return resultado;
}

/** `true` si hay más de 3 conscientes (el jugador debe elegir). */
export function necesitaElegir(psPct: readonly number[]): boolean {
	return conscientes(psPct).length > TAMANO_ALINEACION;
}

/** Los primeros (hasta) 3 conscientes en orden del equipo. */
export function alineacionAutomatica(psPct: readonly number[]): number[] {
	return conscientes(psPct).slice(0, TAMANO_ALINEACION);
}

/**
 * Valida una alineación y devuelve una copia de `elegidos` si es legal.
 *
 * Reglas: índices enteros dentro del equipo; sin repetidos; todos conscientes;
 * entre 1 y 3 elementos; si hay 3 o más conscientes debe haber EXACTAMENTE 3;
 * si hay menos de 3 conscientes deben estar TODOS los conscientes; el orden se
 * respeta tal cual. Si no hay ningún consciente lanza.
 *
 * @throws {RangeError} Si los datos son inválidos.
 */
export function validarAlineacion(
	psPct: readonly number[],
	elegidos: readonly number[],
): number[] {
	if (!Array.isArray(psPct) || psPct.length === 0) {
		throw new RangeError(
			`validarAlineacion(): 'psPct' debe ser una lista no vacía`,
		);
	}
	for (const p of psPct) {
		if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 100) {
			throw new RangeError(
				`validarAlineacion(): 'psPct' debe contener números entre 0 y 100 (recibido ${String(p)})`,
			);
		}
	}
	if (!Array.isArray(elegidos)) {
		throw new RangeError(`validarAlineacion(): 'elegidos' debe ser una lista`);
	}
	if (elegidos.length < 1 || elegidos.length > TAMANO_ALINEACION) {
		throw new RangeError(
			`validarAlineacion(): 'elegidos' debe tener entre 1 y ${TAMANO_ALINEACION} elementos (recibido ${elegidos.length})`,
		);
	}

	const cs = conscientes(psPct);
	if (cs.length === 0) {
		throw new RangeError(
			"validarAlineacion(): no hay ningún Pokémon consciente en el equipo",
		);
	}

	const visto = new Set<number>();
	const resultado: number[] = [];
	for (const e of elegidos) {
		if (!Number.isInteger(e)) {
			throw new RangeError(
				`validarAlineacion(): índice no entero (recibido ${String(e)})`,
			);
		}
		if (e < 0 || e >= psPct.length) {
			throw new RangeError(
				`validarAlineacion(): índice fuera de rango (recibido ${e}, equipo de ${psPct.length})`,
			);
		}
		if (visto.has(e)) {
			throw new RangeError(`validarAlineacion(): índice repetido ${e}`);
		}
		visto.add(e);
		if (psPct[e] === 0) {
			throw new RangeError(
				`validarAlineacion(): el índice ${e} está debilitado`,
			);
		}
		resultado.push(e);
	}

	if (cs.length >= TAMANO_ALINEACION) {
		if (resultado.length !== TAMANO_ALINEACION) {
			throw new RangeError(
				`validarAlineacion(): con ${cs.length} conscientes debe elegirse exactamente ${TAMANO_ALINEACION}`,
			);
		}
	} else {
		// Menos de 3 conscientes: deben estar todos.
		for (const c of cs) {
			if (!visto.has(c)) {
				throw new RangeError(
					`validarAlineacion(): con menos de ${TAMANO_ALINEACION} conscientes deben elegirse todos`,
				);
			}
		}
	}

	return resultado;
}
