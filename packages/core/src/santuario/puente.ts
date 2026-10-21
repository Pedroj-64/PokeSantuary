import {
	type EntradaAprendizaje,
	MAX_MOVIMIENTOS,
	movimientosIniciales,
} from "../aprender.js";
import type { MiembroExp } from "../expedicion.js";
import { nivelInicial } from "../niveles.js";
import type { Residente } from "./estado.js";

/** Datos de una especie que necesita el puente con la expedición. */
export interface DatosEspecieProgresion {
	/** Lista de aprendizaje de la especie (como `aprendizaje.json`). */
	aprendizaje: readonly EntradaAprendizaje[];
	/** `nivelEtapa` de la especie (como `evoluciones.json`). */
	nivelEtapa: number;
	/** Tipos, trabajos preferidos y Especialidades de la especie (para rehacer el residente al evolucionar). */
	tipos: readonly string[];
	preferidos: readonly string[];
	especialidades: readonly string[];
	/** Potencia por movimiento para elegir los iniciales (opcional). */
	poder?: Readonly<Record<string, number>>;
}

/** Datos de progresión por id de especie. */
export type CatalogoProgresion = Readonly<
	Record<string, DatosEspecieProgresion>
>;

/** Busca los datos de una especie o lanza si no está en el catálogo. */
function datosDe(
	especie: string,
	c: CatalogoProgresion,
	quien: string,
): DatosEspecieProgresion {
	const datos = c[especie];
	if (datos === undefined) {
		throw new RangeError(
			`${quien}(): la especie '${especie}' no está en el catálogo de progresión`,
		);
	}
	return datos;
}

/**
 * Nivel con el que sale a la expedición una especie en el gimnasio indicado:
 * `nivelInicial(nivelGimnasio, nivelEtapa)`.
 *
 * @throws {RangeError} Si la especie no está en el catálogo o si
 * `nivelInicial` rechaza el nivel de gimnasio.
 */
export function nivelDeSalida(
	nivelGimnasio: number,
	especie: string,
	c: CatalogoProgresion,
): number {
	const datos = datosDe(especie, c, "nivelDeSalida");
	return nivelInicial(nivelGimnasio, datos.nivelEtapa);
}

/**
 * Miembro de expedición que corresponde a un residente: a plena salud y con el
 * nivel de salida de su especie. Si el residente no tiene movimientos propios,
 * usa los iniciales de su nivel (con el poder del catálogo, si lo trae); sus
 * `recordables` y su amistad pasan tal cual.
 *
 * No muta el residente ni el catálogo.
 *
 * @throws {RangeError} Si la especie no está en el catálogo.
 */
export function miembroDeResidente(
	r: Residente,
	nivelGimnasio: number,
	c: CatalogoProgresion,
): MiembroExp {
	const datos = datosDe(r.especie, c, "miembroDeResidente");
	const nivel = nivelInicial(nivelGimnasio, datos.nivelEtapa);
	return {
		uid: r.uid,
		especie: r.especie,
		psPct: 100,
		nivel,
		movimientos:
			r.movimientos === undefined
				? movimientosIniciales(datos.aprendizaje, nivel, datos.poder)
				: r.movimientos.slice(0, MAX_MOVIMIENTOS),
		recordables: [...(r.recordables ?? [])],
		amistad: r.amistad,
	};
}

/**
 * Vuelta de la expedición al Santuario: el residente conserva los movimientos y
 * recordables del miembro (si los trae) y, si evolucionó, cambia de especie con
 * los tipos, trabajos preferidos y Especialidades de la nueva especie. Sus
 * Especialidades nunca se pierden: las que ya tenía conservan su nivel y las
 * nuevas entran a nivel 1.
 *
 * El nivel de la expedición no se copia (GDD §6.10): el residente mantiene su
 * nivel, salvo que evolucione a una especie con `nivelEtapa` mayor, en cuyo caso
 * pasa al `nivelInicial` de la nueva etapa para `nivelGimnasio`. Los
 * `pendientesMovimiento` sin resolver se descartan. `estado`, `tarea` y los
 * demás campos no se tocan.
 *
 * No muta el residente ni el miembro.
 *
 * @throws {RangeError} Si el miembro evolucionó a una especie que no está en el
 * catálogo.
 */
export function aplicarRetorno(
	r: Residente,
	m: MiembroExp,
	c: CatalogoProgresion,
	nivelGimnasio: number,
): Residente {
	const movimientos =
		m.movimientos === undefined ? r.movimientos : [...m.movimientos];
	const recordables =
		m.recordables === undefined ? r.recordables : [...m.recordables];

	if (m.especie === r.especie) {
		return { ...r, movimientos, recordables };
	}

	const datos = datosDe(m.especie, c, "aplicarRetorno");
	const especialidades: Record<string, number> = { ...r.especialidades };
	for (const especialidad of datos.especialidades) {
		if (!(especialidad in especialidades)) especialidades[especialidad] = 1;
	}
	const etapaVieja = c[r.especie]?.nivelEtapa ?? 0;
	const nivel =
		datos.nivelEtapa > etapaVieja
			? nivelInicial(nivelGimnasio, datos.nivelEtapa)
			: r.nivel;
	return {
		...r,
		especie: m.especie,
		nivel,
		tipos: [...datos.tipos],
		preferidos: [...datos.preferidos],
		especialidades,
		movimientos,
		recordables,
	};
}

/**
 * Miembro para un Pokémon capturado durante la expedición: nivel indicado,
 * movimientos iniciales de ese nivel (con el poder del catálogo, si lo trae) y
 * sin `uid` (todavía no es residente).
 *
 * @throws {RangeError} Si la especie no está en el catálogo o si el nivel no es
 * un entero >= 1.
 */
export function miembroNuevoDeCaptura(
	especie: string,
	psPct: number,
	nivel: number,
	c: CatalogoProgresion,
): MiembroExp {
	const datos = datosDe(especie, c, "miembroNuevoDeCaptura");
	return {
		especie,
		psPct,
		nivel,
		movimientos: movimientosIniciales(datos.aprendizaje, nivel, datos.poder),
	};
}

/**
 * Movimientos y recordables que hereda el residente creado a partir de un
 * miembro capturado. Devuelve copias; si el miembro no los trae, listas vacías.
 */
export function aplicarRetornoACapturado(
	m: MiembroExp,
): Pick<Residente, "movimientos" | "recordables"> {
	return {
		movimientos: [...(m.movimientos ?? [])],
		recordables: [...(m.recordables ?? [])],
	};
}
