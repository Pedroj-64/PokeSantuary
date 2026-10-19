import { z } from "zod";

// Tipos de rival a los que se aplican las tablas de niveles (GDD §7.2).
const TIPOS_RIVAL = [
	"salvaje",
	"ecoComun",
	"ecoNombrado",
	"sombrio",
	"rival",
	"alfa",
	"jefe",
	"heraldo",
] as const;
const tipoRival = z.enum(TIPOS_RIVAL);

// Enteros sin signo; los valores concretos viven en el JSON del pack.
const enteroNoNegativo = z.number().int().min(0);
const enteroPositivo = z.number().int().min(1);

// Niveles base de los pisos 1, 2, 3 y 4 (Núcleo), estrictamente crecientes.
const basePorPiso = z
	.array(enteroPositivo)
	.length(4)
	.refine(
		(niveles) =>
			niveles.every((nivel, i) => i === 0 || nivel > (niveles[i - 1] ?? 0)),
		"basePorPiso debe ser estrictamente creciente",
	);

// Desplazamiento de nivel de cada tipo de rival: los 8 tipos son obligatorios.
const desplazamiento = z
	.object({
		salvaje: enteroNoNegativo,
		ecoComun: enteroNoNegativo,
		ecoNombrado: enteroNoNegativo,
		sombrio: enteroNoNegativo,
		rival: enteroNoNegativo,
		alfa: enteroNoNegativo,
		jefe: enteroNoNegativo,
		heraldo: enteroNoNegativo,
	})
	.strict();

// Desplazamiento extra del as: solo tipos conocidos y nunca menor que el normal.
const desplazamientoAs = z.partialRecord(tipoRival, enteroNoNegativo);

const nivel = z
	.object({
		basePorPiso,
		desplazamiento,
		desplazamientoAs,
		emboscada: enteroNoNegativo,
		salvajeExtra: enteroNoNegativo,
		porRangoFurioso: enteroNoNegativo,
	})
	.strict()
	.superRefine((datos, ctx) => {
		for (const tipo of TIPOS_RIVAL) {
			const as = datos.desplazamientoAs[tipo];
			if (as === undefined) continue;
			const normal = datos.desplazamiento[tipo];
			if (as < normal) {
				ctx.addIssue({
					code: "custom",
					path: ["desplazamientoAs", tipo],
					message: `el as de ${tipo} (${as}) no puede ser menor que su desplazamiento normal (${normal})`,
				});
			}
		}
	});

// Subida de nivel: [participantes, banquillo], con el banquillo sin superar al equipo.
const tuplaSubida = z
	.tuple([enteroNoNegativo, enteroNoNegativo])
	.refine(
		([participantes, banquillo]) => banquillo <= participantes,
		"el banquillo no puede superar a los participantes",
	);

// Subida por tipo de rival; el heraldo es el único opcional.
const porRival = z
	.object({
		salvaje: tuplaSubida,
		ecoComun: tuplaSubida,
		ecoNombrado: tuplaSubida,
		sombrio: tuplaSubida,
		rival: tuplaSubida,
		alfa: tuplaSubida,
		jefe: tuplaSubida,
		heraldo: tuplaSubida.optional(),
	})
	.strict();

const subida = z
	.object({
		porRival,
		umbralPonerseAlDia: enteroPositivo,
		extraPonerseAlDia: enteroNoNegativo,
		margenTope: enteroNoNegativo,
	})
	.strict();

// Nivel inicial de expedición a partir del nivel de gimnasio (GDD §7.2).
const gimnasio = z
	.object({
		base: enteroNoNegativo,
		porNivel: enteroNoNegativo,
		maximo: enteroPositivo,
		margenInicial: enteroNoNegativo,
	})
	.strict();

// Tablas de niveles y experiencia del pack, consumidas por core (GDD §7.2).
export const NivelesSchema = z
	.object({
		nivel,
		subida,
		gimnasio,
	})
	.strict();
export type Niveles = z.infer<typeof NivelesSchema>;
