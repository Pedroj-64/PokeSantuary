import {
	generarPiso,
	type MapaPiso,
	type NodoMapa,
	type TipoNodo,
} from "./mapa.js";
import type { Mochila } from "./mochila.js";
import type { IdRuna } from "./runas.js";

/** Miembro del equipo durante la expedición; `psPct` 0 significa debilitado. */
export interface MiembroExp {
	especie: string;
	/** PS en porcentaje, entero de 0 a 100. */
	psPct: number;
}

/** Estado completo de una expedición; ninguna función lo muta. */
export interface EstadoExpedicion {
	semilla: string;
	piso: 1 | 2 | 3;
	mapa: MapaPiso;
	/** Id del nodo en el que está; null si aún no ha entrado en el piso. */
	actual: string | null;
	visitados: string[];
	/** De 1 a 6 miembros. */
	equipo: MiembroExp[];
	/** Dinero acumulado, entero mayor o igual que 0. */
	dinero: number;
	/** Runas de la mochila, sin repetir (máximo `MAX_RUNAS`). */
	runas: IdRuna[];
	/** Bolas, bayas y demás artículos comprados, por id. */
	mochila: Mochila;
	estado: "en-curso" | "victoria" | "derrota";
}

/** Resultado de un combate: `psPct` va en el orden del equipo. */
export interface ResultadoCombate {
	victoria: boolean;
	psPct: number[];
	dinero: number;
}

const MIN_EQUIPO = 1;
const MAX_EQUIPO = 6;
const PS_MAX = 100;

/** Tipos de nodo en los que se puede librar un combate. */
const TIPOS_COMBATE: readonly TipoNodo[] = [
	"salvaje",
	"entrenador",
	"alfa",
	"sombrio",
	"jefe",
];

/** ¿El tipo de nodo se resuelve con un combate? */
export function esNodoDeCombate(tipo: TipoNodo): boolean {
	return TIPOS_COMBATE.includes(tipo);
}

/** Busca un nodo por id en el mapa; undefined si no existe. */
function buscarNodo(mapa: MapaPiso, id: string): NodoMapa | undefined {
	for (const capa of mapa.capas) {
		for (const nodo of capa) {
			if (nodo.id === id) return nodo;
		}
	}
	return undefined;
}

/** Acota un porcentaje de PS a un entero de 0 a 100. */
function acotarPs(psPct: number): number {
	return Math.min(PS_MAX, Math.max(0, Math.round(psPct)));
}

/**
 * Arranca una expedición en el piso 1 con el equipo a plena salud.
 *
 * @param semilla Semilla de la partida; define los tres mapas.
 * @param especies Especies del equipo (de 1 a 6); no se guarda una referencia.
 * @throws {RangeError} Si el equipo no tiene entre 1 y 6 miembros.
 */
export function iniciarExpedicion(
	semilla: string,
	especies: string[],
): EstadoExpedicion {
	if (
		!Array.isArray(especies) ||
		especies.length < MIN_EQUIPO ||
		especies.length > MAX_EQUIPO
	) {
		throw new RangeError(
			`iniciarExpedicion(): el equipo debe tener entre ${MIN_EQUIPO} y ${MAX_EQUIPO} especies (recibidas ${especies.length})`,
		);
	}
	return {
		semilla,
		piso: 1,
		mapa: generarPiso(semilla, 1),
		actual: null,
		visitados: [],
		equipo: especies.map((especie) => ({ especie, psPct: PS_MAX })),
		dinero: 0,
		runas: [],
		mochila: {},
		estado: "en-curso",
	};
}

/**
 * Nodos a los que se puede entrar desde donde está la expedición: la capa 0 si
 * todavía no ha entrado en el piso, o los `siguientes` del nodo actual.
 *
 * @returns Ids elegibles; arreglo vacío si la expedición ya terminó.
 */
export function elegibles(e: EstadoExpedicion): string[] {
	if (e.estado !== "en-curso") return [];
	if (e.actual === null) {
		return (e.mapa.capas[0] ?? []).map((nodo) => nodo.id);
	}
	const nodo = buscarNodo(e.mapa, e.actual);
	return nodo === undefined ? [] : [...nodo.siguientes];
}

/**
 * Entra en un nodo del mapa.
 *
 * @param id Id del nodo, que debe estar entre los {@link elegibles}.
 * @throws {RangeError} Si el nodo no es elegible desde el estado actual.
 */
export function entrar(e: EstadoExpedicion, id: string): EstadoExpedicion {
	if (!elegibles(e).includes(id)) {
		throw new RangeError(
			`entrar(${id}): el nodo no es elegible desde ${e.actual ?? "la entrada"}`,
		);
	}
	return { ...e, actual: id, visitados: [...e.visitados, id] };
}

