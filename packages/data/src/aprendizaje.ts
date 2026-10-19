import { z } from "zod";
import { slug } from "./slug.js";

// Movimiento que una especie aprende al alcanzar un nivel (GDD §7.1, §7.2).
const EntradaAprendizajeSchema = z
	.object({
		nivel: z.number().int().min(1).max(100),
		movimiento: slug,
	})
	.strict();
export type EntradaAprendizaje = z.infer<typeof EntradaAprendizajeSchema>;

// Lista de una especie: al menos una entrada, ordenada por nivel y, a igual
// nivel, por movimiento, y sin repetir un mismo movimiento.
const ListaAprendizajeSchema = z
	.array(EntradaAprendizajeSchema)
	.min(1)
	.superRefine((entradas, ctx) => {
		const vistos = new Set<string>();
		for (const [i, entrada] of entradas.entries()) {
			if (vistos.has(entrada.movimiento))
				ctx.addIssue({
					code: "custom",
					path: [i, "movimiento"],
					message: `movimiento repetido: ${entrada.movimiento}`,
				});
			vistos.add(entrada.movimiento);
			const anterior = entradas[i - 1];
			if (!anterior) continue;
			if (
				anterior.nivel > entrada.nivel ||
				(anterior.nivel === entrada.nivel &&
					anterior.movimiento >= entrada.movimiento)
			)
				ctx.addIssue({
					code: "custom",
					path: [i],
					message: "las entradas deben ir ordenadas por nivel y por movimiento",
				});
		}
	});

// Movimientos que aprende cada especie por nivel, indexado por slug de especie.
export const AprendizajeSchema = z.record(slug, ListaAprendizajeSchema);
export type Aprendizaje = z.infer<typeof AprendizajeSchema>;
