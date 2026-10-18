import {
	type Cancion,
	CancionSchema,
	type Efecto,
	EfectoSchema,
	type EnvolventeHardware,
	type Golpe,
	type Nota,
	type Pista,
	type VibratoCancion,
} from "./modelo.js";

/** Tasa de muestreo por defecto, en Hz. */
export const TASA_POR_DEFECTO = 44100;

// Pasos del LFSR por ciclo de la nota. El canal de ruido del hardware también
// se acelera con la altura; con esta escala, una nota de 440 Hz a 14080 Hz de
// tasa avanza exactamente un paso del registro por muestra.
const PASOS_RUIDO_POR_CICLO = 32;

// Caída lineal al final de cada nota, para que el corte no chasquee.
const CAIDA_MS = 2;

// Ganancia fija por pista antes del limitador. Con cuatro pistas a tope la
// suma llega a 1 y el limitador la deja por debajo sin recortar en seco.
const GANANCIA_PISTA = 0.25;

// Pasos de la envolvente de volumen del hardware por segundo.
const TICKS_ENVOLVENTE_POR_SEGUNDO = 64;

// El arpegio recorre sus notas 60 veces por segundo.
const PASOS_ARPEGIO_POR_SEGUNDO = 60;

const DOS_PI = Math.PI * 2;

/**
 * Ley de potencia constante con el centro normalizado: en el centro (`pan` 0)
 * cada canal recibe ganancia 1 y en un extremo, √2. Así la suma de potencias
 * `izq² + der²` es siempre 2 y el mono `(izq + der) / 2` coincide con la señal
 * centrada sin atenuarla.
 */
const GANANCIA_PAN = Math.SQRT2;

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

/**
 * Parámetros de un golpe de percusión. La frecuencia es la que se usaría en
 * una nota del canal de ruido y desciende de forma exponencial hasta la final
 * durante la caída; `caidaMs` marca el decaimiento lineal del volumen.
 */
export interface PresetGolpe {
	corto: boolean;
	frecuenciaInicial: number;
	frecuenciaFinal: number;
	caidaMs: number;
}

/**
 * Presets de percusión del canal de ruido. Son valores de partida, no una
 * emulación exacta del hardware: bombo grave y redondo, caja con cuerpo,
 * charles muy corto y agudo, charles abierto con más cola y platillo largo.
 */
export const PRESETS_GOLPE: Record<Golpe, PresetGolpe> = {
	bombo: {
		corto: false,
		frecuenciaInicial: 420,
		frecuenciaFinal: 45,
		caidaMs: 120,
	},
	caja: {
		corto: false,
		frecuenciaInicial: 2400,
		frecuenciaFinal: 600,
		caidaMs: 90,
	},
	charles: {
		corto: true,
		frecuenciaInicial: 7600,
		frecuenciaFinal: 5200,
		caidaMs: 30,
	},
	charlesAbierto: {
		corto: true,
		frecuenciaInicial: 7600,
		frecuenciaFinal: 5200,
		caidaMs: 160,
	},
	platillo: {
		corto: false,
		frecuenciaInicial: 8200,
		frecuenciaFinal: 6100,
		caidaMs: 350,
	},
};

/**
 * Nivel de la envolvente del hardware en una muestra (de 0 a 1): empieza en
 * `inicio / 15` y cambia una unidad cada `|paso| / 64` s, sin pasar de 0 ni
 * de 15. Con `paso: 0` se queda en `inicio / 15`; sin envolvente, en 1.
 */
function nivelEnvolvente(
	envolvente: EnvolventeHardware,
	posicion: number,
	tasa: number,
): number {
	if (envolvente.paso === 0) return envolvente.inicio / 15;
	const tramo =
		(posicion * TICKS_ENVOLVENTE_POR_SEGUNDO) /
		(tasa * Math.abs(envolvente.paso));
	const nivel =
		envolvente.inicio + Math.sign(envolvente.paso) * Math.floor(tramo);
	return Math.max(0, Math.min(15, nivel)) / 15;
}

/** Caída lineal de `caida` muestras al final de la nota. */
function caidaNota(posicion: number, largo: number, caida: number): number {
	if (largo <= 1 || posicion < largo - caida) return 1;
	// La última muestra vale 0 y la primera de la caída, casi 1.
	return Math.max(0, (largo - posicion - 1) / caida);
}

/**
 * Semitonos que se suman a la altura de una nota en una muestra: deslizamiento
 * lineal durante la nota, arpegio a 60 Hz y vibrato con retardo.
 */
