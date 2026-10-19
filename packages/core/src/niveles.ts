import type { Rng } from "./rng.js";

export type TipoRival =
	| "salvaje"
	| "ecoComun"
	| "ecoNombrado"
	| "sombrio"
	| "rival"
	| "alfa"
	| "jefe"
	| "heraldo";

export interface TablaNiveles {
	/** Base del nivel del rival por piso: índice 0 = piso 1 ... (4 pisos). */
	basePorPiso: readonly number[];
	/** Desplazamiento sobre la base por tipo de rival (el "as" usa `desplazamientoAs`). */
	desplazamiento: Record<TipoRival, number>;
	/** Desplazamiento del as del equipo rival, por tipo (solo ecoComun, ecoNombrado, jefe, heraldo). */
	desplazamientoAs: Partial<Record<TipoRival, number>>;
	/** Extra sobre el valor normal en una Emboscada. */
	emboscada: number;
	/** Rango extra del salvaje: se suma entero(0, salvajeExtra). */
	salvajeExtra: number;
	/** Cada rango del Eco Furioso suma esto a la base del piso. */
	porRangoFurioso: number;
}

export interface TablaSubida {
	/** Niveles ganados por victoria según el tipo de rival: [participantes, banquillo consciente]. */
	porRival: Partial<Record<TipoRival, readonly [number, number]>>;
	/** Un miembro con esta diferencia o más respecto al más alto del equipo gana +1 extra. */
	umbralPonerseAlDia: number;
	/** Extra al ponerse al día. */
	extraPonerseAlDia: number;
	/** Margen sobre el nivel del as del jefe del piso para el tope. */
	margenTope: number;
}

const GIMNASIO_MIN = 0;
const GIMNASIO_MAX = 5;

/**
 * Nivel base de gimnasio: `NB = 8 + 2 * nivelGimnasio`.
 *
 * @throws {RangeError} Si `nivelGimnasio` no es un entero entre 0 y 5.
 */
export function nivelBaseGimnasio(nivelGimnasio: number): number {
	if (!Number.isInteger(nivelGimnasio)) {
		throw new RangeError(
			`nivelBaseGimnasio(): 'nivelGimnasio' debe ser un entero (recibido ${String(nivelGimnasio)})`,
		);
	}
	if (nivelGimnasio < GIMNASIO_MIN || nivelGimnasio > GIMNASIO_MAX) {
		throw new RangeError(
			`nivelBaseGimnasio(): 'nivelGimnasio' debe estar entre ${GIMNASIO_MIN} y ${GIMNASIO_MAX} (recibido ${nivelGimnasio})`,
		);
	}
	return 8 + 2 * nivelGimnasio;
}

/**
 * Nivel inicial de un rival: `min(NB + 6, max(NB, nivelEtapa - 2))`.
 *
 * @throws {RangeError} Si `nivelGimnasio` no es un entero entre 0 y 5 o si
 * `nivelEtapa` no es un entero mayor o igual que 0.
 */
export function nivelInicial(
	nivelGimnasio: number,
	nivelEtapa: number,
): number {
	if (!Number.isInteger(nivelEtapa) || nivelEtapa < 0) {
		throw new RangeError(
			`nivelInicial(): 'nivelEtapa' debe ser un entero mayor o igual que 0 (recibido ${String(nivelEtapa)})`,
		);
	}
	const nb = nivelBaseGimnasio(nivelGimnasio);
	return Math.min(nb + 6, Math.max(nb, nivelEtapa - 2));
}

/** Valida que un piso existe en la tabla y es un entero válido. */
function exigirPisoValido(t: TablaNiveles, piso: number, quien: string): void {
	if (!Number.isInteger(piso) || piso < 1 || piso > t.basePorPiso.length) {
		throw new RangeError(
			`${quien}(): 'piso' debe ser un entero entre 1 y ${t.basePorPiso.length} (recibido ${String(piso)})`,
		);
	}
}

/** Valida que un dato es un entero. */
function exigirEntero(valor: unknown, campo: string, quien: string): void {
	if (!Number.isInteger(valor)) {
		throw new RangeError(
			`${quien}(): '${campo}' debe ser un entero (recibido ${String(valor)})`,
		);
	}
}

/**
 * Nivel de un rival en un piso.
 *
 * `base = t.basePorPiso[piso-1] + t.porRangoFurioso * (rangoFurioso ?? 0)`;
 * `nivel = base + (as ? t.desplazamientoAs[tipo] : t.desplazamiento[tipo])`;
 * si `tipo === "salvaje"` suma `rng.entero(0, t.salvajeExtra)` (y solo ahí
 * consume el rng); si `emboscada` suma `t.emboscada`.
 *
 * @throws {RangeError} Si el piso no existe en la tabla, si `as` se pide para
 * un tipo sin `desplazamientoAs`, o si algún dato no es un entero.
 */
