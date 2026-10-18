import { describe, expect, it } from "vitest";
import { CancionSchema, ColeccionAudioSchema } from "./modelo.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

/** JSON real del pack, tal cual está en el repositorio. */
const LEIDO: unknown = JSON.parse(
	readFileSync(new URL("../datos/audio.json", import.meta.url), "utf8"),
);

/** Forma suelta del JSON para romper una regla a la vez. */
interface Crudo {
	canciones: Array<{
		id: string;
		nombre: string;
		bpm: number;
		pasosPorNegra?: number;
		pasos: number;
		repetir: boolean;
		pistas: Array<{
			canal: string;
			ciclo?: number;
			onda?: number[];
			ruidoCorto?: boolean;
			notas: Array<{ t: number; d: number; n: number; v: number }>;
			[k: string]: unknown;
		}>;
		[k: string]: unknown;
	}>;
	efectos: Array<Record<string, unknown> & { id: string }>;
	[k: string]: unknown;
}

/** Copia independiente del pack. */
const base = (): Crudo => structuredClone(LEIDO) as Crudo;

/** Valida una copia del pack con una mutación aplicada. */
const roto = (romper: (crudo: Crudo) => void): boolean => {
	const crudo = base();
	romper(crudo);
	return ColeccionAudioSchema.safeParse(crudo).success;
};

/** Primera canción del pack; falla si no la hay. */
const cancion = (crudo: Crudo, i = 0) => {
	const c = crudo.canciones[i];
	if (!c) throw new Error(`el pack no trae la canción ${i}`);
	return c;
};

/** Pista de una canción; falla si no la hay. */
const pista = (crudo: Crudo, i = 0, j = 0) => {
	const p = cancion(crudo, i).pistas[j];
	if (!p) throw new Error(`la canción ${i} no trae la pista ${j}`);
	return p;
};

/** Primera nota de una pista; falla si no la hay. */
const nota = (crudo: Crudo, i = 0, j = 0, k = 0) => {
	const n = pista(crudo, i, j).notas[k];
	if (!n) throw new Error(`la pista ${j} no trae la nota ${k}`);
	return n;
};