/**
 * Aplica el resultado de un combate: PS acotados, dinero sumado y transición de
 * estado. Si hay victoria contra el jefe de un piso menor que 3, pasa al piso
 * siguiente con mapa nuevo, entrada limpia y visitados vacíos; contra el jefe
 * del piso 3, la expedición termina en victoria.
 *
 * @throws {RangeError} Si la expedición ya terminó, si el nodo actual no es de
 * combate o si `r.psPct` no tiene una entrada por miembro del equipo.
 */
export function resolverCombate(
	e: EstadoExpedicion,
	r: ResultadoCombate,
): EstadoExpedicion {
	if (e.estado !== "en-curso") {
		throw new RangeError(
			`resolverCombate(): la expedición ya terminó (${e.estado})`,
		);
	}
	const nodo = e.actual === null ? undefined : buscarNodo(e.mapa, e.actual);
	if (nodo === undefined || !esNodoDeCombate(nodo.tipo)) {
		throw new RangeError(
			`resolverCombate(): el nodo actual (${e.actual ?? "ninguno"}) no es de combate`,
		);
	}
	if (!Array.isArray(r.psPct) || r.psPct.length !== e.equipo.length) {
		throw new RangeError(
			`resolverCombate(): se esperaban ${e.equipo.length} valores de psPct (recibidos ${Array.isArray(r.psPct) ? r.psPct.length : "ninguno"})`,
		);
	}
	for (const psPct of r.psPct) {
		if (!Number.isFinite(psPct)) {
			throw new RangeError(
				`resolverCombate(): 'psPct' solo admite números (recibido ${String(psPct)})`,
			);
		}
	}
	if (!Number.isFinite(r.dinero)) {
		throw new RangeError(
			`resolverCombate(): 'dinero' debe ser un número (recibido ${String(r.dinero)})`,
		);
	}

	const equipo: MiembroExp[] = e.equipo.map((miembro, i) => ({
		...miembro,
		psPct: acotarPs(r.psPct[i] ?? 0),
	}));
	const dinero = Math.max(0, e.dinero + Math.round(r.dinero));
	if (!r.victoria || equipo.every((miembro) => miembro.psPct === 0)) {
		return { ...e, equipo, dinero, estado: "derrota" };
	}
	if (nodo.tipo !== "jefe") {
		return { ...e, equipo, dinero };
	}
	if (e.piso === 3) {
		return { ...e, equipo, dinero, estado: "victoria" };
	}
	const piso: 1 | 2 | 3 = e.piso === 1 ? 2 : 3;
	return {
		...e,
		piso,
		mapa: generarPiso(e.semilla, piso),
		actual: null,
		visitados: [],
		equipo,
		dinero,
	};
}

/**
 * Cura `pct` puntos de PS a cada miembro vivo (los debilitados siguen a 0), sin
 * pasar de 100.
 *
 * @throws {RangeError} Si `pct` no es un entero de 1 a 100.
 */
export function curar(e: EstadoExpedicion, pct: number): EstadoExpedicion {
	if (!Number.isInteger(pct) || pct < 1 || pct > PS_MAX) {
		throw new RangeError(
			`curar(${pct}): 'pct' debe ser un entero entre 1 y ${PS_MAX}`,
		);
	}
	return {
		...e,
		equipo: e.equipo.map((miembro) => ({
			...miembro,
			psPct:
				miembro.psPct > 0
					? Math.min(PS_MAX, miembro.psPct + pct)
					: miembro.psPct,
		})),
	};
}

/**
 * Cura `pct` puntos al miembro vivo con menos PS (el primero si empatan), sin
 * pasar de 100; si no queda nadie vivo no cambia nada.
 *
 * @throws {RangeError} Si `pct` no es un entero de 0 a 100.
 */
export function curarAlMasHerido(
	e: EstadoExpedicion,
	pct: number,
): EstadoExpedicion {
	if (!Number.isInteger(pct) || pct < 0 || pct > PS_MAX) {
		throw new RangeError(
			`curarAlMasHerido(${pct}): 'pct' debe ser un entero entre 0 y ${PS_MAX}`,
		);
	}
	let objetivo = -1;
	e.equipo.forEach((m, i) => {
		const actual = e.equipo[objetivo];
		if (m.psPct > 0 && (actual === undefined || m.psPct < actual.psPct))
			objetivo = i;
	});
	if (objetivo === -1 || pct === 0) return e;
	return {
		...e,
		equipo: e.equipo.map((m, i) =>
			i === objetivo ? { ...m, psPct: Math.min(PS_MAX, m.psPct + pct) } : m,
		),
	};
}

/**
 * Dinero que se conserva al cerrar la expedición: todo en victoria y la mitad
 * hacia abajo en derrota.
 *
 * @throws {RangeError} Si la expedición sigue en curso.
 */
export function liquidar(e: EstadoExpedicion): { dineroConservado: number } {
	if (e.estado === "en-curso") {
		throw new RangeError("liquidar(): la expedición sigue en curso");
	}
	return {
		dineroConservado:
			e.estado === "victoria" ? e.dinero : Math.floor(e.dinero * 0.5),
	};
}
