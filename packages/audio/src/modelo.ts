import { z } from "zod";

// Identificador en minúsculas con guiones, como en el resto de paquetes.
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

// Clave de texto i18n: tramos en minúsculas separados por puntos.
const clave = z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)*$/);

/** Canales del chip de sonido. */
export const CanalSchema = z.enum(["pulso1", "pulso2", "onda", "ruido"]);
export type Canal = z.infer<typeof CanalSchema>;

/** Ciclos de trabajo admitidos por los canales de pulso, en porcentaje. */
export const CICLOS = [12.5, 25, 50, 75] as const;

const ciclo = z.union([
	z.literal(12.5),
	z.literal(25),
	z.literal(50),
	z.literal(75),
]);

const esPulso = (canal: Canal) => canal === "pulso1" || canal === "pulso2";

/**
 * Envolvente de volumen del hardware: empieza en `inicio` (1 a 15) y sube o
 * baja una unidad cada `|paso| / 64` s. Se detiene al llegar a 0 o a 15 y
 * `paso: 0` deja el volumen fijo.
 */
export const EnvolventeHardwareSchema = z
	.object({
		inicio: z.number().int().min(1).max(15),
		paso: z.number().int().min(-7).max(7),
	})
	.strict();
export type EnvolventeHardware = z.infer<typeof EnvolventeHardwareSchema>;

/** Vibrato por pista: retardo en milisegundos, frecuencia y semitonos. */
export const VibratoCancionSchema = z
	.object({
		retardoMs: z.number().int().min(0).max(1000),
		hz: z.number().min(1).max(12),
		profundidad: z.number().min(0).max(2),
	})
	.strict();
export type VibratoCancion = z.infer<typeof VibratoCancionSchema>;

/** Eco barato de un solo retardo con realimentación acotada (mezcla < 1). */
export const EcoSchema = z
	.object({
		retardoMs: z.number().int().min(20).max(400),
		mezcla: z.number().min(0).max(0.6),
	})
	.strict();
export type Eco = z.infer<typeof EcoSchema>;

/** Golpes de percusión predefinidos para el canal de ruido. */
export const GOLPES = [
	"bombo",
	"caja",
	"charles",
	"charlesAbierto",
	"platillo",
] as const;
export type Golpe = (typeof GOLPES)[number];

/**
 * Nota de una pista: paso de inicio, duración en pasos, nota MIDI y volumen
 * (1 a 15; la nota MIDI se ignora en el canal de ruido).
 *
 * Los campos opcionales anulan, solo para esta nota, lo que diga la pista:
 * `ciclo` (solo pulsos), `env`, `desliz` (semitonos recorridos durante la
 * nota), `arp` (desplazamientos adicionales del arpegio) y `golpe` (solo
 * ruido; entonces `n` se ignora).
 */
export const NotaSchema = z
	.object({
		t: z.number().int().min(0),
		d: z.number().int().min(1),
		n: z.number().int().min(0).max(127),
		v: z.number().int().min(1).max(15),
		ciclo: ciclo.optional(),
		env: EnvolventeHardwareSchema.optional(),
		desliz: z.number().min(-24).max(24).optional(),
		arp: z.array(z.number().int().min(-24).max(24)).min(1).max(3).optional(),
		golpe: z.enum(GOLPES).optional(),
	})
	.strict();
export type Nota = z.infer<typeof NotaSchema>;

/**
 * Pista de un canal. Las notas van ordenadas por `t` y no se solapan.
 * `onda` es obligatoria en el canal homónimo, `ruidoCorto` solo vale ahí y
 * `ciclo` solo en los pulsos. `pan` va de -1 (izquierda) a 1 (derecha).
 */
