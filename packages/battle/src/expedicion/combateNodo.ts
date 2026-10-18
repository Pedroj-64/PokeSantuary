import {
	crearRng,
	curar,
	curarAlMasHerido,
	type EstadoExpedicion,
	esNodoDeCombate,
	modificadores,
	type NodoMapa,
	type ResultadoCombate,
	recompensa,
	resolverCombate,
} from "@santuario/core";
import type { Elites, ExpedicionBalance, SetCombate } from "@santuario/data";
import type { MiembroEquipo, TerrenoFisura } from "../combate.js";
import { conNivel, crearRival, type TamanosRival } from "./encuentros.js";

/** Datos con los que el mapa abre la escena de combate de un nodo. */
export interface DatosCombate {
	estado: EstadoExpedicion;
	nodoId: string;
}

/** Lo que necesita `abrirCombate` para el combate de un nodo, y qué miembros del equipo entran. */
export interface PreparacionCombate {
	semilla: string;
	jugador: MiembroEquipo[];
	rival: MiembroEquipo[];
	/** Posiciones, dentro de `estado.equipo`, de los miembros que entran (los vivos). */
	vivos: number[];
	/** Condición de fisura del bioma: solo el jefe del último piso la lleva. */
	terreno?: TerrenoFisura;
}

/** Con qué se arman los rivales de un nodo; todo es opcional. */
export interface OpcionesRivales {
	/** Catálogo de rivales corrientes; por defecto, el del jugador. */
	setsRival?: readonly SetCombate[];
	/** Tamaño del equipo rival por tipo de nodo y piso. */
	tamanos?: TamanosRival;
	/** Nivel del rival por tipo de nodo y piso. */
	niveles?: TamanosRival;
	/** Alfa y jefe del bioma; sin ellos, esos nodos usan el catálogo corriente. */
	elites?: Elites;
}

/** Terreno del primer bioma (Bosque Verdemar). */
const TERRENO_VERDEMAR: TerrenoFisura = "grassyterrain";

/** El motor de combate admite hasta 3 por bando: entran los 3 primeros vivos del equipo. */
const MAX_EN_COMBATE = 3;

function buscarNodo(e: EstadoExpedicion, id: string): NodoMapa {
	const nodo = e.mapa.capas.flat().find((n) => n.id === id);
	if (nodo === undefined || !esNodoDeCombate(nodo.tipo)) {
		throw new RangeError(`el nodo ${id} no existe o no es de combate`);
	}
	return nodo;
}

/** Rival del nodo: el jefe del piso 3 y los Alfa salen de las élites si las hay. */
function rivalDe(
	e: EstadoExpedicion,
	nodo: NodoMapa,
	setsRival: readonly SetCombate[],
	tamanos: TamanosRival | undefined,
	niveles: TamanosRival | undefined,
	elites: Elites | undefined,
): MiembroEquipo[] {
	const propios = e.equipo.map((m) => m.especie);
	if (elites !== undefined && nodo.tipo === "jefe" && e.piso === 3) {
		return elites.jefe.equipo.map((set) =>
			conNivel({ especie: set.especie, set }, nodo.tipo, e.piso, niveles),
		);
	}
	const catalogo =
		elites !== undefined && nodo.tipo === "alfa" ? elites.alfas : setsRival;
	return crearRival(
		e.semilla,
		e.piso,
		nodo,
		catalogo,
		propios,
		tamanos,
		niveles,
	);
}

/**
 * Equipos y semilla del combate de un nodo. Los debilitados se quedan fuera, el
 * resto entra con los PS que arrastra y el rival sale de `crearRival`. La semilla
 * depende solo de la expedición, el piso y el nodo.
 *
 * @throws {RangeError} Si el nodo no es de combate, no queda nadie vivo o falta el set de una especie.
 */