function modulacion(
	nota: Nota,
	vibrato: VibratoCancion | undefined,
	posicion: number,
	largo: number,
	tasa: number,
): number {
	let semitonos = 0;
	if (nota.desliz !== undefined && nota.desliz !== 0) {
		semitonos += nota.desliz * (posicion / Math.max(1, largo));
	}
	const arp = nota.arp;
	if (arp !== undefined && arp.length > 0) {
		const indice =
			Math.floor((posicion * PASOS_ARPEGIO_POR_SEGUNDO) / tasa) %
			(arp.length + 1);
		if (indice > 0) semitonos += arp[indice - 1] ?? 0;
	}
	if (vibrato !== undefined && vibrato.profundidad > 0) {
		const segundos = posicion / tasa;
		const retardo = vibrato.retardoMs / 1000;
		if (segundos >= retardo) {
			semitonos +=
				vibrato.profundidad *
				Math.sin(DOS_PI * vibrato.hz * (segundos - retardo));
		}
	}
	return semitonos;
}

/**
 * Sintetiza una pista en mono, sin panorama ni eco. Cada nota se escribe con
 * `+=` para que un swing pronunciado no borre el ataque vecino.
 */
function renderizarPistaMono(
	pista: Pista,
	muestrasPorPaso: number,
	total: number,
	tasa: number,
	swing: number,
): Float32Array {
	const senal = new Float32Array(total);
	const caida = Math.max(2, Math.round((tasa * CAIDA_MS) / 1000));
	const cicloPista = pista.ciclo ?? 50;
	const tabla = pista.onda ?? [];
	const volumenPista = (pista.volumen ?? 15) / 15;
	for (const nota of pista.notas) {
		const retraso = swing > 0 && nota.t % 2 === 1 ? swing * muestrasPorPaso : 0;
		const inicio = Math.round(nota.t * muestrasPorPaso + retraso);
		const fin = Math.min(
			total,
			Math.round((nota.t + nota.d) * muestrasPorPaso + retraso),
		);
		const largo = fin - inicio;
		if (largo <= 0 || inicio >= total) continue;
		const volumen = (nota.v / 15) * volumenPista;
		const golpe = pista.canal === "ruido" ? nota.golpe : undefined;
		if (golpe !== undefined) {
			const preset = PRESETS_GOLPE[golpe];
			const caidaPreset = Math.max(
				1,
				Math.round((preset.caidaMs * tasa) / 1000),
			);
			const proporcion = preset.frecuenciaFinal / preset.frecuenciaInicial;
			const ruido = crearRuido(preset.corto);
			let valorRuido = ruido();
			let relojRuido = 0;
			for (let posicion = 0; posicion < largo; posicion++) {
				const avance = Math.min(1, posicion / caidaPreset);
				const freq = preset.frecuenciaInicial * proporcion ** avance;
				relojRuido += (freq * PASOS_RUIDO_POR_CICLO) / tasa;
				while (relojRuido >= 1) {
					valorRuido = ruido();
					relojRuido -= 1;
				}
				// El preset fija su propia caída; la de la nota evita el chasquido.
				const amp = volumen * (1 - avance) * caidaNota(posicion, largo, caida);
				senal[inicio + posicion] =
					(senal[inicio + posicion] ?? 0) + valorRuido * amp;
			}
			continue;
		}
		const envolvente = nota.env ?? pista.envolvente;
		const ciclo = nota.ciclo ?? cicloPista;
		const usaRuido = pista.canal === "ruido";
		const ruido = usaRuido ? crearRuido(pista.ruidoCorto === true) : null;
		const base = frecuencia(nota.n);
		let valorRuido = ruido?.() ?? 1;
		let relojRuido = 0;
		let fase = 0;
		for (let posicion = 0; posicion < largo; posicion++) {
			const semitonos = modulacion(nota, pista.vibrato, posicion, largo, tasa);
			const freq = base * 2 ** (semitonos / 12);
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
				valor = pista.canal === "onda" ? onda(fase, tabla) : pulso(fase, ciclo);
			}
			const amp =
				volumen *
				(envolvente === undefined
					? 1
					: nivelEnvolvente(envolvente, posicion, tasa)) *
				caidaNota(posicion, largo, caida);
			senal[inicio + posicion] = (senal[inicio + posicion] ?? 0) + valor * amp;
		}
	}
	return senal;
}

/**
 * Eco de un solo retardo con realimentación: `y[i] = x[i] + mezcla * y[i-D]`.
 * Como `mezcla <= 0.6`, la cola se apaga sola y la ganancia total está
 * acotada (≈ 1 / (1 - mezcla)).
 */