export const PistaSchema = z
	.object({
		canal: CanalSchema,
		ciclo: ciclo.optional(),
		onda: z.array(z.number().int().min(0).max(15)).length(32).optional(),
		ruidoCorto: z.boolean().optional(),
		volumen: z.number().int().min(1).max(15).optional(),
		envolvente: EnvolventeHardwareSchema.optional(),
		vibrato: VibratoCancionSchema.optional(),
		pan: z.number().min(-1).max(1).optional(),
		eco: EcoSchema.optional(),
		notas: z.array(NotaSchema),
	})
	.strict()
	.superRefine((pista, ctx) => {
		if (!esPulso(pista.canal) && pista.ciclo !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["ciclo"],
				message: `el ciclo de trabajo solo vale en los pulsos (canal ${pista.canal})`,
			});
		}
		if (pista.canal === "onda" && pista.onda === undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["onda"],
				message: "el canal onda necesita su tabla de 32 muestras",
			});
		}
		if (pista.canal !== "onda" && pista.onda !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["onda"],
				message: `la tabla de onda solo vale en el canal onda (canal ${pista.canal})`,
			});
		}
		if (pista.canal !== "ruido" && pista.ruidoCorto !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["ruidoCorto"],
				message: `ruidoCorto solo vale en el canal ruido (canal ${pista.canal})`,
			});
		}
		for (let i = 0; i < pista.notas.length; i++) {
			const nota = pista.notas[i];
			if (nota === undefined) continue;
			if (!esPulso(pista.canal) && nota.ciclo !== undefined) {
				ctx.addIssue({
					code: "custom",
					path: ["notas", i, "ciclo"],
					message: `el ciclo por nota solo vale en los pulsos (canal ${pista.canal})`,
				});
			}
			if (pista.canal === "ruido" && nota.arp !== undefined) {
				ctx.addIssue({
					code: "custom",
					path: ["notas", i, "arp"],
					message: "el arpegio no vale en el canal de ruido",
				});
			}
			if (pista.canal !== "ruido" && nota.golpe !== undefined) {
				ctx.addIssue({
					code: "custom",
					path: ["notas", i, "golpe"],
					message: `el golpe solo vale en el canal de ruido (canal ${pista.canal})`,
				});
			}
		}
		for (let i = 1; i < pista.notas.length; i++) {
			const anterior = pista.notas[i - 1];
			const actual = pista.notas[i];
			if (anterior === undefined || actual === undefined) continue;
			if (actual.t < anterior.t) {
				ctx.addIssue({
					code: "custom",
					path: ["notas", i, "t"],
					message: "las notas deben ir ordenadas por paso de inicio",
				});
			} else if (actual.t < anterior.t + anterior.d) {
				ctx.addIssue({
					code: "custom",
					path: ["notas", i, "t"],
					message: `las notas se solapan en el paso ${actual.t}`,
				});
			}
		}
	});
export type Pista = z.infer<typeof PistaSchema>;

/**
 * Canción: rejilla de pasos, tempo y hasta cuatro pistas de canales distintos.
 * `bucle` indica al reproductor el paso al que volver tras el final (el
 * render sigue siendo una vuelta completa) y `swing` retrasa los pasos
 * impares esa fracción de paso.
 */
export const CancionSchema = z
	.object({
		id: slug,
		nombre: clave,
		bpm: z.number().int().min(40).max(240),
		pasosPorNegra: z.number().int().min(1).max(8).default(4),
		pasos: z.number().int().min(1),
		repetir: z.boolean(),
		bucle: z
			.object({ desde: z.number().int().min(0) })
			.strict()
			.optional(),
		swing: z.number().min(0).max(0.5).optional(),
		pistas: z.array(PistaSchema).min(1).max(4),
	})
	.strict()
	.superRefine((cancion, ctx) => {
		if (cancion.bucle !== undefined && cancion.bucle.desde >= cancion.pasos) {
			ctx.addIssue({
				code: "custom",
				path: ["bucle", "desde"],
				message: `el bucle empieza en el paso ${cancion.bucle.desde}, más allá de los ${cancion.pasos} de la canción`,
			});
		}
		const canales = new Set<Canal>();
		cancion.pistas.forEach((pista, i) => {
			if (canales.has(pista.canal)) {
				ctx.addIssue({
					code: "custom",
					path: ["pistas", i, "canal"],
					message: `el canal ${pista.canal} está repetido`,
				});
			}
			canales.add(pista.canal);
			pista.notas.forEach((nota, j) => {
				if (nota.t + nota.d > cancion.pasos) {
					ctx.addIssue({
						code: "custom",
						path: ["pistas", i, "notas", j, "d"],
						message: `la nota termina en el paso ${nota.t + nota.d}, más allá de los ${cancion.pasos} de la canción`,
					});
				}
			});
		});
	});
