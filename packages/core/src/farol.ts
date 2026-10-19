/** Tabla de balance de las llamas del Farol (GDD §6.10). */
export interface TablaFarol {
	/** Llamas con las que se empieza sin mejoras. */
	base: number;
	/** Llamas extra por rango de la Rama Farol: índice 0 = sin la Rama. Ej. [0, 1, 2]. */
	extraPorRango: readonly number[];
	/** Tope de llamas. */
	maximo: number;
	/** Lo que resta el Pacto "Farol tenue". */
	restaTenue: number;
	/** Tipos de nodo en los que se puede volver a intentar tras fallar (ej. ["jefe", "ecos"]). */
	repetibles: readonly string[];
}

/** Llamas iniciales de una expedición. */
export function llamasIniciales(
	t: TablaFarol,
	o: { rangoRama: number; farolTenue: boolean },
): number {
	if (
		!Number.isInteger(o.rangoRama) ||
		o.rangoRama < 0 ||
		o.rangoRama > t.extraPorRango.length - 1
	) {
		throw new RangeError(
			`llamasIniciales(): 'rangoRama' debe ser un entero entre 0 y ${t.extraPorRango.length - 1} (recibido ${String(o.rangoRama)})`,
		);
	}
	const base = t.base + (t.extraPorRango[o.rangoRama] as number);
	let llamas = Math.min(t.maximo, base);
	if (o.farolTenue) llamas -= t.restaTenue;
	if (llamas < 0) llamas = 0;
	return llamas;
}

/** Entrada de una derrota en combate. */
export interface EntradaDerrota {
	/** Llamas restantes, entero >= 0. */
	llamas: number;
	/** PS en % de TODO el equipo DESPUÉS del combate, 0 = debilitado. */
	psPct: readonly number[];
	/** Ids de nodos ya fallidos. */
	fallidos: readonly string[];
	/** Id del nodo donde se perdió. */
	nodo: string;
	/** Tipo de nodo. */
	tipoNodo: string;
}

/** Resultado de resolver una derrota. */
export type ResultadoDerrota =
	| {
			tipo: "continua";
			llamas: number;
			fallidos: string[];
			repetible: boolean;
	  }
	| { tipo: "fin"; motivo: "sin-llamas" | "sin-conscientes" };

/**
 * Resuelve una derrota: decide si la expedición continúa gastando una llama o
 * termina en derrota. No muta la entrada.
 *
 * @throws {RangeError} Si los datos son inválidos.
 */
export function resolverDerrota(
	t: TablaFarol,
	e: EntradaDerrota,
): ResultadoDerrota {
	if (!Number.isInteger(e.llamas) || e.llamas < 0) {
		throw new RangeError(
			`resolverDerrota(): 'llamas' debe ser un entero >= 0 (recibido ${String(e.llamas)})`,
		);
	}
	if (!Array.isArray(e.psPct) || e.psPct.length === 0) {
		throw new RangeError(
			`resolverDerrota(): 'psPct' debe ser una lista no vacía`,
		);
	}
	for (const p of e.psPct) {
		if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 100) {
			throw new RangeError(
				`resolverDerrota(): 'psPct' debe contener números entre 0 y 100 (recibido ${String(p)})`,
			);
		}
	}
	if (typeof e.nodo !== "string" || e.nodo === "") {
		throw new RangeError(
			`resolverDerrota(): 'nodo' debe ser una cadena no vacía`,
		);
	}
	if (typeof e.tipoNodo !== "string" || e.tipoNodo === "") {
		throw new RangeError(
			`resolverDerrota(): 'tipoNodo' debe ser una cadena no vacía`,
		);
	}

	// Primero comprueba los conscientes: si no hay ninguno, fin sin-conscientes
	// (incluso si quedan llamas).
	let consciente = false;
	for (const p of e.psPct) {
		if (p > 0) {
			consciente = true;
			break;
		}
	}
	if (!consciente) {
		return { tipo: "fin", motivo: "sin-conscientes" };
	}

	if (e.llamas < 1) {
		return { tipo: "fin", motivo: "sin-llamas" };
	}

	const llamas = e.llamas - 1;
	const fallidos: string[] = [];
	for (const f of e.fallidos) {
		if (f !== e.nodo) fallidos.push(f);
	}
	fallidos.push(e.nodo);

	const repetible = t.repetibles.includes(e.tipoNodo);

	return { tipo: "continua", llamas, fallidos, repetible };
}

/** `true` si el nodo ya aparece en la lista de fallidos. */
export function estaFallido(
	fallidos: readonly string[],
	nodo: string,
): boolean {
	if (typeof nodo !== "string" || nodo === "") {
		throw new RangeError(`estaFallido(): 'nodo' debe ser una cadena no vacía`);
	}
	return fallidos.includes(nodo);
}
