import type { Fabricar } from "@santuario/core";
import { type Especie, NATURALEZAS } from "@santuario/data";

/** Nivel con el que nace un residente mientras no haya Gimnasio ni niveles reales. */
const NIVEL_INICIAL = 8;
const ANIMO_INICIAL = 60;

/**
 * Fábrica de residentes para el núcleo: `Residente` completo a partir de los datos
 * de la especie y las Especialidades del pack. La naturaleza sale del `rng` que
 * da el núcleo (derivado de la semilla y del uid), así es determinista.
 */
export function crearFabrica(
	especies: readonly Especie[],
	especialidades: Readonly<Record<string, readonly string[]>>,
): Fabricar {
	return ({ especie, uid, origen, rng }) => {
		const datos = especies.find((e) => e.id === especie);
		if (datos === undefined) {
			throw new RangeError(`crearFabrica(): especie desconocida '${especie}'`);
		}
		return {
			uid,
			especie,
			naturaleza: NATURALEZAS[rng.entero(0, NATURALEZAS.length - 1)] as string,
			nivel: NIVEL_INICIAL,
			tipos: [...datos.tipos],
			preferidos: [...datos.trabajos],
			especialidades: Object.fromEntries(
				(especialidades[especie] ?? []).map((id) => [id, 1]),
			),
			usosEspecialidad: {},
			hambre: 100,
			animo: ANIMO_INICIAL,
			amistad: 0,
			estado: "descansado",
			tarea: { tipo: "nada" },
			zona: 0,
			origen,
			diasInquieto: 0,
			trabajoHoy: "ninguno",
			habloHoy: false,
			peticionCumplidaHoy: false,
		};
	};
}
