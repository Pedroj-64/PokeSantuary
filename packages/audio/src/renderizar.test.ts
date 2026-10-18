import { describe, expect, it } from "vitest";
import type { Cancion, Efecto, Nota, Pista } from "./modelo.js";
import {
	aWav,
	renderizarCancion,
	renderizarEfecto,
	TASA_POR_DEFECTO,
} from "./renderizar.js";

const MIDI_LA4 = 69;
const TASA_RUIDO = 14080;

/** Canción de prueba de dos segundos (8 pasos a 120 bpm). */
function cancion(over: Partial<Cancion> = {}): Cancion {
	return {
		id: "prueba",
		nombre: "audio.prueba.nombre",
		bpm: 120,
		pasosPorNegra: 4,
		pasos: 8,
		repetir: false,
		pistas: [
			{
				canal: "pulso1",
				notas: [{ t: 0, d: 8, n: MIDI_LA4, v: 15 }],
			},
		],
		...over,
	};
}

const pista = (
	canal: Pista["canal"],
	notas: Nota[],
	extra: Partial<Pista> = {},
) => ({ canal, notas, ...extra }) as Pista;

/** Cuenta cambios de signo entre dos muestras; ignora los ceros. */
function cruces(muestras: Float32Array, desde: number, hasta: number): number {
	let total = 0;
	let anterior = 0;
	for (let i = desde; i < hasta; i++) {
		const valor = muestras[i] ?? 0;
		if (valor === 0) continue;
		if (anterior !== 0 && Math.sign(valor) !== Math.sign(anterior)) total++;
		anterior = valor;
	}
	return total;
}

const signo = (valor: number) => (valor > 0 ? 1 : -1);

const efectoBase = (over: Partial<Efecto> = {}): Efecto => ({
	id: "prueba",
	canal: "pulso1",
	duracionMs: 200,
	volumen: 15,
	frecInicial: 440,
	deslizamiento: 0,
	envolvente: { ataqueMs: 0, decaimientoMs: 0 },
	...over,
});

