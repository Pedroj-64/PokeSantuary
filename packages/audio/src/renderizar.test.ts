import { describe, expect, it } from "vitest";
import type { Cancion, Efecto, Nota, Pista } from "./modelo.js";
import {
	aWav,
	aWavEstereo,
	renderizarCancion,
	renderizarCancionEstereo,
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

	it("aplica 0.25 por pista y el limitador tanh al volumen", () => {
		const fuerte = renderizarCancion(cancion());
		const suave = renderizarCancion(
			cancion({
				pistas: [pista("pulso1", [{ t: 0, d: 8, n: MIDI_LA4, v: 7 }])],
			}),
		);
		const maximo = (m: Float32Array) =>
			m.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
		expect(maximo(fuerte)).toBeCloseTo(Math.tanh(0.25), 5);
		expect(maximo(suave)).toBeCloseTo(Math.tanh(0.25 * (7 / 15)), 5);
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
		// Cuatro pistas a tope suman 1 antes del limitador; tanh la deja por debajo.
		expect(pico).toBeCloseTo(Math.tanh(1), 5);
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
		expect(muestras[fin - caida - 1]).toBeCloseTo(Math.tanh(0.25), 5);
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
		const pico = Math.tanh(0.25);
		expect(alta[1000]).toBeCloseTo(pico, 5);
		expect(baja[1000]).toBeCloseTo(-pico, 5);
	});

	it("rechaza una tasa fuera de 8000..96000 y una canción inválida", () => {
		for (const tasa of [7999, 96001, 44100.5]) {
			expect(() => renderizarCancion(cancion(), tasa)).toThrow(RangeError);
		}
		expect(() => renderizarCancion(cancion({ bpm: 300 }))).toThrow();
	});
});

