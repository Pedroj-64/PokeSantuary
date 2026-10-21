import {
	type EstadoPartida,
	type MapaPiso,
	VERSION_PARTIDA,
	validarMapa,
} from "@santuario/core";
import { z } from "zod";
import type { Opciones } from "./sobre.js";

const entero = z.number().int();
const noNegativo = z.number().int().min(0);
const porcentaje = z.number().int().min(0).max(100);
const slug = z.string().min(1);

const Sabor = z.enum(["picante", "seco", "dulce", "amargo", "acido", "neutro"]);
const TipoLoseta = z.enum([
	"yerma",
	"tierra",
	"pradera",
	"hierba-alta",
	"agua",
	"arena",
	"roca",
	"camino",
]);

const Tarea = z.discriminatedUnion("tipo", [
	z.object({ tipo: z.literal("nada") }).strict(),
	z.object({ tipo: z.literal("trabajo"), edificio: slug }).strict(),
	z.object({ tipo: z.literal("construir"), edificio: slug }).strict(),
	z.object({ tipo: z.literal("cuidador") }).strict(),
	z
		.object({
			tipo: z.literal("especialidad"),
			accion: slug,
			x: entero,
			y: entero,
		})
		.strict(),
]);

const Residente = z
	.object({
		uid: slug,
		especie: slug,
		mote: z.string().optional(),
		naturaleza: slug,
		nivel: z.number().int().min(1),
		tipos: z.array(slug),
		preferidos: z.array(slug),
		especialidades: z.record(slug, z.number().int().min(1).max(3)),
		usosEspecialidad: z.record(slug, noNegativo),
		hambre: z.number().min(0).max(100),
		animo: z.number().min(0).max(100),
		amistad: z.number().int().min(0).max(5),
		movimientos: z.array(slug).max(4).optional(),
		recordables: z.array(slug).optional(),
		estado: z.enum(["descansado", "agotado", "sombrio", "visitante"]),
		sombrio: z.number().min(0).max(100).optional(),
		tarea: Tarea,
		lecho: slug.optional(),
		zona: z.number().int().min(0).max(11),
		origen: z.enum(["captura", "rescate", "habitat", "huevo", "eco"]),
		diasInquieto: noNegativo,
		visitanteRestante: entero.optional(),
		habitat: slug.optional(),
		trabajoHoy: z.enum(["preferido", "no-preferido", "ninguno"]),
		habloHoy: z.boolean(),
		peticionCumplidaHoy: z.boolean(),
	})
	.strict();

const Edificio = z
	.object({
		uid: slug,
		tipo: slug,
		x: noNegativo,
		y: noNegativo,
		nivel: z.number().int().min(1),
		obraRestante: noNegativo,
		resto: z.record(z.string(), z.number().min(0)),
		variedad: Sabor.optional(),
	})
	.strict();

const Loseta = z
	.object({
		tipo: TipoLoseta,
		objeto: z.string().optional(),
		edad: noNegativo,
		humedad: z.boolean(),
		encendido: z.boolean(),
	})
	.strict();

const Terreno = z
	.object({
		ancho: z.number().int().positive(),
		alto: z.number().int().positive(),
		losetas: z.array(Loseta),
	})
	.strict()
	.refine((t) => t.losetas.length === t.ancho * t.alto, {
		message: "el terreno no tiene ancho × alto losetas",
	});