describe("renderizarCancion", () => {
	it("dura exactamente lo que marcan los pasos y el tempo", () => {
		// 8 pasos a 120 bpm con 4 pasos por negra: 5512,5 muestras por paso.
		expect(renderizarCancion(cancion()).length).toBe(44100);
		expect(
			renderizarCancion(
				cancion({
					pasos: 4,
					pistas: [pista("pulso1", [{ t: 0, d: 4, n: MIDI_LA4, v: 15 }])],
				}),
			).length,
		).toBe(22050);
		expect(renderizarCancion(cancion(), 8000).length).toBe(8000);
	});

	it("una pista sin notas deja silencio", () => {
		const muestras = renderizarCancion(
			cancion({ pistas: [pista("pulso1", [])] }),
		);
		expect(muestras.length).toBe(44100);
		expect(muestras.every((m) => m === 0)).toBe(true);
	});

	it("es determinista bit a bit, ruido incluido", () => {
		const nota = { t: 0, d: 8, n: MIDI_LA4, v: 15 };
		const c = cancion({
			pistas: [
				pista("pulso1", [nota]),
				pista("onda", [nota], {
					onda: Array.from({ length: 32 }, (_, i) => i % 16),
				}),
				pista("ruido", [{ t: 0, d: 8, n: 72, v: 8 }]),
			],
		});
		const a = renderizarCancion(c);
		const b = renderizarCancion(c);
		expect(Array.from(a)).toEqual(Array.from(b));
	});

	it("un pulso al 50 % reparte las muestras y suena a 440 Hz", () => {
		const muestras = renderizarCancion(cancion());
		const desde = 1000;
		const hasta = 21000;
		let positivas = 0;
		let negativas = 0;
		for (let i = desde; i < hasta; i++) {
			const valor = muestras[i] ?? 0;
			if (valor > 0) positivas++;
			if (valor < 0) negativas++;
		}
		expect(Math.abs(positivas - negativas)).toBeLessThan(
			(positivas + negativas) * 0.01,
		);
		const segundos = (hasta - desde) / TASA_POR_DEFECTO;
		const hz = cruces(muestras, desde, hasta) / (2 * segundos);
		expect(Math.abs(hz - 440)).toBeLessThan(440 * 0.01);
	});

	it("el volumen 15 llega a 1 y el 7 a 7/15", () => {
		const fuerte = renderizarCancion(cancion());
		const suave = renderizarCancion(
			cancion({
				pistas: [pista("pulso1", [{ t: 0, d: 8, n: MIDI_LA4, v: 7 }])],
			}),
		);
		const maximo = (m: Float32Array) =>
			m.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
		expect(maximo(fuerte)).toBeCloseTo(1, 5);
		expect(maximo(suave)).toBeCloseTo(7 / 15, 5);
	});

	it("la mezcla de cuatro pistas no se sale de [-1, 1]", () => {
		const nota = { t: 0, d: 8, n: MIDI_LA4, v: 15 };
		const muestras = renderizarCancion(
			cancion({
				pistas: [
					pista("pulso1", [nota]),
					pista("pulso2", [nota], { ciclo: 25 }),
					pista("onda", [nota], {
						onda: Array.from({ length: 32 }, () => 15),
					}),
					pista("ruido", [nota]),
				],
			}),
		);
		let pico = 0;
		let minimo = 0;
		for (const m of muestras) {
			pico = Math.max(pico, Math.abs(m));
			minimo = Math.min(minimo, m);
		}
		expect(minimo).toBeGreaterThanOrEqual(-1);
		expect(pico).toBeLessThanOrEqual(1);
		expect(pico).toBeGreaterThan(0.9);
	});

	it("la cola de una nota decae a 0 en los últimos 2 ms", () => {
		const muestras = renderizarCancion(
			cancion({
				pistas: [pista("pulso1", [{ t: 0, d: 4, n: MIDI_LA4, v: 15 }])],
			}),
		);
		const fin = 22050;
		const caida = Math.round((TASA_POR_DEFECTO * 2) / 1000);
		expect(muestras[fin - 1]).toBe(0);
		expect(muestras[fin - caida - 1]).toBeCloseTo(1, 5);
		let anterior = 1;
		for (let i = fin - caida; i < fin; i++) {
			const actual = Math.abs(muestras[i] ?? 0);
			expect(actual).toBeLessThanOrEqual(anterior + 1e-6);
			anterior = actual;
		}
		// Después del fin de la nota, silencio hasta el final de la canción.
		expect(muestras.slice(fin).every((m) => m === 0)).toBe(true);
	});

	it("el canal de onda recorre la tabla y respeta sus valores", () => {
		const tablaAlta = Array.from({ length: 32 }, () => 15);
		const tablaBaja = Array.from({ length: 32 }, () => 0);
		const alta = renderizarCancion(
			cancion({
				pistas: [
					pista("onda", [{ t: 0, d: 8, n: MIDI_LA4, v: 15 }], {
						onda: tablaAlta,
					}),
				],
			}),
		);
		const baja = renderizarCancion(
			cancion({
				pistas: [
					pista("onda", [{ t: 0, d: 8, n: MIDI_LA4, v: 15 }], {
						onda: tablaBaja,
					}),
				],
			}),
		);
		expect(alta[1000]).toBeCloseTo(1, 5);
		expect(baja[1000]).toBeCloseTo(-1, 5);
	});

	it("rechaza una tasa fuera de 8000..96000 y una canción inválida", () => {
		for (const tasa of [7999, 96001, 44100.5]) {
			expect(() => renderizarCancion(cancion(), tasa)).toThrow(RangeError);
		}
		expect(() => renderizarCancion(cancion({ bpm: 300 }))).toThrow();
	});
});