function aplicarEco(
	senal: Float32Array,
	retardoMs: number,
	mezcla: number,
	tasa: number,
): void {
	if (mezcla <= 0) return;
	const retardo = Math.max(1, Math.round((retardoMs * tasa) / 1000));
	for (let i = retardo; i < senal.length; i++) {
		senal[i] = (senal[i] ?? 0) + mezcla * (senal[i - retardo] ?? 0);
	}
}

/** Convierte ambos canales a [-1, 1] con un limitador suave `tanh`. */
function limitar(canal: Float32Array): void {
	for (let i = 0; i < canal.length; i++) {
		canal[i] = Math.tanh(canal[i] ?? 0);
	}
}

/**
 * Renderiza una vuelta de la canción en estéreo.
 *
 * Cada pista se sintetiza en mono, se le aplica el eco y se reparte con ley de
 * potencia constante (ver `GANANCIA_PAN`), con una ganancia fija de 0.25 por
 * pista. La suma de los canales pasa por `tanh`, así que el resultado queda
 * siempre dentro de (-1, 1) y las señales flojas se mantienen casi lineales.
 * El `swing` retrasa la nota entera (inicio y fin) de los pasos impares.
 *
 * @throws {RangeError} Si la tasa no es un entero entre 8000 y 96000.
 * @throws {ZodError} Si la canción no cumple el esquema.
 */
export function renderizarCancionEstereo(
	cancion: Cancion,
	tasa = TASA_POR_DEFECTO,
): { izq: Float32Array; der: Float32Array } {
	validarTasa(tasa);
	const c = CancionSchema.parse(cancion);
	const muestrasPorPaso = (tasa * 60) / (c.bpm * c.pasosPorNegra);
	const total = Math.round(c.pasos * muestrasPorPaso);
	const izq = new Float32Array(total);
	const der = new Float32Array(total);
	const swing = c.swing ?? 0;
	for (const pista of c.pistas) {
		const senal = renderizarPistaMono(
			pista,
			muestrasPorPaso,
			total,
			tasa,
			swing,
		);
		if (pista.eco !== undefined) {
			aplicarEco(senal, pista.eco.retardoMs, pista.eco.mezcla, tasa);
		}
		const angulo = (((pista.pan ?? 0) + 1) * Math.PI) / 4;
		// En los extremos el coseno deja un residuo de 1e-17; se anula para que
		// el canal contrario quede en silencio exacto.
		const coseno = Math.cos(angulo);
		const seno = Math.sin(angulo);
		const gananciaIzq = coseno < 1e-12 ? 0 : GANANCIA_PAN * coseno;
		const gananciaDer = seno < 1e-12 ? 0 : GANANCIA_PAN * seno;
		for (let i = 0; i < total; i++) {
			const valor = (senal[i] ?? 0) * GANANCIA_PISTA;
			izq[i] = (izq[i] ?? 0) + valor * gananciaIzq;
			der[i] = (der[i] ?? 0) + valor * gananciaDer;
		}
	}
	limitar(izq);
	limitar(der);
	return { izq, der };
}

/**
 * Renderiza una vuelta de la canción en mono, normalizada a (-1, 1).
 *
 * La duración sale de `pasos * 60 / (bpm * pasosPorNegra)`; el inicio de cada
 * paso se redondea a muestra entera para no acumular deriva. El mono es
 * exactamente `(izq + der) / 2` del render estéreo: con todo el panorama al
 * centro ambos canales son iguales y esta suma coincide con la señal centrada.
 *
 * @throws {RangeError} Si la tasa no es un entero entre 8000 y 96000.
 * @throws {ZodError} Si la canción no cumple el esquema.
 */