describe("ColeccionAudioSchema", () => {
	it("acepta el JSON real del pack", () => {
		const resultado = ColeccionAudioSchema.safeParse(LEIDO);
		expect(resultado.success ? [] : resultado.error.issues).toEqual([]);
	});

	it("el pack trae los tres temas ordenados por id y los 58 efectos", () => {
		const coleccion = ColeccionAudioSchema.parse(LEIDO);
		// El generador ordena las canciones por id.
		expect(coleccion.canciones.map((c) => c.id)).toEqual([
			"combate",
			"mapa",
			"victoria",
		]);
		expect(coleccion.efectos).toHaveLength(58);
		expect(new Set(coleccion.efectos.map((e) => e.id)).size).toBe(58);
	});

	it("aplica 4 pasos por negra cuando la canción no lo dice", () => {
		const crudo = base();
		delete cancion(crudo).pasosPorNegra;
		const resultado = CancionSchema.parse(cancion(crudo));
		expect(resultado.pasosPorNegra).toBe(4);
	});

	it("rechaza notas solapadas dentro de una pista", () => {
		expect(
			roto((crudo) => {
				const notas = pista(crudo).notas;
				const primera = notas[0];
				const segunda = notas[1];
				if (!primera || !segunda) throw new Error("faltan notas");
				segunda.t = primera.t + primera.d - 1;
			}),
		).toBe(false);
	});

	it("rechaza notas desordenadas", () => {
		expect(
			roto((crudo) => {
				const notas = pista(crudo).notas;
				const primera = notas[0];
				const segunda = notas[1];
				if (!primera || !segunda) throw new Error("faltan notas");
				segunda.t = primera.t - 1;
			}),
		).toBe(false);
	});

	it("rechaza una nota que se sale de la canción", () => {
		expect(
			roto((crudo) => {
				const c = cancion(crudo);
				const p = pista(crudo);
				const ultima = p.notas[p.notas.length - 1];
				if (!ultima) throw new Error("la pista está vacía");
				ultima.t = c.pasos - 1;
				ultima.d = 2;
			}),
		).toBe(false);
	});

	it("rechaza un canal repetido", () => {
		expect(
			roto((crudo) => {
				const c = cancion(crudo);
				const primera = c.pistas[0];
				const segunda = c.pistas[1];
				if (!primera || !segunda) throw new Error("faltan pistas");
				segunda.canal = primera.canal;
			}),
		).toBe(false);
	});

	it("rechaza volúmenes 0 y 16", () => {
		for (const v of [0, 16]) {
			expect(roto((crudo) => (nota(crudo).v = v))).toBe(false);
		}
	});

	it("rechaza un ciclo de trabajo inválido o fuera de los pulsos", () => {
		expect(roto((crudo) => (pista(crudo).ciclo = 33))).toBe(false);
		expect(
			roto((crudo) => {
				// La pista 3 del pack es el canal de ruido.
				const ruido = pista(crudo, 0, 3);
				ruido.ciclo = 50;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				const pulso = pista(crudo, 0, 0);
				pulso.ciclo = 12.5;
			}),
		).toBe(true);
	});

	it("rechaza una tabla de onda que no tenga 32 muestras", () => {
		for (const largo of [31, 33]) {
			expect(
				roto((crudo) => {
					const onda = pista(crudo, 0, 2);
					onda.onda = Array.from({ length: largo }, () => 8);
				}),
			).toBe(false);
		}
	});

	it("rechaza la tabla de onda fuera del canal onda y en el canal onda sin tabla", () => {
		expect(
			roto((crudo) => {
				pista(crudo, 0, 0).onda = Array.from({ length: 32 }, () => 8);
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				delete pista(crudo, 0, 2).onda;
			}),
		).toBe(false);
	});

	it("rechaza ruidoCorto fuera del canal de ruido", () => {
		expect(
			roto((crudo) => {
				pista(crudo, 0, 0).ruidoCorto = true;
			}),
		).toBe(false);
	});

	it("rechaza claves extra en documento, canción, pista, nota y efecto", () => {
		expect(roto((crudo) => (crudo.extra = 1))).toBe(false);
		expect(roto((crudo) => (cancion(crudo).extra = 1))).toBe(false);
		expect(roto((crudo) => (pista(crudo).extra = 1))).toBe(false);
		expect(
			roto((crudo) => {
				const primera = nota(crudo) as unknown as Record<string, unknown>;
				primera.extra = 1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				const efecto = crudo.efectos[0];
				if (!efecto) throw new Error("no hay efectos");
				efecto.extra = 1;
			}),
		).toBe(false);
	});

	it("rechaza ids repetidos en canciones y en efectos", () => {
		expect(
			roto((crudo) => {
				const segunda = crudo.canciones[1];
				const primera = crudo.canciones[0];
				if (!segunda || !primera) throw new Error("faltan canciones");
				segunda.id = primera.id;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				const segundo = crudo.efectos[1];
				const primero = crudo.efectos[0];
				if (!segundo || !primero) throw new Error("faltan efectos");
				segundo.id = primero.id;
			}),
		).toBe(false);
	});

	it("rechaza bpm fuera de 40..240 y canciones sin pistas", () => {
		expect(roto((crudo) => (cancion(crudo).bpm = 300))).toBe(false);
		expect(roto((crudo) => (cancion(crudo).bpm = 39))).toBe(false);
		expect(roto((crudo) => (cancion(crudo).pistas = []))).toBe(false);
	});

	it("rechaza un efecto con duración o frecuencia fuera de rango", () => {
		expect(
			roto((crudo) => {
				const efecto = crudo.efectos[0];
				if (!efecto) throw new Error("no hay efectos");
				efecto.duracionMs = 10;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				const efecto = crudo.efectos[0];
				if (!efecto) throw new Error("no hay efectos");
				efecto.frecInicial = 9000;
			}),
		).toBe(false);
	});
});

/** Canción mínima a la que se le añaden los campos opcionales de la v2. */
const cancionV2 = (extra: Record<string, unknown> = {}) => ({
	id: "prueba",
	nombre: "audio.prueba.nombre",
	bpm: 120,
	pasosPorNegra: 4,
	pasos: 4,
	repetir: false,
	pistas: [
		{
			canal: "pulso1",
			...extra,
			notas: [{ t: 0, d: 4, n: 69, v: 15 }],
		},
	],
});

