import { z } from "zod";
import { TipoIdSchema, TrabajoIdSchema } from "./especie.js";

// Trabajos que aporta cada tipo (GDD §6.3). Debe cubrir los 18 tipos, sin extras.
export const TrabajosPorTipoSchema = z.record(
	TipoIdSchema,
	z.array(TrabajoIdSchema).min(1),
);
export type TrabajosPorTipo = z.infer<typeof TrabajosPorTipoSchema>;
