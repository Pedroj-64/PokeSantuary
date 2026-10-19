import { z } from "zod";
import { TipoIdSchema } from "./especie.js";
import { NATURALEZAS } from "./set.js";
import { slug } from "./slug.js";

// Mismas naturalezas (y misma grafía) que `SetCombateSchema`.
export const NaturalezaSchema = z.enum(NATURALEZAS);
export type Naturaleza = z.infer<typeof NaturalezaSchema>;

// Especialidades activas del Pack 1 (GDD §11.5); Allanar, Teletransportar,
// Clima y Explotar quedan aparcados.
export const ESPECIALIDADES = [
	"cortar",
	"romper",
	"regar",
	"crecer",
	"encender",
	"generar",
	"construir",
	"iluminar",
	"recolectar",
	"animar",
	"volar",
] as const;
export const EspecialidadIdSchema = z.enum(ESPECIALIDADES);
export type EspecialidadId = z.infer<typeof EspecialidadIdSchema>;

// Una o dos Especialidades por especie; la segunda se abre con Amistad 3.
export const EspecialidadesSchema = z.record(
	slug,
	z
		.array(EspecialidadIdSchema)
		.min(1)
		.max(2)
		.refine((e) => new Set(e).size === e.length, "especialidades duplicadas"),
);
export type Especialidades = z.infer<typeof EspecialidadesSchema>;

// Sabores de baya de los juegos, más "neutro" para las que no tienen uno.
export const SaborSchema = z.enum([
	"picante",
	"seco",
	"dulce",
	"amargo",
	"acido",
	"neutro",
]);
export type Sabor = z.infer<typeof SaborSchema>;

// Id de recurso: minúsculas con guiones y, para las bayas, `baya:<sabor>`.
const recurso = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$/);

const enteroNoNegativo = z.number().int().min(0);
const enteroPositivo = z.number().int().positive();

const isla = z
	.object({
		ancho: enteroPositivo,
		alto: enteroPositivo,
		// Lado de cada zona: la isla se reparte en 12 zonas de `zona` x `zona`.
		zona: enteroPositivo,
	})
	.strict();

const efectoComida = z
	.object({
		hambre: z.number().int().min(-100).max(100),
		animo: z.number().int().min(-100).max(100),
	})
	.strict();

const preferenciaSabor = z
	.object({
		favorito: SaborSchema,
		noGusta: SaborSchema,
	})
	.strict();

const comida = z
	.object({
		umbral: z.number().int().min(0).max(100),
		caidaPorJornada: z.number().int().min(0).max(100),
		neutra: efectoComida,
		favorita: efectoComida,
		noGusta: efectoComida,
		sabores: z.record(NaturalezaSchema, preferenciaSabor),
	})
	.strict();

const animo = z
	.object({
		inicial: z.number().int().min(0).max(100),
		preferido: z.number().int(),
		noPreferido: z.number().int(),
		confortBase: z.number().int(),
		confortFactor: z.number().int(),
		hambreBaja: z.number().int(),
		hambreBajaUmbral: z.number().int().min(0).max(100),
		peticion: z.number().int(),
		temaAnimo: z.number().int(),
		sinLecho: z.number().int(),
		agotado: z.number().int(),
		sombrioSuelto: z.number().int(),
		hablo: z.number().int(),
		animar: z.number().int(),
	})
	.strict();

const confort = z
	.object({
		puntosPorNivel: enteroPositivo,
		min: enteroNoNegativo,
		max: enteroNoNegativo,
	})
	.strict()
	.refine(
		(c) => c.min <= c.max,
		"el Confort mínimo no puede superar al máximo",
	);

const armonia = z
	.object({
		pesoAnimo: z.number().min(0).max(1),
		pesoConfort: z.number().min(0).max(1),
		factorConfort: z.number().positive(),
		umbralAlto: z.number().int().min(0).max(100),
		umbralMuyAlto: z.number().int().min(0).max(100),
		umbralBajo: z.number().int().min(0).max(100),
		multProduccionAlta: z.number().positive(),
	})
	.strict();

const inquietud = z
	.object({
		animoUmbral: z.number().int().min(0).max(100),
		jornadasAviso: enteroPositivo,
		jornadasSalida: enteroPositivo,
		multProduccion: z.number().positive().max(1),
	})
	.strict();