export function nivelRival(
	t: TablaNiveles,
	o: {
		tipo: TipoRival;
		piso: number;
		as?: boolean;
		emboscada?: boolean;
		rangoFurioso?: number;
	},
	rng: Rng,
): number {
	const quien = "nivelRival";
	exigirPisoValido(t, o.piso, quien);
	exigirEntero(o.piso, "piso", quien);
	if (!Number.isInteger(t.porRangoFurioso)) {
		throw new RangeError(`${quien}(): 'porRangoFurioso' debe ser un entero`);
	}
	const rangoFurioso = o.rangoFurioso ?? 0;
	exigirEntero(rangoFurioso, "rangoFurioso", quien);
	const base =
		(t.basePorPiso[o.piso - 1] as number) + t.porRangoFurioso * rangoFurioso;

	let desplazamiento: number;
	if (o.as) {
		if (!(o.tipo in t.desplazamientoAs)) {
			throw new RangeError(
				`${quien}(): el tipo '${o.tipo}' no tiene desplazamiento de as`,
			);
		}
		desplazamiento = t.desplazamientoAs[o.tipo] as number;
	} else {
		desplazamiento = t.desplazamiento[o.tipo] as number;
	}
	if (!Number.isInteger(desplazamiento)) {
		throw new RangeError(`${quien}(): desplazamiento no es un entero`);
	}

	let nivel = base + desplazamiento;

	if (o.tipo === "salvaje") {
		exigirEntero(t.salvajeExtra, "salvajeExtra", quien);
		nivel += rng.entero(0, t.salvajeExtra);
	}

	if (o.emboscada) {
		exigirEntero(t.emboscada, "emboscada", quien);
		nivel += t.emboscada;
	}

	return nivel;
}

/** Valida una tabla de subida de niveles. */
function validarTablaSubida(
	t: TablaSubida,
	rival: TipoRival,
	quien: string,
): void {
	if (!Number.isInteger(t.umbralPonerseAlDia) || t.umbralPonerseAlDia < 0) {
		throw new RangeError(
			`${quien}(): 'umbralPonerseAlDia' debe ser un entero >= 0`,
		);
	}
	if (!Number.isInteger(t.extraPonerseAlDia) || t.extraPonerseAlDia < 0) {
		throw new RangeError(
			`${quien}(): 'extraPonerseAlDia' debe ser un entero >= 0`,
		);
	}
	if (!Number.isInteger(t.margenTope) || t.margenTope < 0) {
		throw new RangeError(`${quien}(): 'margenTope' debe ser un entero >= 0`);
	}
	const porRival = t.porRival[rival];
	if (porRival === undefined) {
		throw new RangeError(
			`${quien}(): el rival '${rival}' no está en la tabla de subida`,
		);
	}
	if (
		!Array.isArray(porRival) ||
		porRival.length !== 2 ||
		!Number.isInteger(porRival[0]) ||
		porRival[0] < 0 ||
		!Number.isInteger(porRival[1]) ||
		porRival[1] < 0
	) {
		throw new RangeError(
			`${quien}(): 'porRival[${rival}]' debe ser una tupla [participantes, banquillo] de enteros >= 0`,
		);
	}
}

/** Valida las listas de participantes y conscientes. */
function validarListasSubida(
	niveles: readonly number[],
	participantes: readonly number[],
	conscientes: readonly boolean[],
	quien: string,
): void {
	if (!Array.isArray(niveles)) {
		throw new RangeError(`${quien}(): 'niveles' debe ser una lista`);
	}
	if (!Array.isArray(participantes)) {
		throw new RangeError(`${quien}(): 'participantes' debe ser una lista`);
	}
	if (!Array.isArray(conscientes)) {
		throw new RangeError(`${quien}(): 'conscientes' debe ser una lista`);
	}
	if (niveles.length !== conscientes.length) {
		throw new RangeError(
			`${quien}(): 'niveles' y 'conscientes' deben tener la misma longitud`,
		);
	}
	const n = niveles.length;
	for (let i = 0; i < n; i++) {
		if (!Number.isInteger(niveles[i]) || niveles[i] < 1) {
			throw new RangeError(
				`${quien}(): niveles[${i}] debe ser un entero >= 1 (recibido ${String(niveles[i])})`,
			);
		}
		if (typeof conscientes[i] !== "boolean") {
			throw new RangeError(
				`${quien}(): conscientes[${i}] debe ser un booleano`,
			);
		}
	}
	const visto = new Set<number>();
	for (const p of participantes) {
		if (!Number.isInteger(p) || p < 0 || p >= n) {
			throw new RangeError(
				`${quien}(): participantes[${String(p)}] debe ser un índice válido (0..${n - 1})`,
			);
		}
		if (visto.has(p)) {
			throw new RangeError(`${quien}(): participante ${p} repetido`);
		}
		visto.add(p);
	}
}