const Santuario = z
	.object({
		semilla: z.string(),
		jornada: z.number().int().min(1),
		momento: z.enum(["alba", "dia", "atardecer", "noche"]),
		recursos: z.record(z.string(), noNegativo),
		residentes: z.array(Residente),
		edificios: z.array(Edificio),
		terreno: Terreno,
		armonia: z.number().min(0).max(100),
		temaCharla: z
			.enum(["animo", "trabajo", "valor", "calma", "cuidado", "raices"])
			.optional(),
		accionesMarcadas: z.array(
			z
				.object({
					uid: slug,
					accion: slug,
					x: noNegativo,
					y: noNegativo,
					orden: noNegativo,
				})
				.strict(),
		),
		habitatsCompletos: z.array(
			z.object({ id: slug, x: noNegativo, y: noNegativo }).strict(),
		),
		habitatsDescubiertos: z.array(slug),
		habitatsPendientes: z.array(slug),
		vistas: z.array(slug),
		siguienteUid: z.number().int().min(1),
		nivelGimnasio: z.number().int().min(0).max(5).optional(),
		codigos: z
			.record(z.string().regex(/^[1-9][0-9]*$/), z.enum(["A", "B"]))
			.optional(),
		ceremonias: z
			.object({
				"festin-bayas": z.number().int().min(1).optional(),
				"fogata-ascuas": z.number().int().min(1).optional(),
				"bendicion-viajero": z.number().int().min(1).optional(),
				purificacion: z.number().int().min(1).optional(),
			})
			.strict()
			.optional(),
		bendicionViajero: z.boolean().optional(),
	})
	.strict()
	.superRefine((s, ctx) => {
		const uids = s.residentes.map((r) => r.uid);
		if (new Set(uids).size !== uids.length)
			ctx.addIssue({ code: "custom", message: "uid de residente repetido" });
		const edificios = s.edificios.map((e) => e.uid);
		if (new Set(edificios).size !== edificios.length)
			ctx.addIssue({ code: "custom", message: "uid de edificio repetido" });
	});

const Mapa = z.custom<MapaPiso>((v) => {
	try {
		return validarMapa(v as MapaPiso).length === 0;
	} catch {
		return false;
	}
}, "mapa de expedición inválido");

const iv31 = z.number().int().min(0).max(31);

const Expedicion = z
	.object({
		semilla: z.string(),
		piso: z.union([z.literal(1), z.literal(2), z.literal(3)]),
		mapa: Mapa,
		actual: z.string().nullable(),
		visitados: z.array(z.string()),
		equipo: z
			.array(
				z
					.object({
						uid: slug.optional(),
						especie: slug,
						psPct: porcentaje,
						nivel: z.number().int().min(1).max(100).optional(),
						iv: z
							.object({
								hp: iv31,
								atk: iv31,
								def: iv31,
								spa: iv31,
								spd: iv31,
								spe: iv31,
							})
							.strict()
							.optional(),
						naturaleza: slug.optional(),
						movimientos: z.array(slug).max(4).optional(),
						recordables: z.array(slug).optional(),
						pendientesMovimiento: z.array(slug).optional(),
						amistad: z.number().int().min(0).max(5).optional(),
					})
					.strict(),
			)
			.min(1)
			.max(6),
		dinero: noNegativo,
		runas: z.array(z.enum(["A", "C", "F", "S", "?"])).max(5),
		mochila: z.record(z.string(), noNegativo),
		pendientesPurificar: z.array(slug),
		estado: z.enum(["en-curso", "victoria", "derrota"]),
		llamas: noNegativo.optional(),
		fallidos: z.array(z.string()).optional(),
		repetir: z.string().optional(),
	})
	.strict();

/** Esquema de la partida entera; estricto, así un campo nuevo sin esquema falla en las pruebas. */
export const PartidaSchema = z
	.object({
		version: z.number().int().min(1),
		santuario: Santuario,
		expedicion: Expedicion.optional(),
		expedicionJornada: z.number().int().min(1).optional(),
		pendientesDeSitio: z.array(slug),
	})
	.strict();

/**
 * `migraciones[n]` convierte una partida de la versión n a la n+1. Vacío mientras
 * solo exista la versión 1: la primera migración llega con el primer cambio de formato.
 */
export const MIGRACIONES: Opciones<EstadoPartida>["migraciones"] = {};

/** Opciones para leer una partida guardada con `desempaquetar`. */
export const opcionesPartida: Opciones<EstadoPartida> = {
	versionActual: VERSION_PARTIDA,
	migraciones: MIGRACIONES,
	validar: (x) => PartidaSchema.parse(x) as EstadoPartida,
};
