import { z } from "zod";
import { slug } from "./slug.js";

// Rango de dinero de una recompensa, en monedas enteras.
export const RangoDineroSchema = z
	.object({
		min: z.number().int().min(0),
		max: z.number().int().min(0),
	})
	.strict()
	.refine((r) => r.max >= r.min, "el máximo no puede ser menor que el mínimo");

// Tupla con los rangos de los pisos 1, 2 y 3.
const rangosPorPiso = z.tuple([
	RangoDineroSchema,
	RangoDineroSchema,
	RangoDineroSchema,
]);

// Tipos de nodo que dan recompensa de combate.
const recompensa = z
	.object({
		salvaje: rangosPorPiso,
		entrenador: rangosPorPiso,
		alfa: rangosPorPiso,
		sombrio: rangosPorPiso,
		jefe: rangosPorPiso,
	})
	.strict();

const articuloTienda = z
	.object({
		id: slug,
		tipo: z.enum(["baya", "mt", "objeto", "ball"]),
		precio: z.number().int().min(1),
	})
	.strict();

const catalogoTienda = z
	.array(articuloTienda)
	.min(6)
	.refine((a) => new Set(a.map((x) => x.id)).size === a.length, "ids repetidos")
	.refine(
		(a) => a.some((x) => x.tipo === "ball"),
		'el catálogo necesita al menos una "ball"',
	);

// Cuántos Pokémon trae el rival de cada tipo de nodo en los pisos 1, 2 y 3.
const tamanoPorPiso = z.tuple([
	z.number().int().min(1).max(3),
	z.number().int().min(1).max(3),
	z.number().int().min(1).max(3),
]);

const tamanoRival = z
	.object({
		salvaje: tamanoPorPiso,
		entrenador: tamanoPorPiso,
		alfa: tamanoPorPiso,
		sombrio: tamanoPorPiso,
		jefe: tamanoPorPiso,
	})
	.strict();

// Nivel del rival de cada tipo de nodo en los pisos 1, 2 y 3.
const nivelPorPiso = z.tuple([
	z.number().int().min(1).max(100),
	z.number().int().min(1).max(100),
	z.number().int().min(1).max(100),
]);

const nivelRival = z
	.object({
		salvaje: nivelPorPiso,
		entrenador: nivelPorPiso,
		alfa: nivelPorPiso,
		sombrio: nivelPorPiso,
		jefe: nivelPorPiso,
	})
	.strict();

const multBola = z.record(slug, z.number().positive());

const tasaCaptura = z.record(slug, z.number().int().min(0).max(255));

// Llamas del Farol (GDD §6.10): cuántas se tienen y en qué nodos se puede repetir tras perder.
const farol = z
	.object({
		base: z.number().int().min(0),
		extraPorRango: z.array(z.number().int().min(0)).min(1),
		maximo: z.number().int().min(0),
		restaTenue: z.number().int().min(0),
		repetibles: z.array(
			z.enum(["salvaje", "entrenador", "alfa", "sombrio", "jefe"]),
		),
	})
	.strict();

/**
 * Números de balance de la expedición (GDD §5). Los precios de la tienda son
 * precios base: el recargo por piso lo aplica `precioEnPiso` de `@santuario/core`.
 */
export const ExpedicionBalanceSchema = z
	.object({
		dineroInicial: z.number().int().min(0),
		bolasIniciales: z.number().int().min(0),
		recompensa,
		tamanoRival,
		nivelRival,
		curaTrasVictoriaPct: z.number().int().min(0).max(100),
		catalogoTienda,
		multBola,
		tasaCaptura,
		tasaCapturaPorDefecto: z.number().int().min(0).max(255),
		farol,
	})
	.strict()
	.superRefine((datos, ctx) => {
		const bolas = new Set(
			datos.catalogoTienda.filter((a) => a.tipo === "ball").map((a) => a.id),
		);
		for (const id of Object.keys(datos.multBola)) {
			if (!bolas.has(id)) {
				ctx.addIssue({
					code: "custom",
					path: ["multBola", id],
					message: `${id} no es una ball del catálogo`,
				});
			}
		}
		for (const id of bolas) {
			if (!(id in datos.multBola)) {
				ctx.addIssue({
					code: "custom",
					path: ["multBola"],
					message: `falta el multiplicador de la ball ${id}`,
				});
			}
		}
	});
export type ExpedicionBalance = z.infer<typeof ExpedicionBalanceSchema>;