const produccion = z
	.object({
		multNivel: z.array(z.number().positive()).min(1),
		multPreferido: z.number().positive(),
		animoBase: z.number().min(0).max(1),
		multEspecialidad: z.number().positive(),
		multCharlaTrabajo: z.number().positive(),
		obraBasePorConstructor: enteroPositivo,
		obraPorNivelEspecialidad: enteroNoNegativo,
		obraCharlaRaices: enteroNoNegativo,
		mineralProbabilidad: z.number().min(0).max(1),
		tiposMineral: z.array(TipoIdSchema).min(1),
	})
	.strict();

const tamano = z
	.object({
		w: enteroPositivo,
		h: enteroPositivo,
	})
	.strict();

const edificio = z
	.object({
		id: slug,
		tamano,
		kit: z.record(recurso, enteroNoNegativo),
		obra: enteroNoNegativo,
		nivelMax: enteroPositivo,
		requiereArbol: enteroNoNegativo,
		// Trabajadores por nivel; vacío si el edificio no produce.
		plazas: z.array(enteroPositivo),
		trabajo: slug.optional(),
		especialidadesAfines: z.array(slug),
		produce: z
			.object({
				// Para el Huerto es "baya": la variedad se añade al producir.
				recurso,
				base: z.number().min(0),
			})
			.strict()
			.optional(),
	})
	.strict();

const decoracion = z
	.object({
		id: slug,
		puntos: z.union([z.literal(1), z.literal(2), z.literal(3)]),
		coste: z.record(recurso, z.number().int().min(1).max(10)),
	})
	.strict()
	.refine(
		(d) => Object.keys(d.coste).length > 0,
		"una decoración necesita al menos un recurso en el coste",
	);

/**
 * Números de balance del Santuario (GDD §11). Todos los valores del juego viven
 * aquí y en `packs/kanto/santuario.json`, nunca en el código del núcleo.
 */
export const SantuarioBalanceSchema = z
	.object({
		isla,
		recursosIniciales: z.record(recurso, enteroNoNegativo),
		comida,
		animo,
		confort,
		armonia,
		inquietud,
		produccion,
		capacidadArbol: z.array(enteroPositivo).min(1),
		capacidadAlmacen: z.array(enteroPositivo).min(1),
		edificios: z.array(edificio).min(1),
		decoraciones: z.array(decoracion),
		camino: z.object({ costePiedra: enteroPositivo }).strict(),
	})
	.strict()
	.superRefine((datos, ctx) => {
		const idsEdificio = new Set<string>();
		datos.edificios.forEach((e, i) => {
			if (idsEdificio.has(e.id)) {
				ctx.addIssue({
					code: "custom",
					path: ["edificios", i, "id"],
					message: `id de edificio repetido: ${e.id}`,
				});
			}
			idsEdificio.add(e.id);
			if (e.plazas.length > e.nivelMax) {
				ctx.addIssue({
					code: "custom",
					path: ["edificios", i, "plazas"],
					message: `${e.id} tiene más plazas que niveles`,
				});
			}
		});

		const idsDecoracion = new Set<string>();
		datos.decoraciones.forEach((d, i) => {
			if (idsDecoracion.has(d.id)) {
				ctx.addIssue({
					code: "custom",
					path: ["decoraciones", i, "id"],
					message: `id de decoración repetido: ${d.id}`,
				});
			}
			idsDecoracion.add(d.id);
		});

		for (const [campo, lista] of [
			["capacidadArbol", datos.capacidadArbol],
			["capacidadAlmacen", datos.capacidadAlmacen],
		] as const) {
			for (let i = 1; i < lista.length; i++) {
				if ((lista[i] ?? 0) <= (lista[i - 1] ?? 0)) {
					ctx.addIssue({
						code: "custom",
						path: [campo, i],
						message: `${campo} debe crecer estrictamente`,
					});
				}
			}
		}

		// Las capacidades tienen una entrada por nivel de su edificio.
		const arbol = datos.edificios.find((e) => e.id === "arbol-cenit");
		if (arbol !== undefined && datos.capacidadArbol.length !== arbol.nivelMax) {
			ctx.addIssue({
				code: "custom",
				path: ["capacidadArbol"],
				message: `se esperaban ${arbol.nivelMax} capacidades, una por nivel del Árbol`,
			});
		}
		const almacen = datos.edificios.find((e) => e.id === "almacen");
		if (
			almacen !== undefined &&
			datos.capacidadAlmacen.length !== almacen.nivelMax
		) {
			ctx.addIssue({
				code: "custom",
				path: ["capacidadAlmacen"],
				message: `se esperaban ${almacen.nivelMax} capacidades, una por nivel del Almacén`,
			});
		}

		for (const naturaleza of NATURALEZAS) {
			if (!(naturaleza in datos.comida.sabores)) {
				ctx.addIssue({
					code: "custom",
					path: ["comida", "sabores", naturaleza],
					message: `falta la naturaleza ${naturaleza}`,
				});
			}
		}

		// `multNivel` se indexa por nivel del edificio, no por plaza. El Árbol
		// Cenit llega a nivel 5 pero no produce, así que solo cuentan los
		// edificios con plazas, trabajo o producción.
		const niveles = datos.edificios
			.filter(
				(e) =>
					e.plazas.length > 0 ||
					e.trabajo !== undefined ||
					e.produce !== undefined,
			)
			.map((e) => e.nivelMax);
		const nivelMaximo = niveles.length > 0 ? Math.max(...niveles) : 0;
		if (datos.produccion.multNivel.length < nivelMaximo) {
			ctx.addIssue({
				code: "custom",
				path: ["produccion", "multNivel"],
				message: `faltan multiplicadores: hay edificios de nivel ${nivelMaximo}`,
			});
		}

		const { ancho, alto, zona } = datos.isla;
		if (
			ancho % zona !== 0 ||
			alto % zona !== 0 ||
			(ancho / zona) * (alto / zona) !== 12
		) {
			ctx.addIssue({
				code: "custom",
				path: ["isla"],
				message: "la isla debe repartirse en 12 zonas de `zona` x `zona`",
			});
		}
	});
