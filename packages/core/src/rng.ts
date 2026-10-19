/** Generador de números pseudoaleatorios con semilla y estado serializable. */
export interface Rng {
	/** Siguiente número en [0, 1). */
	siguiente(): number;
	/** Entero uniforme en [min, max], ambos inclusivos. Lanza `RangeError` si no son enteros o min > max. */
	entero(min: number, max: number): number;
	/** Estado interno (uint32); pásalo como `estadoInicial` para reanudar la secuencia. */
	estado(): number;
}

/** Hash FNV-1a de 32 bits sobre los bytes UTF-8 de la cadena. */
function hashUtf8(texto: string): number {
	let h = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(texto)) {
		h = Math.imul(h ^ byte, 0x01000193);
	}
	return h >>> 0;
}

/**
 * Crea un generador mulberry32 sembrado con `semilla`.
 *
 * Una semilla numérica se convierte a cadena (`String(n)`), así `1` y `"1"`
 * dan la misma secuencia; toda semilla pasa por el mismo hash UTF-8.
 *
 * @param semilla Cadena (cualquier Unicode, incluso vacía) o número.
 * @param estadoInicial Estado devuelto antes por `estado()`; si se da, ignora la semilla. Lanza `RangeError` si no es un entero uint32.
 */
export function crearRng(
	semilla: string | number,
	estadoInicial?: number,
): Rng {
	if (
		estadoInicial !== undefined &&
		!(
			Number.isInteger(estadoInicial) &&
			estadoInicial >= 0 &&
			estadoInicial < 2 ** 32
		)
	) {
		throw new RangeError(
			`crearRng: estadoInicial debe ser un entero uint32, recibió ${estadoInicial}`,
		);
	}
	let a = (estadoInicial ?? hashUtf8(String(semilla))) >>> 0;
	const siguiente = (): number => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {
		siguiente,
		entero(min, max) {
			if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
				throw new RangeError(
					`entero(${min}, ${max}): se requieren enteros con min <= max`,
				);
			}
			return min + Math.floor(siguiente() * (max - min + 1));
		},
		estado: () => a,
	};
}