export function renderizarCancion(
	cancion: Cancion,
	tasa = TASA_POR_DEFECTO,
): Float32Array {
	const { izq, der } = renderizarCancionEstereo(cancion, tasa);
	const mono = new Float32Array(izq.length);
	for (let i = 0; i < mono.length; i++) {
		mono[i] = ((izq[i] ?? 0) + (der[i] ?? 0)) / 2;
	}
	return mono;
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
 * Sintetiza la señal base de un efecto (sin sus capas), en mono y sin
 * limitar. La frecuencia instantánea es `frecInicial * 2^((deslizamiento * t +
 * vibrato) / 12)` y se integra en la fase muestra a muestra.
 */
function sintetizarEfecto(efecto: Efecto, tasa: number): Float32Array {
	const total = Math.round((efecto.duracionMs * tasa) / 1000);
	const muestras = new Float32Array(total);
	const ataqueMs = Math.min(efecto.envolvente.ataqueMs, efecto.duracionMs);
	const decaimientoMs = efecto.envolvente.decaimientoMs;
	const ciclo = efecto.ciclo ?? 50;
	const ruido = efecto.canal === "ruido" ? crearRuido(false) : null;
	let valorRuido = ruido?.() ?? 1;
	let relojRuido = 0;
	let fase = 0;
	for (let i = 0; i < total; i++) {
		const t = i / tasa;
		const vibrato = efecto.vibrato
			? efecto.vibrato.profundidad * Math.sin(DOS_PI * efecto.vibrato.hz * t)
			: 0;
		const freq =
			efecto.frecInicial * 2 ** ((efecto.deslizamiento * t + vibrato) / 12);
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
			efecto.duracionMs,
		);
		muestras[i] = valor * (efecto.volumen / 15) * amp;
	}
	return muestras;
}

/**
 * Renderiza un efecto corto, en mono y normalizado a (-1, 1).
 *
 * Las capas se suman con su retardo y todo pasa por el mismo limitador `tanh`,
 * de modo que un golpe con cuerpo y chasquido no satura. La duración del
 * resultado es la mayor entre el efecto base y el final de cada capa.
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
	const base = sintetizarEfecto(e, tasa);
	const capas = (e.capas ?? []).map((capa) => ({
		desde: Math.round((capa.desdeMs * tasa) / 1000),
		senal: sintetizarEfecto(capa.efecto, tasa),
	}));
	let total = base.length;
	for (const capa of capas) {
		total = Math.max(total, capa.desde + capa.senal.length);
	}
	const mezcla = new Float32Array(total);
	for (let i = 0; i < base.length; i++) {
		mezcla[i] = base[i] ?? 0;
	}
	for (const capa of capas) {
		for (let i = 0; i < capa.senal.length; i++) {
			const destino = capa.desde + i;
			if (destino >= total) break;
			mezcla[destino] = (mezcla[destino] ?? 0) + (capa.senal[i] ?? 0);
		}
	}
	limitar(mezcla);
	return mezcla;
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

/** Cabecera RIFF/WAVE PCM de 16 bits con 1 o 2 canales. */
function cabeceraWav(
	muestras: number,
	canales: 1 | 2,
	tasa: number,
): { bytes: Uint8Array; vista: DataView } {
	const datos = muestras * canales * 2;
	const bytes = new Uint8Array(44 + datos);
	const vista = new DataView(bytes.buffer);
	escribirAscii(bytes, 0, "RIFF");
	vista.setUint32(4, 36 + datos, true);
	escribirAscii(bytes, 8, "WAVE");
	escribirAscii(bytes, 12, "fmt ");
	vista.setUint32(16, 16, true);
	vista.setUint16(20, 1, true); // PCM
	vista.setUint16(22, canales, true);
	vista.setUint32(24, tasa, true);
	vista.setUint32(28, tasa * canales * 2, true);
	vista.setUint16(32, canales * 2, true); // bytes por muestra
	vista.setUint16(34, 16, true);
	escribirAscii(bytes, 36, "data");
	vista.setUint32(40, datos, true);
	return { bytes, vista };
}

const entero16 = (valor: number): number =>
	Math.round(Math.max(-1, Math.min(1, valor)) * 32767);

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
	const { bytes, vista } = cabeceraWav(muestras.length, 1, tasa);
	for (let i = 0; i < muestras.length; i++) {
		vista.setInt16(44 + i * 2, entero16(muestras[i] ?? 0), true);
	}
	return bytes;
}

/**
 * Convierte dos canales a WAV PCM 16 bits estéreo entrelazado.
 *
 * @throws {RangeError} Si la tasa no es un entero entre 8000 y 96000.
 * @throws {RangeError} Si los canales tienen distinta longitud.
 */
export function aWavEstereo(
	izq: Float32Array,
	der: Float32Array,
	tasa = TASA_POR_DEFECTO,
): Uint8Array {
	validarTasa(tasa);
	if (izq.length !== der.length) {
		throw new RangeError(
			`aWavEstereo(): los canales deben medir lo mismo (${izq.length} y ${der.length})`,
		);
	}
	const { bytes, vista } = cabeceraWav(izq.length, 2, tasa);
	for (let i = 0; i < izq.length; i++) {
		vista.setInt16(44 + i * 4, entero16(izq[i] ?? 0), true);
		vista.setInt16(46 + i * 4, entero16(der[i] ?? 0), true);
	}
	return bytes;
}