/**
 * Sube niveles tras una victoria y devuelve los niveles nuevos en el mismo
 * orden. No muta la entrada.
 *
 * Reglas:
 * - los índices de `participantes` ganan `porRival[rival][0]`;
 * - los demás miembros CONSCIENTES (`conscientes[i]`) que no participaron
 *   ganan `porRival[rival][1]`;
 * - los inconscientes que no participaron no ganan nada;
 * - "ponerse al día": un miembro que no es el más alto y cuyo nivel ANTES de
 *   la victoria sea `umbralPonerseAlDia` o más por debajo del más alto del
 *   equipo gana `extraPonerseAlDia` más (solo si ganó algo; no se acumula);
 * - `techo` es el nivel del as del jefe del piso: ningún nivel pasa de
 *   `techo + t.margenTope`; un miembro que YA está por encima del tope no baja
 *   ni sube.
 *
 * @throws {RangeError} Si `participantes` tiene repetidos o índices fuera de
 * rango, longitudes distintas, niveles no enteros >= 1, o `rival` no está en
 * la tabla.
 */
export function subirNiveles(
	t: TablaSubida,
	o: {
		niveles: readonly number[];
		participantes: readonly number[];
		conscientes: readonly boolean[];
		rival: TipoRival;
		techo: number;
	},
): number[] {
	const quien = "subirNiveles";
	const { niveles, participantes, conscientes, rival, techo } = o;
	if (!Number.isInteger(techo) || techo < 1) {
		throw new RangeError(`${quien}(): 'techo' debe ser un entero >= 1`);
	}
	validarTablaSubida(t, rival, quien);
	validarListasSubida(niveles, participantes, conscientes, quien);

	const [ganaParticipa, ganaBanquillo] = t.porRival[rival] as readonly [
		number,
		number,
	];
	const masAlto = Math.max(...niveles);
	const tope = techo + t.margenTope;
	const encimaTope = new Set<number>();

	for (let i = 0; i < niveles.length; i++) {
		if ((niveles[i] as number) > tope) encimaTope.add(i);
	}

	const resultado = [...niveles];
	const ganoAlgo = new Array(niveles.length).fill(false);

	// Participantes
	for (const p of participantes) {
		if (!encimaTope.has(p)) {
			if (ganaParticipa > 0) ganoAlgo[p] = true;
			resultado[p] = (resultado[p] as number) + ganaParticipa;
		}
	}

	// Banquillo consciente
	for (let i = 0; i < niveles.length; i++) {
		if (participantes.includes(i)) continue;
		if (!conscientes[i]) continue;
		if (encimaTope.has(i)) continue;
		if (ganaBanquillo > 0) ganoAlgo[i] = true;
		resultado[i] = (resultado[i] as number) + ganaBanquillo;
	}

	// Ponerse al día: solo quien ganó algo, no es el más alto, y estaba
	// umbralPonerseAlDia o más por debajo del más alto (niveles ANTES).
	for (let i = 0; i < niveles.length; i++) {
		if (!ganoAlgo[i]) continue;
		if (niveles[i] === masAlto) continue;
		if (masAlto - (niveles[i] as number) < t.umbralPonerseAlDia) continue;
		if (encimaTope.has(i)) continue;
		resultado[i] = (resultado[i] as number) + t.extraPonerseAlDia;
	}

	// Tope final: quien subio no pasa de tope. Quien YA estaba por encima no
	// baja ni sube (se respeta su nivel actual).
	for (let i = 0; i < resultado.length; i++) {
		if (ganoAlgo[i] && (resultado[i] as number) > tope) resultado[i] = tope;
	}

	return resultado;
}

/**
 * ¿Alcanza el nivel para evolucionar? `true` si `nivelEvolucion` existe y
 * `nivel >= nivelEvolucion`.
 */
export function alcanzaEvolucion(
	nivel: number,
	nivelEvolucion: number | undefined,
): boolean {
	if (!Number.isInteger(nivel) || nivel < 1) {
		throw new RangeError(
			`alcanzaEvolucion(): 'nivel' debe ser un entero >= 1 (recibido ${String(nivel)})`,
		);
	}
	if (nivelEvolucion === undefined) return false;
	if (!Number.isInteger(nivelEvolucion) || nivelEvolucion < 1) {
		throw new RangeError(
			`alcanzaEvolucion(): 'nivelEvolucion' debe ser un entero >= 1 o undefined`,
		);
	}
	return nivel >= nivelEvolucion;
}
