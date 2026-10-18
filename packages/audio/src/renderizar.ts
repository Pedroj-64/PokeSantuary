import {
	type Cancion,
	CancionSchema,
	type Efecto,
	EfectoSchema,
	type Pista,
} from "./modelo.js";

/** Tasa de muestreo por defecto, en Hz. */
export const TASA_POR_DEFECTO = 44100;

// Pasos del LFSR por ciclo de la nota. El canal de ruido del hardware también
// se acelera con la altura; con esta escala, una nota de 440 Hz a 14080 Hz de
// tasa avanza exactamente un paso del registro por muestra.
const PASOS_RUIDO_POR_CICLO = 32;

// Caída lineal al final de cada nota, para que el corte no chasquee.
const CAIDA_MS = 2;

const DOS_PI = Math.PI * 2;

/** Frecuencia en Hz de una nota MIDI. */
const frecuencia = (nota: number) => 440 * 2 ** ((nota - 69) / 12);

/**
 * Registro de desplazamiento con realimentación lineal, como el del Game Boy:
 * 15 bits (7 con `corto`) y tomas en los bits 0 y 1. Recorre 2^bits - 1 estados
 * antes de repetirse; cada llamada devuelve ±1.
 */
export function crearRuido(corto: boolean): () => number {
	const bits = corto ? 7 : 15;
	let registro = (1 << bits) - 1;
	return () => {
		const bit = (registro ^ (registro >> 1)) & 1;
		registro = (registro >> 1) | (bit << (bits - 1));
		return registro & 1 ? 1 : -1;
	};
}

function validarTasa(tasa: number): void {
	if (!Number.isInteger(tasa) || tasa < 8000 || tasa > 96000) {
		throw new RangeError(
			`renderizar(): la tasa debe ser un entero entre 8000 y 96000 (recibida ${tasa})`,
		);
	}
}

/** Onda de pulso: +1 durante el ciclo de trabajo y -1 el resto. */
function pulso(fase: number, ciclo: number): number {
	return fase < ciclo / 100 ? 1 : -1;
}

/** Tabla de onda de 32 muestras de 0 a 15, al vecino más próximo. */
function onda(fase: number, tabla: readonly number[]): number {
	const posicion = Math.min(31, Math.floor(fase * 32));
	const muestra = tabla[posicion] ?? 0;
	return (muestra / 15) * 2 - 1;
}

/** Envolvente de una nota: caída lineal de `CAIDA_MS` al final. */
function envolventeNota(
	posicion: number,
	largo: number,
	caida: number,
): number {
	if (largo <= 1 || posicion < largo - caida) return 1;
	// La última muestra vale 0 y la primera de la caída, casi 1.
	return Math.max(0, (largo - posicion - 1) / caida);
}

function renderizarPista(
	pista: Pista,
	muestrasPorPaso: number,
	total: number,
	tasa: number,
): Float32Array {
	const senal = new Float32Array(total);
	const caida = Math.max(2, Math.round((tasa * CAIDA_MS) / 1000));
	const ciclo = pista.ciclo ?? 50;
	const tabla = pista.onda ?? [];
	for (const nota of pista.notas) {
		const inicio = Math.round(nota.t * muestrasPorPaso);
		const fin = Math.min(
			total,
			Math.round((nota.t + nota.d) * muestrasPorPaso),
		);
		const largo = fin - inicio;
		if (largo <= 0) continue;
		const volumen = nota.v / 15;
		const freq = frecuencia(nota.n);
		const ruido =
			pista.canal === "ruido" ? crearRuido(pista.ruidoCorto === true) : null;
		const pasoRuido = (freq * PASOS_RUIDO_POR_CICLO) / tasa;
		let fase = 0;
		let relojRuido = 0;
		let valorRuido = ruido?.() ?? 1;
		for (let posicion = 0; posicion < largo; posicion++) {
			let valor: number;
			if (ruido) {
				relojRuido += pasoRuido;
				while (relojRuido >= 1) {
					valorRuido = ruido();
					relojRuido -= 1;
				}
				valor = valorRuido;
			} else {
				fase = (fase + freq / tasa) % 1;
				valor = pista.canal === "onda" ? onda(fase, tabla) : pulso(fase, ciclo);
			}
			const amp = envolventeNota(posicion, largo, caida);
			senal[inicio + posicion] = valor * volumen * amp;
		}
	}
	return senal;
}

/**
 * Renderiza una vuelta de la canción, en mono y normalizado a [-1, 1].
 *
 * La duración sale de `pasos * 60 / (bpm * pasosPorNegra)`; el inicio de cada
 * paso se redondea a muestra entera para no acumular deriva. Cada pista se
 * divide por el número de pistas con notas, y la suma se recorta a [-1, 1].
 *
 * @throws {RangeError} Si la tasa no es un entero entre 8000 y 96000.
 * @throws {ZodError} Si la canción no cumple el esquema.
 */