export function prepararCombate(
	e: EstadoExpedicion,
	nodoId: string,
	sets: readonly SetCombate[],
	opciones: OpcionesRivales = {},
): PreparacionCombate {
	const { setsRival = sets, tamanos, niveles, elites } = opciones;
	const nodo = buscarNodo(e, nodoId);
	const vivos = e.equipo
		.flatMap((m, i) => (m.psPct > 0 ? [i] : []))
		.slice(0, MAX_EN_COMBATE);
	if (vivos.length === 0) throw new RangeError("no queda ningún miembro vivo");
	const jugador = vivos.map((i): MiembroEquipo => {
		const { especie, psPct } = e.equipo[i] as {
			especie: string;
			psPct: number;
		};
		const set = sets.find((s) => s.especie === especie);
		if (set === undefined) throw new RangeError(`sin set para ${especie}`);
		return { especie, set, psPct };
	});
	return {
		semilla: `${e.semilla}:p${e.piso}:${nodoId}:combate`,
		jugador,
		rival: rivalDe(e, nodo, setsRival, tamanos, niveles, elites),
		vivos,
		...(nodo.tipo === "jefe" && e.piso === 3 && { terreno: TERRENO_VERDEMAR }),
	};
}

/**
 * Traduce el final de un combate al resultado que espera `resolverCombate`:
 * los PS finales vuelven a su sitio del equipo completo (los que no entraron
 * conservan los suyos) y solo una victoria da dinero.
 *
 * @throws {RangeError} Si los PS finales no son uno por cada miembro que entró.
 */
export function resultadoDeCombate(
	e: EstadoExpedicion,
	vivos: readonly number[],
	ganador: "jugador" | "rival" | "empate",
	equipoFinal: readonly { psPct: number }[],
	dinero: number,
	rival?: string,
): ResultadoCombate {
	if (equipoFinal.length !== vivos.length) {
		throw new RangeError(
			`se esperaban ${vivos.length} valores de PS finales y llegaron ${equipoFinal.length}`,
		);
	}
	// Los que no entran (debilitados o en el banquillo) conservan sus PS.
	const psPct = e.equipo.map((m) => m.psPct);
	vivos.forEach((posicion, k) => {
		psPct[posicion] = (equipoFinal[k] as { psPct: number }).psPct;
	});
	const victoria = ganador === "jugador";
	return {
		victoria,
		psPct,
		dinero: victoria ? dinero : 0,
		...(rival !== undefined && rival !== "" && { rival }),
	};
}

/** Dinero que suelta el combate de un nodo; determinista por expedición, piso y nodo. */
export function dineroDeNodo(
	balance: ExpedicionBalance,
	e: EstadoExpedicion,
	nodoId: string,
): number {
	const nodo = buscarNodo(e, nodoId);
	const base = recompensa(
		balance.recompensa,
		nodo.tipo,
		e.piso,
		crearRng(`${e.semilla}:p${e.piso}:${nodoId}:dinero`),
	);
	return Math.round(base * modificadores(e.runas).multDinero);
}

/**
 * Aplica `resolverCombate` y, si se ganó y la expedición sigue, la cura del
 * balance para todo el equipo y la de las runas (la del más herido).
 */
export function cerrarCombate(
	e: EstadoExpedicion,
	resultado: ResultadoCombate,
	curaTrasVictoriaPct = 0,
): EstadoExpedicion {
	const siguiente = resolverCombate(e, resultado);
	if (!resultado.victoria || siguiente.estado !== "en-curso") return siguiente;
	const curado =
		curaTrasVictoriaPct > 0 ? curar(siguiente, curaTrasVictoriaPct) : siguiente;
	return curarAlMasHerido(curado, modificadores(e.runas).curaPostCombatePct);
}

/** Pantalla que sigue a un combate resuelto. */
export function destinoTrasCombate(
	e: EstadoExpedicion,
): "Mapa" | "FinExpedicion" {
	return e.estado === "en-curso" ? "Mapa" : "FinExpedicion";
}