export type SantuarioBalance = z.infer<typeof SantuarioBalanceSchema>;

// Tipos de loseta que puede pedir una receta de hábitat (GDD §11.7); son los
// mismos del estado del Santuario.
const tipoLoseta = z.enum([
	"yerma",
	"tierra",
	"pradera",
	"hierba-alta",
	"agua",
	"arena",
	"roca",
	"camino",
]);

// Objeto de loseta de una receta: los del estado más las decoraciones.
const objetoLoseta = z
	.string()
	.regex(
		/^(flor|arbol|tocon|farol-apagado|farol-encendido|fogata-encendida|decoracion:[a-z0-9]+(-[a-z0-9]+)*)$/,
	);

// Receta de una ventana de 3 x 3 losetas.
export const RecetaHabitatSchema = z
	.object({
		loseta: z.partialRecord(tipoLoseta, enteroPositivo).optional(),
		objetos: z.record(objetoLoseta, enteroPositivo).optional(),
		edificios: z.array(slug).min(1).optional(),
	})
	.strict();

/**
 * Un hábitat del pack (GDD §11.7). Las decoraciones que pide una receta pueden
 * no existir todavía en el balance: el juego las ignora hasta que lleguen.
 */
export const HabitatSchema = z
	.object({
		id: slug,
		// Claves i18n del nombre y de la pista del Libro de Hábitats.
		nombre: z.string().min(1),
		pista: z.string().min(1),
		receta: RecetaHabitatSchema,
		momento: z.enum(["dia", "noche"]),
		especies: z.array(slug).min(1),
		// Probabilidad por Alba de que llegue su visitante; 1 si falta.
		raro: z.number().min(0).max(1).optional(),
	})
	.strict();
export type Habitat = z.infer<typeof HabitatSchema>;

/**
 * Catálogo de hábitats del pack, en el orden en que se comprueban las recetas.
 * Una receta no puede pedir más de 9 losetas (no cabría en la ventana).
 */
export const HabitatsSchema = z
	.array(HabitatSchema)
	.min(1)
	.refine((a) => new Set(a.map((h) => h.id)).size === a.length, "ids repetidos")
	.superRefine((a, ctx) => {
		a.forEach((h, i) => {
			const losetas = Object.values(h.receta.loseta ?? {}).reduce(
				(suma, n) => suma + n,
				0,
			);
			const objetos = Object.values(h.receta.objetos ?? {}).reduce(
				(suma, n) => suma + n,
				0,
			);
			if (losetas + objetos > 9) {
				ctx.addIssue({
					code: "custom",
					path: [i, "receta"],
					message: `${h.id} pide más de 9 losetas y no cabe en 3 x 3`,
				});
			}
			if (losetas + objetos === 0 && (h.receta.edificios ?? []).length === 0) {
				ctx.addIssue({
					code: "custom",
					path: [i, "receta"],
					message: `${h.id} no pide nada`,
				});
			}
		});
	});
export type Habitats = z.infer<typeof HabitatsSchema>;
