import { z } from "zod";
import { TipoIdSchema } from "./especie.js";
import { slug } from "./slug.js";

export const MovimientoSchema = z
	.object({
		id: slug,
		nombre: z.object({ es: z.string().min(1), en: z.string().min(1) }),
		tipo: TipoIdSchema,
		categoria: z.enum(["fisico", "especial", "estado"]),
		potencia: z.number().int().min(0).nullable(),
		precision: z.number().int().min(1).max(100).nullable(),
		pp: z.number().int().positive(),
	})
	.strict();
export type Movimiento = z.infer<typeof MovimientoSchema>;
