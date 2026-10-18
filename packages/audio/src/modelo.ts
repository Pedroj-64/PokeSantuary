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
 * Nota de una pista: paso de inicio, duración en pasos, nota MIDI y volumen
 * (1 a 15; la nota MIDI se ignora en el canal de ruido).
 */
export const NotaSchema = z
	.object({
		t: z.number().int().min(0),
		d: z.number().int().min(1),
		n: z.number().int().min(0).max(127),
		v: z.number().int().min(1).max(15),
	})
	.strict();
export type Nota = z.infer<typeof NotaSchema>;

/**
 * Pista de un canal. Las notas van ordenadas por `t` y no se solapan.
 * `onda` es obligatoria en el canal homónimo y `ruidoCorto` solo vale ahí.
 */
export const PistaSchema = z
	.object({
		canal: CanalSchema,
		ciclo: ciclo.optional(),
		onda: z.array(z.number().int().min(0).max(15)).length(32).optional(),
		ruidoCorto: z.boolean().optional(),
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

/** Canción: rejilla de pasos, tempo y hasta cuatro pistas de canales distintos. */
export const CancionSchema = z
	.object({
		id: slug,
		nombre: clave,
		bpm: z.number().int().min(40).max(240),
		pasosPorNegra: z.number().int().min(1).max(8).default(4),
		pasos: z.number().int().min(1),
		repetir: z.boolean(),
		pistas: z.array(PistaSchema).min(1).max(4),
	})
	.strict()
	.superRefine((cancion, ctx) => {
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

/** Efecto corto de interfaz o de combate, generado al vuelo. */
export const EfectoSchema = z
	.object({
		id: slug,
		canal: z.enum(["pulso1", "pulso2", "ruido"]),
		ciclo: ciclo.optional(),
		duracionMs: z.number().int().min(20).max(2000),
		volumen: z.number().int().min(1).max(15),
		frecInicial: z.number().min(20).max(8000),
		deslizamiento: z.number().min(-96).max(96),
		vibrato: VibratoSchema.optional(),
		envolvente: EnvolventeSchema,
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
