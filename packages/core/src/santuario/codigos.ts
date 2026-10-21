export type IdCodigo =
	| "manos-ocupadas"
	| "ritmo-propio"
	| "disciplina"
	| "cuidado-mutuo"
	| "cosecha-abundante"
	| "bosque-libre";

export type Opcion = "A" | "B";

/** Efectos numéricos o de regla de un Código; todo opcional. */
export interface EfectoCodigo {
	/** Multiplica toda la producción. */
	multProduccion?: number;
	/** Se suma cada jornada (puede ser negativo). */
	animoPorJornada?: number;
	/** Niveles extra por Eco vencido. */
	nivelesPorEco?: number;
	/** Los debilitados nunca quedan agotados. */
	debilitadosNoAgotan?: boolean;
	/** Multiplica la producción del Huerto. */
	multHuerto?: number;
	/** Jornadas entre visitantes extra. */
	visitanteCada?: number;
}

export interface DefCodigo {
	id: IdCodigo;
	efecto: EfectoCodigo;
}

export interface DefNivelCodigo {
	nivel: number;
	categoria: "trabajo" | "combate" | "naturaleza";
	A: DefCodigo;
	B: DefCodigo;
}

export type TablaCodigos = readonly DefNivelCodigo[];

/** Elecciones hechas: nivel del Altar → opción. */
export type EleccionesCodigos = Readonly<Record<number, Opcion>>;

/** Efecto total ya combinado. */
export interface EfectoTotal {
	multProduccion: number;
	animoPorJornada: number;
	nivelesPorEco: number;
	debilitadosNoAgotan: boolean;
	multHuerto: number;
	visitanteCada?: number;
}

const MULT_BASE = 1;

/** Busca la definición de un nivel en la tabla. */
function buscarDefNivel(
	nivel: number,
	t: TablaCodigos,
): DefNivelCodigo | undefined {
	for (const def of t) {
		if (def.nivel === nivel) return def;
	}
	return undefined;
}

/** Devuelve el id de la opción elegida para un nivel, o undefined. */
function idDeOpcion(def: DefNivelCodigo, opcion: Opcion): IdCodigo {
	return opcion === "A" ? def.A.id : def.B.id;
}

/** Devuelve el efecto de una opción. */
function efectoDeOpcion(def: DefNivelCodigo, opcion: Opcion): EfectoCodigo {
	return opcion === "A" ? def.A.efecto : def.B.efecto;
}

/**
 * Niveles de la tabla con `nivel <= nivelAltar` que aún no tienen elección,
 * en orden ascendente.
 */
export function nivelesPendientes(
	nivelAltar: number,
	elegidos: EleccionesCodigos,
	t: TablaCodigos,
): number[] {
	const pendientes: number[] = [];
	for (const def of t) {
		if (def.nivel <= nivelAltar && !(def.nivel in elegidos)) {
			pendientes.push(def.nivel);
		}
	}
	return pendientes;
}

/**
 * Devuelve un objeto NUEVO con la elección. No muta la entrada.
 *
 * @throws {RangeError} Si el nivel no está en la tabla, es mayor que
 * `nivelAltar`, ya se eligió o la opción no es "A" ni "B".
 */
export function elegirCodigo(
	elegidos: EleccionesCodigos,
	nivel: number,
	opcion: Opcion,
	nivelAltar: number,
	t: TablaCodigos,
): EleccionesCodigos {
	const def = buscarDefNivel(nivel, t);
	if (def === undefined) {
		throw new RangeError(
			`elegirCodigo(): el nivel ${nivel} no está en la tabla de códigos`,
		);
	}
	if (nivel > nivelAltar) {
		throw new RangeError(
			`elegirCodigo(): el nivel ${nivel} supera el nivel del Altar ${nivelAltar}`,
		);
	}
	if (nivel in elegidos) {
		throw new RangeError(
			`elegirCodigo(): el nivel ${nivel} ya tiene una elección (es permanente)`,
		);
	}
	if (opcion !== "A" && opcion !== "B") {
		throw new RangeError(
			`elegirCodigo(): opción '${String(opcion)}' no es 'A' ni 'B'`,
		);
	}
	const nuevoMutable: Record<number, Opcion> = { ...elegidos };
	nuevoMutable[nivel] = opcion;
	return nuevoMutable;
}

/**
 * Combina los efectos de lo elegido. Los multiplicadores se multiplican entre
 * sí (base 1), `animoPorJornada` y `nivelesPorEco` se suman (base 0),
 * `debilitadosNoAgotan` es true si alguno lo pone, `multHuerto` se multiplica
 * (base 1) y `visitanteCada` es el mínimo entre los que lo definen.
 *
 * @throws {RangeError} Si alguna elección tiene un nivel que no está en la
 * tabla.
 */
export function efectoDeCodigos(
	elegidos: EleccionesCodigos,
	t: TablaCodigos,
): EfectoTotal {
	let multProduccion = MULT_BASE;
	let animoPorJornada = 0;
	let nivelesPorEco = 0;
	let debilitadosNoAgotan = false;
	let multHuerto = MULT_BASE;
	let visitanteCada: number | undefined;

	for (const nivel of Object.keys(elegidos)) {
		const n = Number(nivel);
		const def = buscarDefNivel(n, t);
		if (def === undefined) {
			throw new RangeError(
				`efectoDeCodigos(): el nivel ${n} no está en la tabla de códigos`,
			);
		}
		const opcion = elegidos[n] as Opcion;
		const efecto = efectoDeOpcion(def, opcion);

		if (efecto.multProduccion !== undefined) {
			multProduccion *= efecto.multProduccion;
		}
		if (efecto.animoPorJornada !== undefined) {
			animoPorJornada += efecto.animoPorJornada;
		}
		if (efecto.nivelesPorEco !== undefined) {
			nivelesPorEco += efecto.nivelesPorEco;
		}
		if (efecto.debilitadosNoAgotan === true) {
			debilitadosNoAgotan = true;
		}
		if (efecto.multHuerto !== undefined) {
			multHuerto *= efecto.multHuerto;
		}
		if (efecto.visitanteCada !== undefined) {
			if (visitanteCada === undefined || efecto.visitanteCada < visitanteCada) {
				visitanteCada = efecto.visitanteCada;
			}
		}
	}

	return {
		multProduccion,
		animoPorJornada,
		nivelesPorEco,
		debilitadosNoAgotan,
		multHuerto,
		...(visitanteCada === undefined ? {} : { visitanteCada }),
	};
}

/** Devuelve el id del Código elegido para un nivel, o undefined. */
export function codigoElegido(
	elegidos: EleccionesCodigos,
	nivel: number,
	t: TablaCodigos,
): IdCodigo | undefined {
	const opcion = elegidos[nivel];
	if (opcion === undefined) return undefined;
	const def = buscarDefNivel(nivel, t);
	if (def === undefined) return undefined;
	return idDeOpcion(def, opcion);
}
