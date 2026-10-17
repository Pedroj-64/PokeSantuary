import { crearRng } from "./rng.js";

/** Datos de un intento de captura. */
export interface DatosCaptura {
	/** PS del objetivo en porcentaje, entero de 0 a 100. */
	psPct: number;
	/** Tasa base de la especie, entero de 0 a 255. */
	tasaBase: number;
	/** Multiplicador de la bola usada, mayor que 0. */
	multBola: number;
}

const PS_MAX = 100;
const TASA_MAX = 255;

/** Valida los datos de captura. */
function validar(d: DatosCaptura, quien: string): void {
	if (d === null || typeof d !== "object") {
		throw new RangeError(`${quien}(): se esperaban datos de captura`);
	}
	if (!Number.isInteger(d.psPct) || d.psPct < 0 || d.psPct > PS_MAX) {
		throw new RangeError(
			`${quien}(): 'psPct' debe ser un entero entre 0 y ${PS_MAX} (recibido ${String(d.psPct)})`,
		);
	}
	if (
		!Number.isInteger(d.tasaBase) ||
		d.tasaBase < 0 ||
		d.tasaBase > TASA_MAX
	) {
		throw new RangeError(
			`${quien}(): 'tasaBase' debe ser un entero entre 0 y ${TASA_MAX} (recibido ${String(d.tasaBase)})`,
		);
	}
	if (!Number.isFinite(d.multBola) || d.multBola <= 0) {
		throw new RangeError(
			`${quien}(): 'multBola' debe ser un número mayor que 0 (recibido ${String(d.multBola)})`,
		);
	}
}

/**
 * Probabilidad de captura en [0, 1]: cuantos menos PS le queden al objetivo,
 * más fácil es.
 *
 * `probCaptura = min(1, (((3 - 2 * psPct/100) / 3) * tasaBase * multBola) / 255)`
 *
 * @throws {RangeError} Si `psPct` no está entre 0 y 100, si `tasaBase` no está
 * entre 0 y 255 o si `multBola` no es mayor que 0.
 */
export function probCaptura(d: DatosCaptura): number {
	validar(d, "probCaptura");
	const factor = (3 - (2 * d.psPct) / PS_MAX) / 3;
	return Math.min(1, (factor * d.tasaBase * d.multBola) / TASA_MAX);
}

/**
 * Resuelve un intento de captura: `true` si sale bien. El azar sale de
 * `crearRng(\`${semilla}:captura:${intento}\`)`, así que es determinista.
 *
 * @throws {RangeError} Si el intento no es un entero mayor o igual que 0 o si
 * los datos de captura son inválidos.
 */
export function intentarCaptura(
	semilla: string,
	intento: number,
	d: DatosCaptura,
): boolean {
	if (!Number.isInteger(intento) || intento < 0) {
		throw new RangeError(
			`intentarCaptura(): 'intento' debe ser un entero mayor o igual que 0 (recibido ${String(intento)})`,
		);
	}
	const p = probCaptura(d);
	return crearRng(`${semilla}:captura:${intento}`).siguiente() < p;
}
