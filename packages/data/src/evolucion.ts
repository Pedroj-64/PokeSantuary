import { z } from "zod";
import { slug } from "./slug.js";

// Nivel al que se aprende una evolución (GDD §7.2).
const nivelDeCondicion = z.number().int().min(2).max(100);

// Condiciones de evolución (GDD §7.2, §11.12), discriminadas por `tipo`.
export const CondicionEvolucionSchema = z.discriminatedUnion("tipo", [
	z.object({ tipo: z.literal("nivel"), nivel: nivelDeCondicion }).strict(),
	z.object({ tipo: z.literal("objeto"), objeto: slug }).strict(),
	z
		.object({
			tipo: z.literal("amistad"),
			momento: z.enum(["dia", "noche"]).optional(),
			nivel: nivelDeCondicion.optional(),
		})
		.strict(),
	z
		.object({ tipo: z.literal("intercambio"), objeto: slug.optional() })
		.strict(),
	z
		.object({ tipo: z.literal("otra"), detalle: z.string().trim().min(1) })
		.strict(),
]);
export type CondicionEvolucion = z.infer<typeof CondicionEvolucionSchema>;

// Evolución concreta: a qué especie lleva y con qué condición.
export const EvolucionSchema = z
	.object({ a: slug, condicion: CondicionEvolucionSchema })
	.strict();
export type Evolucion = z.infer<typeof EvolucionSchema>;

// Etapa y evoluciones de una especie.
export const EvolucionesSchema = z.record(
	slug,
	z
		.object({
			nivelEtapa: z.number().int().min(0).max(100),
			evoluciones: z
				.array(EvolucionSchema)
				.refine(
					(lista) => new Set(lista.map((e) => e.a)).size === lista.length,
					"evoluciones repetidas (mismo destino)",
				),
		})
		.strict(),
);
export type Evoluciones = z.infer<typeof EvolucionesSchema>;
