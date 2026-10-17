import { z } from "zod";

// Ruta relativa POSIX: sin "/" inicial, sin "\", sin unidad "C:", sin segmentos vacíos, "." ni "..".
const rutaRelativa = z
	.string()
	.min(1)
	.refine(
		(r) =>
			!r.includes("\\") &&
			!/^[A-Za-z]:/.test(r) &&
			r.split("/").every((s) => s !== "" && s !== "." && s !== ".."),
		"ruta relativa inválida",
	);

export const ManifiestoSchema = z.object({
	archivos: z.record(rutaRelativa, z.string().regex(/^[0-9a-f]{64}$/)),
});
export type Manifiesto = z.infer<typeof ManifiestoSchema>;