describe("renderizar v2", () => {
	it("el panorama centra los canales y el izquierdo duro apaga el derecho", () => {
		const nota = { t: 0, d: 8, n: MIDI_LA4, v: 15 };
		const centro = renderizarCancionEstereo(
			cancion({ pistas: [pista("pulso1", [nota], { pan: 0 })] }),
		);
		expect(Array.from(centro.izq)).toEqual(Array.from(centro.der));
		const izquierda = renderizarCancionEstereo(
			cancion({ pistas: [pista("pulso1", [nota], { pan: -1 })] }),
		);
		expect(izquierda.der.every((m) => m === 0)).toBe(true);
		expect(izquierda.izq.some((m) => m !== 0)).toBe(true);
		const derecha = renderizarCancionEstereo(
			cancion({ pistas: [pista("pulso1", [nota], { pan: 1 })] }),
		);
		expect(derecha.izq.every((m) => m === 0)).toBe(true);
		expect(derecha.der.some((m) => m !== 0)).toBe(true);
	});

	it("el mono es la media exacta de los canales estéreo", () => {
		const nota = { t: 0, d: 8, n: MIDI_LA4, v: 15 };
		const c = cancion({
			pistas: [
				pista("pulso1", [nota], { pan: -0.3 }),
				pista("pulso2", [nota], { pan: 0.6, ciclo: 25 }),
			],
		});
		const mono = renderizarCancion(c);
		const { izq, der } = renderizarCancionEstereo(c);
		for (let i = 0; i < mono.length; i += 97) {
			expect(mono[i]).toBeCloseTo(((izq[i] ?? 0) + (der[i] ?? 0)) / 2, 12);
		}
	});

	it("la envolvente del hardware baja un paso cada 1/64 s", () => {
		// 60 bpm con 4 pasos por negra: la nota dura 1 s y la tasa 64000 deja
		// 1000 muestras por tick de envolvente.
		const muestras = renderizarCancion(
			cancion({
				bpm: 60,
				pasos: 4,
				pistas: [
					pista("pulso1", [
						{
							t: 0,
							d: 4,
							n: MIDI_LA4,
							v: 15,
							env: { inicio: 15, paso: -1 },
						},
					]),
				],
			}),
			64000,
		);
		const pico = (desde: number, hasta: number) => {
			let maximo = 0;
			for (let i = desde; i < hasta; i++) {
				maximo = Math.max(maximo, Math.abs(muestras[i] ?? 0));
			}
			return maximo;
		};
		expect(pico(0, 999)).toBeCloseTo(Math.tanh(0.25), 4);
		expect(pico(1000, 1999)).toBeCloseTo(Math.tanh(0.25 * (14 / 15)), 4);
		expect(pico(2000, 2999)).toBeCloseTo(Math.tanh(0.25 * (13 / 15)), 4);
	});

	it("la envolvente se para en 0 y no sigue bajando", () => {
		const muestras = renderizarCancion(
			cancion({
				bpm: 60,
				pasos: 8,
				pistas: [
					pista("pulso1", [
						{
							t: 0,
							d: 8,
							n: MIDI_LA4,
							v: 15,
							env: { inicio: 15, paso: -7 },
						},
					]),
				],
			}),
		);
		// Con paso -7 baja una unidad cada 7/64 s: 15 -> 0 en 105/64 s.
		expect(
			muestras.slice(Math.round(1.8 * TASA_POR_DEFECTO)).every((m) => m === 0),
		).toBe(true);
		expect(muestras[Math.round(1.5 * TASA_POR_DEFECTO)]).not.toBe(0);
	});

	it("el ciclo por nota anula el de la pista", () => {
		const proporcion = (ciclo: 12.5 | 25 | 50 | 75) => {
			const muestras = renderizarCancion(
				cancion({
					bpm: 60,
					pasos: 4,
					pistas: [
						pista("pulso1", [{ t: 0, d: 4, n: MIDI_LA4, v: 15, ciclo }], {
							ciclo: 50,
						}),
					],
				}),
			);
			let positivas = 0;
			for (const muestra of muestras) if (muestra > 0) positivas++;
			return positivas / muestras.length;
		};
		expect(proporcion(12.5)).toBeCloseTo(0.125, 1);
		expect(proporcion(75)).toBeCloseTo(0.75, 1);
	});

	it("el deslizamiento recorre los semitonos durante la nota", () => {
		const muestras = renderizarCancion(
			cancion({
				bpm: 60,
				pasos: 4,
				pistas: [pista("pulso1", [{ t: 0, d: 4, n: 57, v: 15, desliz: 12 }])],
			}),
		);
		const ventana = Math.round(0.1 * TASA_POR_DEFECTO);
		const principio = cruces(muestras, 0, ventana);
		const final = cruces(muestras, muestras.length - ventana, muestras.length);
		expect(principio).toBeGreaterThan(10);
		expect(final).toBeGreaterThan(principio * 1.5);
	});

	it("el arpegio cambia de altura cada 1/60 s", () => {
		const muestras = renderizarCancion(
			cancion({
				bpm: 60,
				pasos: 4,
				pistas: [pista("pulso1", [{ t: 0, d: 4, n: 57, v: 15, arp: [12] }])],
			}),
		);
		const ventana = Math.round(TASA_POR_DEFECTO / 60);
		const fundamental = cruces(muestras, 10, 10 + ventana);
		const octava = cruces(muestras, ventana + 10, 2 * ventana + 10);
		expect(fundamental).toBeGreaterThan(2);
		expect(octava).toBeGreaterThan(fundamental * 1.4);
	});

	it("el vibrato no empieza hasta pasado su retardo", () => {
		const con = (vibrato?: {
			retardoMs: number;
			hz: number;
			profundidad: number;
		}) =>
			renderizarCancion(
				cancion({
					bpm: 60,
					pasos: 4,
					pistas: [
						pista(
							"pulso1",
							[{ t: 0, d: 4, n: MIDI_LA4, v: 15 }],
							vibrato === undefined ? {} : { vibrato },
						),
					],
				}),
			);
		const largo = con({ retardoMs: 500, hz: 6, profundidad: 2 });
		const corto = con();
		const hasta = Math.round(0.49 * TASA_POR_DEFECTO);
		expect(Array.from(largo.slice(0, hasta))).toEqual(
			Array.from(corto.slice(0, hasta)),
		);
		let diferencias = 0;
		for (let i = Math.round(0.55 * TASA_POR_DEFECTO); i < largo.length; i++) {
			if (largo[i] !== corto[i]) diferencias++;
		}
		expect(diferencias).toBeGreaterThan(100);
	});

	it("el eco deja cola después de acabar la nota", () => {
		const nota = { t: 0, d: 1, n: MIDI_LA4, v: 15 };
		const conEco = renderizarCancion(
			cancion({
				pistas: [
					pista("pulso1", [nota], {
						eco: { retardoMs: 100, mezcla: 0.5 },
					}),
				],
			}),
		);
		const seco = renderizarCancion(
			cancion({ pistas: [pista("pulso1", [nota])] }),
		);
		const energia = (m: Float32Array) =>
			m.reduce((total, x) => total + Math.abs(x), 0);
		const desde = 6000;
		const hasta = 10000;
		expect(energia(seco.slice(desde, hasta))).toBe(0);
		expect(energia(conEco.slice(desde, hasta))).toBeGreaterThan(1);
	});

	it("el swing retrasa los pasos impares", () => {
		const nota = { t: 1, d: 1, n: MIDI_LA4, v: 15 };
		const primero = (c: Cancion) => {
			const muestras = renderizarCancion(c);
			return muestras.findIndex((m) => m !== 0);
		};
		const mpb = (TASA_POR_DEFECTO * 60) / (120 * 4);
		expect(primero(cancion({ pistas: [pista("pulso1", [nota])] }))).toBe(
			Math.round(mpb),
		);
		expect(
			primero(cancion({ swing: 0.5, pistas: [pista("pulso1", [nota])] })),
		).toBe(Math.round(mpb + 0.5 * mpb));
	});

	it("los golpes ignoran la nota MIDI y cambian su caída", () => {
		const con = (n: number, golpe: "bombo" | "charles") =>
			renderizarCancion(
				cancion({
					bpm: 60,
					pasos: 4,
					pistas: [
						pista("ruido", [{ t: 0, d: 4, n, v: 15, golpe }], {
							ruidoCorto: golpe === "charles",
						}),
					],
				}),
			);
		expect(Array.from(con(0, "bombo"))).toEqual(Array.from(con(100, "bombo")));
		const energia = (m: Float32Array, desde: number, hasta: number) =>
			m.slice(desde, hasta).reduce((total, x) => total + Math.abs(x), 0);
		const desde = Math.round(0.1 * TASA_POR_DEFECTO);
		const hasta = Math.round(0.2 * TASA_POR_DEFECTO);
		expect(energia(con(0, "bombo"), desde, hasta)).toBeGreaterThan(
			energia(con(0, "charles"), desde, hasta) * 10,
		);
	});

	it("el estéreo es determinista y cabe en (-1, 1)", () => {
		const nota = { t: 0, d: 8, n: MIDI_LA4, v: 15 };
		const c = cancion({
			pistas: [
				pista("pulso1", [nota], { pan: -0.7 }),
				pista("pulso2", [nota], { ciclo: 12.5, pan: 0.4 }),
				pista("onda", [nota], {
					onda: Array.from({ length: 32 }, (_, i) => i % 16),
					pan: 0.9,
				}),
				pista("ruido", [nota], { pan: 0 }),
			],
		});
		const a = renderizarCancionEstereo(c);
		const b = renderizarCancionEstereo(c);
		expect(Array.from(a.izq)).toEqual(Array.from(b.izq));
		expect(Array.from(a.der)).toEqual(Array.from(b.der));
		for (const canal of [a.izq, a.der]) {
			const maximo = canal.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
			expect(maximo).toBeLessThan(1);
			expect(maximo).toBeGreaterThan(0.2);
		}
	});

	it("el estéreo rechaza una tasa fuera de rango", () => {
		expect(() => renderizarCancionEstereo(cancion(), 1000)).toThrow(RangeError);
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

	it("las capas se suman con retardo y alargan el resultado", () => {
		const base = efectoBase({
			id: "capa-base",
			duracionMs: 100,
			envolvente: { ataqueMs: 0, decaimientoMs: 0 },
		});
		const muestra = renderizarEfecto({
			...base,
			capas: [
				{
					desdeMs: 150,
					efecto: { ...base, id: "capa-eco", duracionMs: 200 },
				},
			],
		});
		expect(muestra.length).toBe(Math.round((350 * TASA_POR_DEFECTO) / 1000));
		const energia = (desde: number, hasta: number) =>
			muestra.slice(desde, hasta).reduce((total, x) => total + Math.abs(x), 0);
		expect(energia(0, 3000)).toBeGreaterThan(0);
		// Entre el final del efecto base (100 ms) y la capa (150 ms) hay silencio.
		expect(energia(4600, 6400)).toBe(0);
		expect(energia(7000, 9000)).toBeGreaterThan(0);
	});

	it("las capas también pasan por el limitador", () => {
		const base = efectoBase({ id: "capa-limpia", duracionMs: 100 });
		const muestra = renderizarEfecto({
			...base,
			capas: [
				{ desdeMs: 0, efecto: { ...base, id: "capa-limpia-2" } },
				{ desdeMs: 0, efecto: { ...base, id: "capa-limpia-3" } },
			],
		});
		for (const valor of muestra) {
			expect(valor).toBeGreaterThan(-1);
			expect(valor).toBeLessThan(1);
		}
		expect(Math.max(...muestra.map(Math.abs))).toBeLessThan(1);
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

	it("el WAV estéreo entrelaza los canales con su cabecera", () => {
		const wav = aWavEstereo(
			new Float32Array([1, 0.5]),
			new Float32Array([-1, -0.5]),
			22050,
		);
		const vista = new DataView(wav.buffer);
		expect(wav.length).toBe(44 + 2 * 2 * 2);
		expect(vista.getUint16(22, true)).toBe(2);
		expect(vista.getUint32(28, true)).toBe(22050 * 4);
		expect(vista.getUint16(32, true)).toBe(4);
		expect(vista.getInt16(44, true)).toBe(32767);
		expect(vista.getInt16(46, true)).toBe(-32767);
		expect(vista.getInt16(48, true)).toBe(16384);
		expect(vista.getInt16(50, true)).toBe(-16383);
		expect(() =>
			aWavEstereo(new Float32Array([1]), new Float32Array([1, 2])),
		).toThrow(RangeError);
	});
});
