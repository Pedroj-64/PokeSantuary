import { z } from "zod";
import { slug } from "./slug.js";

// Clave de texto i18n: tramos en minúsculas separados por puntos.
const clave = z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)*$/);

// Tipos de nodo que se resuelven con una pantalla de elección.
export const NodoEventoSchema = z.enum(["manantial", "cofre", "evento"]);

// Rivales que puede lanzar un efecto de combate.
export const RivalEventoSchema = z.enum(["salvaje", "entrenador", "sombrio"]);

/**
 * Efecto de una opción. `combate` no cambia el estado: la escena lanza el
 * combate y este solo indica contra quién.
 */
export const EfectoSchema = z.discriminatedUnion("tipo", [
	z
		.object({ tipo: z.literal("curar"), pct: z.number().int().min(1).max(100) })
		.strict(),
	z
		.object({
			tipo: z.literal("dinero"),
			cantidad: z
				.number()
				.int()
				.min(-999)
				.max(999)
				.refine((n) => n !== 0, "la cantidad no puede ser 0"),
		})
		.strict(),
	z
		.object({
			tipo: z.literal("runa"),
			runa: z.enum(["A", "C", "F", "S", "?", "aleatoria"]),
		})
		.strict(),
	z.object({ tipo: z.literal("combate"), rival: RivalEventoSchema }).strict(),
	z
		.object({
			tipo: z.literal("costePs"),
			pct: z.number().int().min(1).max(99),
		})
		.strict(),
]);
export type Efecto = z.infer<typeof EfectoSchema>;

/**
 * Opción de un evento: un texto y de 1 a 3 efectos. Tras un combate no se
 * aplica nada más, así que `combate` solo puede ir al final.
 */
export const OpcionEventoSchema = z
	.object({
		texto: clave,
		efectos: z.array(EfectoSchema).min(1).max(3),
	})
	.strict()
	.refine(
		(opcion) =>
			opcion.efectos.every(
				(efecto, i) =>
					efecto.tipo !== "combate" || i === opcion.efectos.length - 1,
			),
		"combate solo puede ser el último efecto",
	);
export type OpcionEvento = z.infer<typeof OpcionEventoSchema>;

/** Evento de un nodo de elección, con sus textos como claves i18n. */
export const EventoSchema = z
	.object({
		id: slug,
		nodo: NodoEventoSchema,
		titulo: clave,
		texto: clave,
		opciones: z.array(OpcionEventoSchema).min(2).max(3),
	})
	.strict();
export type Evento = z.infer<typeof EventoSchema>;

/**
 * Lista completa de eventos del pack: ids únicos, un manantial, un cofre y al
 * menos cuatro eventos comunes.
 */
export const EventosSchema = z
	.array(EventoSchema)
	.superRefine((eventos, ctx) => {
		const vistos = new Set<string>();
		eventos.forEach((evento, i) => {
			if (vistos.has(evento.id)) {
				ctx.addIssue({
					code: "custom",
					path: [i, "id"],
					message: `id repetido: ${evento.id}`,
				});
			}
			vistos.add(evento.id);
		});
		const cuantos = (nodo: Evento["nodo"]): number =>
			eventos.filter((evento) => evento.nodo === nodo).length;
		const manantiales = cuantos("manantial");
		if (manantiales !== 1) {
			ctx.addIssue({
				code: "custom",
				message: `se esperaba exactamente 1 manantial (hay ${manantiales})`,
			});
		}
		const cofres = cuantos("cofre");
		if (cofres !== 1) {
			ctx.addIssue({
				code: "custom",
				message: `se esperaba exactamente 1 cofre (hay ${cofres})`,
			});
		}
		const comunes = cuantos("evento");
		if (comunes < 4) {
			ctx.addIssue({
				code: "custom",
				message: `se esperaban al menos 4 eventos (hay ${comunes})`,
			});
		}
	});
export type Eventos = z.infer<typeof EventosSchema>;
