import { z } from "zod";
import { SetCombateSchema } from "./set.js";

// Clave de texto i18n: tramos en minúsculas separados por puntos.
const clave = z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)*$/);

// Los sets de una lista no pueden repetir especie.
const especiesDistintas = (sets: { especie: string }[]) =>
	new Set(sets.map((s) => s.especie)).size === sets.length;

/** Equipo del jefe del bioma: un nombre y tres especies distintas. */
export const JefeSchema = z
	.object({
		nombre: clave,
		equipo: z
			.array(SetCombateSchema)
			.length(3)
			.refine(especiesDistintas, "especie repetida en el equipo del jefe"),
	})
	.strict();
export type Jefe = z.infer<typeof JefeSchema>;

/**
 * Élites del pack: un set de Alfa por especie (la verificación del pack exige
 * que cubran `especies.json`) y el equipo del jefe del primer bioma.
 */
export const ElitesSchema = z
	.object({
		alfas: z
			.array(SetCombateSchema)
			.min(1)
			.refine(especiesDistintas, "especie repetida en los Alfa"),
		jefe: JefeSchema,
	})
	.strict();
export type Elites = z.infer<typeof ElitesSchema>;
