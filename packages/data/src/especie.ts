import { z } from "zod";

export const TipoIdSchema = z.enum([
	"normal",
	"fire",
	"water",
	"electric",
	"grass",
	"ice",
	"fighting",
	"poison",
	"ground",
	"flying",
	"psychic",
	"bug",
	"rock",
	"ghost",
	"dragon",
	"dark",
	"steel",
	"fairy",
]);
export type TipoId = z.infer<typeof TipoIdSchema>;

// La lista de trabajos vive en los packs; aquí solo se valida la forma del slug.
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const TrabajoIdSchema = slug;
export type TrabajoId = z.infer<typeof TrabajoIdSchema>;

const textoI18n = z.object({ es: z.string().min(1), en: z.string().min(1) });

export const EspecieSchema = z
	.object({
		id: slug,
		dex: z.number().int().positive(),
		tipos: z
			.array(TipoIdSchema)
			.min(1)
			.max(2)
			.refine((t) => new Set(t).size === t.length, "tipos duplicados"),
		nombre: textoI18n,
		descripcion: textoI18n,
		trabajos: z.array(TrabajoIdSchema),
		gruposHuevo: z.array(z.string()),
		tasaCaptura: z.number().int().min(0).max(255),
	})
	.strict();
export type Especie = z.infer<typeof EspecieSchema>;
