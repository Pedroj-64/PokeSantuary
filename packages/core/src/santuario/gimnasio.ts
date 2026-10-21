/** Tabla de balance del Gimnasio (vendrá de `packs/`; aquí se recibe). */
export interface TablaGimnasio {
	/** Fragmentos para pasar del nivel i al i+1 (índice i). Longitud = nivel máximo. */
	fragmentos: readonly number[];
	/** Pokédólares por nivel. */
	pokedolares: number;
	/** Nivel máximo sin la redención de Sable. */
	maximoSinSable: number;
	/** Descuento de Sable como fracción (0,25). */
	descuentoSable: number;
}

export interface OpcionesGimnasio {
	sableVecino: boolean;
}
export interface CosteGimnasio {
	fragmentos: number;
	pokedolares: number;
}

const MIN_NIVEL = 0;
const MIN_COSTE = 1;

/** Nivel máximo alcanzable en el Gimnasio. */
export function nivelMaximo(t: TablaGimnasio, o: OpcionesGimnasio): number {
	if (o.sableVecino) return t.fragmentos.length;
	return t.maximoSinSable;
}

/** Coste para subir del nivel `nivelActual` al siguiente. */
export function costeDeSubir(
	nivelActual: number,
	t: TablaGimnasio,
	o: OpcionesGimnasio,
): CosteGimnasio {
	if (
		!Number.isInteger(nivelActual) ||
		nivelActual < MIN_NIVEL ||
		nivelActual > t.fragmentos.length - 1
	) {
		throw new RangeError(
			`costeDeSubir(): 'nivelActual' debe ser un entero entre 0 y ${t.fragmentos.length - 1} (recibido ${String(nivelActual)})`,
		);
	}
	const multiplicador = o.sableVecino ? 1 - t.descuentoSable : 1;
	const fragmentosBase = t.fragmentos[nivelActual];
	if (fragmentosBase === undefined) {
		throw new RangeError(
			`costeDeSubir(): no hay coste de fragmentos para el nivel ${nivelActual}`,
		);
	}
	const fragmentos = Math.max(
		MIN_COSTE,
		Math.ceil(fragmentosBase * multiplicador),
	);
	const pokedolares = Math.ceil(t.pokedolares * multiplicador);
	return { fragmentos, pokedolares };
}

/**
 * Motivo por el que no se puede subir de nivel, o `undefined` si se puede.
 * Prioridad: `maximo`, `sable`, `recursos`.
 */
export function motivoNoPuedeSubir(
	nivelActual: number,
	recursos: Readonly<Record<string, number>>,
	t: TablaGimnasio,
	o: OpcionesGimnasio,
): "maximo" | "sable" | "recursos" | undefined {
	if (!Number.isInteger(nivelActual) || nivelActual < MIN_NIVEL) {
		throw new RangeError(
			`motivoNoPuedeSubir(): 'nivelActual' debe ser un entero >= 0 (recibido ${String(nivelActual)})`,
		);
	}
	const maximo = t.fragmentos.length;
	if (nivelActual >= maximo) return "maximo";
	const siguiente = nivelActual + 1;
	if (!o.sableVecino && siguiente > t.maximoSinSable) return "sable";
	const fragmentos = recursos.fragmentos ?? 0;
	const pokedolares = recursos.pokedolares ?? 0;
	const coste = costeDeSubir(nivelActual, t, o);
	if (fragmentos < coste.fragmentos || pokedolares < coste.pokedolares) {
		return "recursos";
	}
	return undefined;
}

/**
 * Sube el Gimnasio un nivel y devuelve el nivel nuevo y los recursos nuevos
 * con el coste descontado. No muta la entrada.
 *
 * @throws {RangeError} Con el motivo si no se puede subir.
 */
export function subirGimnasio(
	nivelActual: number,
	recursos: Readonly<Record<string, number>>,
	t: TablaGimnasio,
	o: OpcionesGimnasio,
): { nivel: number; recursos: Record<string, number> } {
	const motivo = motivoNoPuedeSubir(nivelActual, recursos, t, o);
	if (motivo !== undefined) {
		throw new RangeError(`subirGimnasio(): ${motivo}`);
	}
	const coste = costeDeSubir(nivelActual, t, o);
	const nuevosRecursos: Record<string, number> = {
		...recursos,
		fragmentos: (recursos.fragmentos ?? 0) - coste.fragmentos,
		pokedolares: (recursos.pokedolares ?? 0) - coste.pokedolares,
	};
	return { nivel: nivelActual + 1, recursos: nuevosRecursos };
}