export function renderizarCancion(
	cancion: Cancion,
	tasa = TASA_POR_DEFECTO,
): Float32Array {
	validarTasa(tasa);
	const c = CancionSchema.parse(cancion);
	const muestrasPorPaso = (tasa * 60) / (c.bpm * c.pasosPorNegra);
	const total = Math.round(c.pasos * muestrasPorPaso);
	const mezcla = new Float32Array(total);
	for (const pista of c.pistas) {
		const senal = renderizarPista(pista, muestrasPorPaso, total, tasa);
		for (let i = 0; i < total; i++)
			mezcla[i] = (mezcla[i] ?? 0) + (senal[i] ?? 0);
	}
	const activas = c.pistas.filter((p) => p.notas.length > 0).length;
	const divisor = Math.max(1, activas);
	for (let i = 0; i < total; i++) {
		mezcla[i] = Math.max(-1, Math.min(1, (mezcla[i] ?? 0) / divisor));
	}
	return mezcla;
}

/** Envolvente de un efecto: ataque lineal y luego decaimiento lineal. */
function envolventeEfecto(
	ms: number,
	ataqueMs: number,
	decaimientoMs: number,
	duracionMs: number,
): number {
	if (ataqueMs > 0 && ms < ataqueMs) return ms / ataqueMs;
	const desde = ms - ataqueMs;
	const largo = Math.max(1, Math.min(decaimientoMs, duracionMs - ataqueMs));
	if (decaimientoMs <= 0) return 1;
	return Math.max(0, 1 - desde / largo);
}

/**
 * Renderiza un efecto corto, en mono y normalizado a [-1, 1].
 *
 * La frecuencia instantánea es `frecInicial * 2^((deslizamiento * t +
 * vibrato) / 12)` y se integra en la fase muestra a muestra.
 *
 * @throws {RangeError} Si la tasa no es un entero entre 8000 y 96000.
 * @throws {ZodError} Si el efecto no cumple el esquema.
 */
export function renderizarEfecto(
	efecto: Efecto,
	tasa = TASA_POR_DEFECTO,
): Float32Array {
	validarTasa(tasa);
	const e = EfectoSchema.parse(efecto);
	const total = Math.round((e.duracionMs * tasa) / 1000);
	const muestras = new Float32Array(total);
	const ataqueMs = Math.min(e.envolvente.ataqueMs, e.duracionMs);
	const decaimientoMs = e.envolvente.decaimientoMs;
	const ciclo = e.ciclo ?? 50;
	const ruido = e.canal === "ruido" ? crearRuido(false) : null;
	let valorRuido = ruido?.() ?? 1;
	let relojRuido = 0;
	let fase = 0;
	for (let i = 0; i < total; i++) {
		const t = i / tasa;
		const vibrato = e.vibrato
			? e.vibrato.profundidad * Math.sin(DOS_PI * e.vibrato.hz * t)
			: 0;
		const freq = e.frecInicial * 2 ** ((e.deslizamiento * t + vibrato) / 12);
		let valor: number;
		if (ruido) {
			relojRuido += (freq * PASOS_RUIDO_POR_CICLO) / tasa;
			while (relojRuido >= 1) {
				valorRuido = ruido();
				relojRuido -= 1;
			}
			valor = valorRuido;
		} else {
			fase = (fase + freq / tasa) % 1;
			valor = pulso(fase, ciclo);
		}
		const amp = envolventeEfecto(
			t * 1000,
			ataqueMs,
			decaimientoMs,
			e.duracionMs,
		);
		muestras[i] = valor * (e.volumen / 15) * amp;
	}
	return muestras;
}

/** Escribe texto ASCII en una posición del búfer. */
function escribirAscii(
	destino: Uint8Array,
	offset: number,
	texto: string,
): void {
	for (let i = 0; i < texto.length; i++) {
		destino[offset + i] = texto.charCodeAt(i);
	}
}

/**
 * Convierte muestras a WAV PCM 16 bits mono con cabecera RIFF de 44 bytes.
 *
 * @throws {RangeError} Si la tasa no es un entero entre 8000 y 96000.
 */
export function aWav(
	muestras: Float32Array,
	tasa = TASA_POR_DEFECTO,
): Uint8Array {
	validarTasa(tasa);
	const datos = muestras.length * 2;
	const bytes = new Uint8Array(44 + datos);
	const vista = new DataView(bytes.buffer);
	escribirAscii(bytes, 0, "RIFF");
	vista.setUint32(4, 36 + datos, true);
	escribirAscii(bytes, 8, "WAVE");
	escribirAscii(bytes, 12, "fmt ");
	vista.setUint32(16, 16, true);
	vista.setUint16(20, 1, true); // PCM
	vista.setUint16(22, 1, true); // mono
	vista.setUint32(24, tasa, true);
	vista.setUint32(28, tasa * 2, true);
	vista.setUint16(32, 2, true); // bytes por muestra
	vista.setUint16(34, 16, true);
	escribirAscii(bytes, 36, "data");
	vista.setUint32(40, datos, true);
	for (let i = 0; i < muestras.length; i++) {
		const valor = Math.max(-1, Math.min(1, muestras[i] ?? 0));
		vista.setInt16(44 + i * 2, Math.round(valor * 32767), true);
	}
	return bytes;
}
