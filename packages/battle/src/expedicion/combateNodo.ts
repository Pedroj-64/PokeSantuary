import {
	crearRng,
	curarAlMasHerido,
	type EstadoExpedicion,
	esNodoDeCombate,
	modificadores,
	type NodoMapa,
	type ResultadoCombate,
	recompensa,
	resolverCombate,
} from "@santuario/core";
import type { ExpedicionBalance, SetCombate } from "@santuario/data";
import type { MiembroEquipo } from "../combate.js";
import { crearRival } from "./encuentros.js";

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
}

/** El motor de combate admite hasta 3 por bando: entran los 3 primeros vivos del equipo. */
const MAX_EN_COMBATE = 3;

function buscarNodo(e: EstadoExpedicion, id: string): NodoMapa {
	const nodo = e.mapa.capas.flat().find((n) => n.id === id);
	if (nodo === undefined || !esNodoDeCombate(nodo.tipo)) {
		throw new RangeError(`el nodo ${id} no existe o no es de combate`);
	}
	return nodo;
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
): PreparacionCombate {
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
		rival: crearRival(
			e.semilla,
			e.piso,
			nodo,
			sets,
			e.equipo.map((m) => m.especie),
		),
		vivos,
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
 * Aplica `resolverCombate` y, si se ganó y la expedición sigue, la cura de las
 * runas (la del más herido).
 */
export function cerrarCombate(
	e: EstadoExpedicion,
	resultado: ResultadoCombate,
): EstadoExpedicion {
	const siguiente = resolverCombate(e, resultado);
	return resultado.victoria && siguiente.estado === "en-curso"
		? curarAlMasHerido(siguiente, modificadores(e.runas).curaPostCombatePct)
		: siguiente;
}

/** Pantalla que sigue a un combate resuelto. */
export function destinoTrasCombate(
	e: EstadoExpedicion,
): "Mapa" | "FinExpedicion" {
	return e.estado === "en-curso" ? "Mapa" : "FinExpedicion";
}