describe("renderizarEfecto", () => {
	it("respeta la duración en milisegundos", () => {
		expect(renderizarEfecto(efectoBase({ duracionMs: 200 })).length).toBe(8820);
		expect(renderizarEfecto(efectoBase({ duracionMs: 50 }), 8000).length).toBe(
			400,
		);
	});

	it("ruidoCorto se repite cada 127 pasos del registro y el largo no", () => {
		const ruido = (corto: boolean) =>
			renderizarCancion(
				cancion({
					pistas: [
						pista(
							"ruido",
							[{ t: 0, d: 8, n: MIDI_LA4, v: 15 }],
							corto ? { ruidoCorto: true } : {},
						),
					],
				}),
				TASA_RUIDO,
			);
		// A 440 Hz y 14080 Hz de tasa el LFSR avanza un paso por muestra.
		const corto = ruido(true);
		for (let i = 0; i < 1000; i++) {
			expect(signo(corto[i] ?? 0)).toBe(signo(corto[i + 127] ?? 0));
		}
		const largo = ruido(false);
		let diferencias = 0;
		for (let i = 0; i < 1000; i++) {
			if (signo(corto[i] ?? 0) !== signo(largo[i] ?? 0)) diferencias++;
		}
		expect(diferencias).toBeGreaterThan(100);
	});

	it("un deslizamiento negativo baja la frecuencia", () => {
		const muestras = renderizarEfecto(
			efectoBase({
				duracionMs: 600,
				frecInicial: 1200,
				deslizamiento: -60,
			}),
		);
		const ventana = Math.round((TASA_POR_DEFECTO * 50) / 1000);
		const principio = cruces(muestras, 0, ventana);
		const final = cruces(muestras, muestras.length - ventana, muestras.length);
		expect(principio).toBeGreaterThan(final * 5);
	});

	it("la envolvente empieza en 0 y acaba en 0", () => {
		const muestras = renderizarEfecto(
			efectoBase({
				duracionMs: 400,
				envolvente: { ataqueMs: 100, decaimientoMs: 300 },
			}),
		);
		expect(muestras[0]).toBe(0);
		expect(Math.abs(muestras[muestras.length - 1] ?? 1)).toBeLessThan(0.01);
	});

	it("rechaza una tasa fuera de rango y un efecto inválido", () => {
		expect(() => renderizarEfecto(efectoBase(), 1000)).toThrow(RangeError);
		expect(() => renderizarEfecto(efectoBase({ duracionMs: 5 }))).toThrow();
	});
});

describe("aWav", () => {
	it("escribe la cabecera RIFF/WAVE y las muestras en 16 bits", () => {
		const muestras = new Float32Array([0, 1, -1, 0.5]);
		const wav = aWav(muestras, 22050);
		const texto = (offset: number, largo: number) =>
			String.fromCharCode(...wav.slice(offset, offset + largo));
		expect(wav.length).toBe(44 + 2 * muestras.length);
		expect(texto(0, 4)).toBe("RIFF");
		expect(texto(8, 4)).toBe("WAVE");
		expect(texto(12, 4)).toBe("fmt ");
		expect(texto(36, 4)).toBe("data");
		const vista = new DataView(wav.buffer);
		expect(vista.getUint32(4, true)).toBe(36 + 2 * muestras.length);
		expect(vista.getUint16(20, true)).toBe(1);
		expect(vista.getUint16(22, true)).toBe(1);
		expect(vista.getUint32(24, true)).toBe(22050);
		expect(vista.getUint32(28, true)).toBe(44100);
		expect(vista.getUint16(34, true)).toBe(16);
		expect(vista.getUint32(40, true)).toBe(2 * muestras.length);
		expect(vista.getInt16(44, true)).toBe(0);
		expect(vista.getInt16(46, true)).toBe(32767);
		expect(vista.getInt16(48, true)).toBe(-32767);
		expect(vista.getInt16(50, true)).toBe(16384);
	});

	it("recorta los valores fuera de [-1, 1]", () => {
		const wav = aWav(new Float32Array([2, -2]), 8000);
		const vista = new DataView(wav.buffer);
		expect(vista.getInt16(44, true)).toBe(32767);
		expect(vista.getInt16(46, true)).toBe(-32767);
	});
});