describe("esquema v2", () => {
	it("acepta pista y nota con todos los campos nuevos", () => {
		const cancion = cancionV2({
			volumen: 12,
			envolvente: { inicio: 14, paso: -2 },
			vibrato: { retardoMs: 120, hz: 6, profundidad: 0.3 },
			pan: -0.4,
			eco: { retardoMs: 180, mezcla: 0.35 },
		});
		cancion.pistas[0] = {
			...cancion.pistas[0],
			notas: [
				{
					t: 0,
					d: 4,
					n: 60,
					v: 10,
					ciclo: 12.5,
					env: { inicio: 15, paso: 1 },
					desliz: 3,
					arp: [4, 7],
				},
			],
		} as never;
		expect(CancionSchema.safeParse(cancion).success).toBe(true);
	});

	it("acepta bucle y swing en la canción", () => {
		const cancion = cancionV2();
		Object.assign(cancion, { bucle: { desde: 2 }, swing: 0.25 });
		expect(CancionSchema.safeParse(cancion).success).toBe(true);
	});

	it("acepta golpes de percusión solo en el canal de ruido", () => {
		const ruido = {
			id: "prueba",
			nombre: "audio.prueba.nombre",
			bpm: 120,
			pasosPorNegra: 4,
			pasos: 4,
			repetir: false,
			pistas: [
				{
					canal: "ruido",
					notas: [
						{ t: 0, d: 1, n: 0, v: 12, golpe: "bombo" },
						{ t: 1, d: 1, n: 90, v: 8, golpe: "charles" },
					],
				},
			],
		};
		expect(CancionSchema.safeParse(ruido).success).toBe(true);
		const mal = {
			...ruido,
			pistas: [
				{
					canal: "pulso1",
					notas: [
						{ t: 0, d: 1, n: 60, v: 12, golpe: "bombo" },
						{ t: 1, d: 1, n: 90, v: 8 },
					],
				},
			],
		};
		expect(CancionSchema.safeParse(mal).success).toBe(false);
	});

	it("rechaza rangos fuera de la v2", () => {
		for (const roto of [
			{ pan: 1.2 },
			{ eco: { retardoMs: 10, mezcla: 0.3 } },
			{ eco: { retardoMs: 100, mezcla: 0.7 } },
			{ envolvente: { inicio: 0, paso: 0 } },
			{ envolvente: { inicio: 8, paso: 8 } },
			{ vibrato: { retardoMs: 100, hz: 6, profundidad: 3 } },
			{ volumen: 16 },
		]) {
			expect(CancionSchema.safeParse(cancionV2(roto)).success).toBe(false);
		}
	});

	it("rechaza arp y ciclo por nota fuera de su canal", () => {
		const conArp = cancionV2();
		const notasConArp = [{ t: 0, d: 4, n: 60, v: 10, arp: [4] }];
		conArp.pistas[0] = {
			...conArp.pistas[0],
			notas: notasConArp,
		} as never;
		const ruido = {
			...conArp,
			pistas: [{ canal: "ruido", notas: notasConArp }],
		};
		expect(CancionSchema.safeParse(ruido).success).toBe(false);
		const pulsos = {
			...cancionV2(),
			pistas: [
				{
					canal: "onda",
					onda: Array.from({ length: 32 }, () => 8),
					notas: [{ t: 0, d: 4, n: 60, v: 10, ciclo: 25 }],
				},
			],
		};
		expect(CancionSchema.safeParse(pulsos).success).toBe(false);
	});

	it("rechaza un bucle que empieza fuera de la canción", () => {
		const cancion = cancionV2();
		Object.assign(cancion, { bucle: { desde: 4 } });
		expect(CancionSchema.safeParse(cancion).success).toBe(false);
	});

	it("acepta efectos con capas y rechaza capas anidadas", () => {
		const base = {
			id: "golpe-doble",
			canal: "ruido",
			duracionMs: 300,
			volumen: 12,
			frecInicial: 900,
			deslizamiento: -20,
			envolvente: { ataqueMs: 0, decaimientoMs: 100 },
		};
		const capa = {
			desdeMs: 80,
			efecto: { ...base, id: "golpe-doble-capa", duracionMs: 120 },
		};
		expect(
			ColeccionAudioSchema.safeParse({
				canciones: [],
				efectos: [{ ...base, capas: [capa] }],
			}).success,
		).toBe(true);
		expect(
			ColeccionAudioSchema.safeParse({
				canciones: [],
				efectos: [{ ...base, capas: [{ ...capa, desdeMs: 2001 }] }],
			}).success,
		).toBe(false);
		expect(
			ColeccionAudioSchema.safeParse({
				canciones: [],
				efectos: [
					{
						...base,
						capas: [
							{
								desdeMs: 0,
								efecto: { ...base, capas: [] },
							},
						],
					},
				],
			}).success,
		).toBe(false);
	});
});
