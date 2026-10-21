import {
	alineacionAutomatica,
	conscientes,
	crearRng,
	curar,
	curarAlMasHerido,
	type EstadoExpedicion,
	esNodoDeCombate,
	type MiembroExp,
	modificadores,
	movimientosIniciales,
	type NodoMapa,
	type ResultadoCombate,
	recompensa,
	resolverCombate,
	type TablaFarol,
	type TablaNiveles,
	validarAlineacion,
} from "@santuario/core";
import type { Elites, ExpedicionBalance, SetCombate } from "@santuario/data";
import type { MiembroEquipo, TerrenoFisura } from "../combate.js";
import { conNivel, crearRival, type TamanosRival } from "./encuentros.js";
import { nivelesDelRival } from "./niveles.js";

/** Datos con los que el mapa abre la escena de combate de un nodo. */
export interface DatosCombate {
	estado: EstadoExpedicion;
	nodoId: string;
	/** Miembros que combaten, si el jugador los eligió (ver `OpcionesRivales.alineacion`). */
	alineacion?: number[];
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
	/**
	 * Posiciones del equipo que combaten (1 a 3, en orden). Sin ella entran los
	 * 3 primeros conscientes.
	 */
	alineacion?: readonly number[];
	/**
	 * Tabla de niveles del pack: si se da y el equipo del jugador trae niveles, el
	 * rival usa estos niveles en lugar de los de `niveles`.
	 */
	tablaNiveles?: TablaNiveles;
	/**
	 * Con `tablaNiveles`, los rivales comunes (salvaje, entrenador, Sombrío) usan los
	 * movimientos que su especie aprende hasta su nivel, igual que el jugador, en vez
	 * del set curado. El Alfa y el jefe conservan su set.
	 */
	movimientosPorNivel?: {
		aprendizaje: Readonly<
			Record<string, readonly { nivel: number; movimiento: string }[]>
		>;
		poder?: Readonly<Record<string, number>>;
	};
}

/** Terreno del primer bioma (Bosque Verdemar). */
const TERRENO_VERDEMAR: TerrenoFisura = "grassyterrain";

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

/** Con niveles en el equipo y tabla del pack, el rival sube a los niveles de la tabla. */
function conNivelesDeTabla(
	e: EstadoExpedicion,
	nodo: NodoMapa,
	rival: MiembroEquipo[],
	tabla: TablaNiveles | undefined,
	porNivel: OpcionesRivales["movimientosPorNivel"],
): MiembroEquipo[] {
	if (tabla === undefined || !e.equipo.some((m) => m.nivel !== undefined)) {
		return rival;
	}
	const niveles = nivelesDelRival(tabla, e.semilla, e.piso, nodo, rival.length);
	const comun =
		nodo.tipo === "salvaje" ||
		nodo.tipo === "entrenador" ||
		nodo.tipo === "sombrio";
	return rival.map((m, i) => {
		const nivel = niveles[i] as number;
		const lista = comun ? porNivel?.aprendizaje[m.especie] : undefined;
		if (lista === undefined || lista.length === 0) return { ...m, nivel };
		return {
			...m,
			nivel,
			movimientos: movimientosIniciales(lista, nivel, porNivel?.poder),
		};
	});
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
	const {
		setsRival = sets,
		tamanos,
		niveles,
		elites,
		alineacion,
		tablaNiveles,
		movimientosPorNivel,
	} = opciones;
	const nodo = buscarNodo(e, nodoId);
	const ps = e.equipo.map((m) => m.psPct);
	if (conscientes(ps).length === 0) {
		throw new RangeError("no queda ningún miembro vivo");
	}
	const vivos =
		alineacion === undefined
			? alineacionAutomatica(ps)
			: validarAlineacion(ps, alineacion);
	const jugador = vivos.map((i): MiembroEquipo => {
		const { especie, psPct, nivel, iv, naturaleza, movimientos } = e.equipo[
			i
		] as MiembroExp;
		const set = sets.find((s) => s.especie === especie);
		if (set === undefined) throw new RangeError(`sin set para ${especie}`);
		return {
			especie,
			set,
			psPct,
			...(nivel !== undefined && { nivel }),
			...(iv !== undefined && { iv }),
			...(naturaleza !== undefined && { naturaleza }),
			...(movimientos !== undefined &&
				movimientos.length > 0 && { movimientos }),
		};
	});
	return {
		semilla: `${e.semilla}:p${e.piso}:${nodoId}:combate`,
		jugador,
		rival: conNivelesDeTabla(
			e,
			nodo,
			rivalDe(e, nodo, setsRival, tamanos, niveles, elites),
			tablaNiveles,
			movimientosPorNivel,
		),
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
	farol?: TablaFarol,
): EstadoExpedicion {
	const siguiente = resolverCombate(e, resultado, farol);
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