export type Cancion = z.infer<typeof CancionSchema>;

/** Vibrato de un efecto: frecuencia en Hz y profundidad en semitonos. */
export const VibratoSchema = z
	.object({
		hz: z.number().min(0.5).max(20),
		profundidad: z.number().min(0).max(12),
	})
	.strict();

/** Envolvente de un efecto, en milisegundos. */
export const EnvolventeSchema = z
	.object({
		ataqueMs: z.number().min(0).max(500),
		decaimientoMs: z.number().min(0).max(2000),
	})
	.strict();

// Forma común a todos los efectos; las capas no pueden anidar más capas.
const formaEfecto = {
	id: slug,
	canal: z.enum(["pulso1", "pulso2", "ruido"]),
	ciclo: ciclo.optional(),
	duracionMs: z.number().int().min(20).max(2000),
	volumen: z.number().int().min(1).max(15),
	frecInicial: z.number().min(20).max(8000),
	deslizamiento: z.number().min(-96).max(96),
	vibrato: VibratoSchema.optional(),
	envolvente: EnvolventeSchema,
};

/** Efecto corto de interfaz o de combate, generado al vuelo. */
export const EfectoBaseSchema = z
	.object(formaEfecto)
	.strict()
	.superRefine((efecto, ctx) => {
		if (!esPulso(efecto.canal) && efecto.ciclo !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["ciclo"],
				message: `el ciclo de trabajo solo vale en los pulsos (canal ${efecto.canal})`,
			});
		}
	});

/** Capa de un efecto compuesto: se suma con retardo `desdeMs`. */
export const CapaEfectoSchema = z
	.object({
		desdeMs: z.number().int().min(0).max(2000),
		efecto: EfectoBaseSchema,
	})
	.strict();
export type CapaEfecto = z.infer<typeof CapaEfectoSchema>;

/**
 * Efecto con capas opcionales. Cada capa es un efecto sin capas que empieza
 * en `desdeMs` y se suma al principal con el mismo limitador.
 */
export const EfectoSchema = z
	.object({
		...formaEfecto,
		capas: z.array(CapaEfectoSchema).max(8).optional(),
	})
	.strict()
	.superRefine((efecto, ctx) => {
		if (!esPulso(efecto.canal) && efecto.ciclo !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["ciclo"],
				message: `el ciclo de trabajo solo vale en los pulsos (canal ${efecto.canal})`,
			});
		}
	});
export type Efecto = z.infer<typeof EfectoSchema>;

/** Colección completa de audio del juego, con ids únicos por lista. */
export const ColeccionAudioSchema = z
	.object({
		canciones: z.array(CancionSchema),
		efectos: z.array(EfectoSchema),
	})
	.strict()
	.superRefine((coleccion, ctx) => {
		const unicos = (ids: string[], ruta: string) => {
			const vistos = new Set<string>();
			ids.forEach((id, i) => {
				if (vistos.has(id)) {
					ctx.addIssue({
						code: "custom",
						path: [ruta, i, "id"],
						message: `id repetido: ${id}`,
					});
				}
				vistos.add(id);
			});
		};
		unicos(
			coleccion.canciones.map((c) => c.id),
			"canciones",
		);
		unicos(
			coleccion.efectos.map((e) => e.id),
			"efectos",
		);
	});
export type ColeccionAudio = z.infer<typeof ColeccionAudioSchema>;
