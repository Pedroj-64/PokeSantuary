import { z } from "zod";
import { slug } from "./slug.js";

export const NATURALEZAS = [
	"Hardy",
	"Lonely",
	"Brave",
	"Adamant",
	"Naughty",
	"Bold",
	"Docile",
	"Relaxed",
	"Impish",
	"Lax",
	"Timid",
	"Hasty",
	"Serious",
	"Jolly",
	"Naive",
	"Modest",
	"Mild",
	"Quiet",
	"Bashful",
	"Rash",
	"Calm",
	"Gentle",
	"Sassy",
	"Careful",
	"Quirky",
] as const;

export const SetCombateSchema = z
	.object({
		especie: slug,
		movimientos: z
			.array(slug)
			.min(1)
			.max(4)
			.refine((m) => new Set(m).size === m.length, "movimientos duplicados"),
		habilidad: slug,
		naturaleza: z.enum(NATURALEZAS),
	})
	.strict();
export type SetCombate = z.infer<typeof SetCombateSchema>;
