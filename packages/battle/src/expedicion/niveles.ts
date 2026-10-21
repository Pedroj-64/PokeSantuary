import {
	crearRng,
	type NodoMapa,
	nivelRival,
	type TablaNiveles,
	type TipoNodo,
	type TipoRival,
} from "@santuario/core";

/** Tipo de rival (tabla de niveles) de cada nodo de combate del mapa. */
const RIVAL_POR_NODO: Readonly<Partial<Record<TipoNodo, TipoRival>>> = {
	salvaje: "salvaje",
	entrenador: "rival",
	alfa: "alfa",
	sombrio: "sombrio",
	jefe: "jefe",
};

/**
 * Traduce un nodo de combate a su `TipoRival`.
 *
 * @throws {RangeError} Si el nodo no es de combate.
 */
export function tipoRivalDeNodo(tipo: TipoNodo): TipoRival {
	const rival = RIVAL_POR_NODO[tipo];
	if (rival === undefined) {
		throw new RangeError(
			`tipoRivalDeNodo(): '${tipo}' no es un nodo de combate`,
		);
	}
	return rival;
}

/**
 * Niveles del equipo rival de un nodo según `niveles.json`. En el jefe, el último
 * del equipo es el "as" (nivel más alto). Determinista por semilla, piso y nodo.
 */
export function nivelesDelRival(
	tabla: TablaNiveles,
	semilla: string,
	piso: 1 | 2 | 3,
	nodo: NodoMapa,
	tamano: number,
): number[] {
	const tipo = tipoRivalDeNodo(nodo.tipo);
	const rng = crearRng(`${semilla}:p${piso}:${nodo.id}:nivelRival`);
	return Array.from({ length: tamano }, (_, i) =>
		nivelRival(
			tabla,
			{ tipo, piso, as: tipo === "jefe" && i === tamano - 1 },
			rng,
		),
	);
}

/** Nivel del as del jefe del piso: el tope de subida de los niveles del equipo. */
export function techoDelPiso(tabla: TablaNiveles, piso: 1 | 2 | 3): number {
	return nivelRival(tabla, { tipo: "jefe", piso, as: true }, crearRng("techo"));
}
