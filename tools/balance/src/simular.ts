import {
	cerrarCombate,
	dineroDeNodo,
	expedicionInicial,
	type Peticion,
	prepararCombate,
	resultadoDeCombate,
} from "@santuario/battle";
import { SesionCombate } from "@santuario/battle/servidor";
import {
	aplicarEfecto,
	comprarArticulo,
	crearRng,
	type EstadoExpedicion,
	elegibles,
	elegirEvento,
	entrar,
	esNodoDeCombate,
	precioEnPiso,
	type ResultadoCombate,
	totalBayas,
	usarBayaAlMasHerido,
} from "@santuario/core";
import type {
	Elites,
	Evento,
	ExpedicionBalance,
	SetCombate,
} from "@santuario/data";
import {
	contextoDeProgresion,
	equipoConNiveles,
	type ProgresionSimulacion,
	setsConEvoluciones,
	trasVictoria,
} from "./niveles.js";

/** Tope de turnos de un combate: pasado, se da por perdido (nadie hace daño). */
const MAX_TURNOS = 300;

/** Con menos PS medios que esto el equipo busca manantial o tienda. */
const UMBRAL_CURA = 75;
/** Un miembro con estos PS o menos recibe una baya. */
const UMBRAL_BAYA = 50;
const MAX_BAYAS_POR_TIENDA = 3;

/** Datos de la partida simulada. */
export interface DatosSimulacion {
	/** Sets del jugador (y de los rivales, si no se da `setsRival`). */
	sets: readonly SetCombate[];
	setsRival?: readonly SetCombate[];
	balance: ExpedicionBalance;
	eventos: readonly Evento[];
	elites?: Elites;
	/**
	 * Datos de progresión. Si falta, el simulador se comporta como siempre:
	 * los miembros combaten sin nivel ni movimientos propios.
	 */
	progresion?: ProgresionSimulacion;
}

export interface ResumenSimulacion {
	victorias: number;
	total: number;
	/** victorias / total; 0 si no hay semillas. */
	tasa: number;
	/** Expediciones perdidas en el piso 1, 2 y 3. */
	muertesPorPiso: [number, number, number];
	/**
	 * Nivel medio del equipo consciente justo antes del jefe de cada piso,
	 * promediado sobre las expediciones que llegaron (0 si no llegó ninguna).
	 * Solo existe con progresión.
	 */
	nivelMedioAlJefe?: [number, number, number];
}

/**
 * Política fija: el primer movimiento con PP y, al cambiar (a la fuerza o si
 * no queda ningún movimiento), el primer compañero vivo.
 */
function elegirJugada(p: Peticion) {
	if (p.tipo === "movimiento") {
		const indice = p.movimientos.findIndex((m) => !m.deshabilitado);
		if (indice >= 0) return { tipo: "movimiento", indice } as const;
	}
	const indice = p.equipo.findIndex((m) => !m.activo && !m.debilitado);
	return { tipo: "cambio", indice } as const;
}

/**
 * Juega un combate de nodo hasta el final. Devuelve también los índices del
 * equipo que entraron, que son los participantes de la progresión.
 */
async function jugarCombate(
	e: EstadoExpedicion,
	nodoId: string,
	datos: DatosSimulacion,
): Promise<{ resultado: ResultadoCombate; vivos: number[] }> {
	// Con progresión puede haber especies evolucionadas sin set propio en el
	// pack; se les presta el de su especie base. El rival usa siempre el
	// catálogo original.
	const sets =
		datos.progresion === undefined
			? datos.sets
			: setsConEvoluciones(datos.sets, e.equipo, datos.progresion.evoluciones);
	const prep = prepararCombate(e, nodoId, sets, {
		setsRival: datos.setsRival ?? datos.sets,
		tamanos: datos.balance.tamanoRival,
		niveles: datos.balance.nivelRival,
		elites: datos.elites,
	});
	const sesion = new SesionCombate();
	let r = await sesion.abrir({
		semilla: prep.semilla,
		jugador: prep.jugador,
		rival: prep.rival,
		terreno: prep.terreno,
	});
	for (let turno = 0; r.terminado === null; turno++) {
		if (turno >= MAX_TURNOS || r.peticion === null) {
			return {
				resultado: {
					victoria: false,
					psPct: e.equipo.map(() => 0),
					dinero: 0,
				},
				vivos: prep.vivos,
			};
		}
		r = await sesion.elegirJugador(elegirJugada(r.peticion));
	}
	return {
		resultado: resultadoDeCombate(
			e,
			prep.vivos,
			r.terminado,
			r.equipoFinal ?? [],
			dineroDeNodo(datos.balance, e, nodoId),
		),
		vivos: prep.vivos,
	};
}

/** Resuelve un nodo de elección con la primera opción, sin combates ni cambio de runas. */
function resolverEleccion(
	e: EstadoExpedicion,
	nodoId: string,
	tipo: "manantial" | "cofre" | "evento",
	datos: DatosSimulacion,
): EstadoExpedicion {
	const evento = elegirEvento(datos.eventos, e.semilla, e.piso, nodoId, tipo);
	const rng = crearRng(`${e.semilla}:p${e.piso}:${nodoId}:efecto:0`);
	let estado = e;
	for (const efecto of evento.opciones[0]?.efectos ?? []) {
		if (efecto.tipo === "combate") break;
		estado = aplicarEfecto(estado, efecto, rng).estado;
	}
	return estado;
}

/** PS medios del equipo vivo, en porcentaje. */
function saludMedia(e: EstadoExpedicion): number {
	const vivos = e.equipo.filter((m) => m.psPct > 0);
	return vivos.length === 0
		? 0
		: vivos.reduce((n, m) => n + m.psPct, 0) / vivos.length;
}

/** Con el equipo tocado prefiere curarse (manantial, tienda); si no, ruta al azar. */
function elegirRuta(
	e: EstadoExpedicion,
	opciones: string[],
	azar: () => number,
): string {
	const tipoDe = (id: string) =>
		e.mapa.capas.flat().find((n) => n.id === id)?.tipo;
	if (saludMedia(e) < UMBRAL_CURA) {
		for (const tipo of ["manantial", "tienda"] as const) {
			const id = opciones.find((o) => tipoDe(o) === tipo);
			if (id !== undefined) return id;
		}
	}
	return opciones[azar()] as string;
}

/** Compra bayas mientras alcance el dinero (las más grandes primero), hasta un tope. */
function comprarBayas(
	e: EstadoExpedicion,
	datos: DatosSimulacion,
): EstadoExpedicion {
	const bayas = datos.balance.catalogoTienda
		.filter((a) => a.tipo === "baya")
		.sort((a, b) => b.precio - a.precio);
	let estado = e;
	for (let n = 0; n < MAX_BAYAS_POR_TIENDA; n++) {
		const baya = bayas.find(
			(b) => precioEnPiso(b.precio, estado.piso) <= estado.dinero,
		);
		if (baya === undefined) break;
		estado = comprarArticulo(estado, baya);
	}
	return estado;
}

/** Usa bayas mientras el más herido esté por debajo del umbral y queden. */
function curarConBayas(e: EstadoExpedicion): EstadoExpedicion {
	let estado = e;
	while (totalBayas(estado) > 0) {
		const vivos = estado.equipo.filter((m) => m.psPct > 0);
		if (!vivos.some((m) => m.psPct <= UMBRAL_BAYA)) break;
		estado = usarBayaAlMasHerido(estado);
	}
	return estado;
}

/** Estado final de una expedición y nivel medio al jefe de cada piso. */
export interface ResultadoExpedicion {
	estado: EstadoExpedicion;
	/** Nivel medio consciente antes del jefe de los pisos 1, 2 y 3; null si no se llegó. */
	nivelMedioAlJefe: readonly (number | null)[];
}

/** Nivel medio del equipo consciente (los que tienen `psPct` > 0). */
function nivelMedioConsciente(e: EstadoExpedicion): number {
	const vivos = e.equipo.filter((m) => m.psPct > 0 && m.nivel !== undefined);
	if (vivos.length === 0) return 0;
	let suma = 0;
	for (const m of vivos) suma += m.nivel ?? 0;
	return suma / vivos.length;
}

/**
 * Una expedición completa con rutas al azar (sembradas). Con `progresion`,
 * arranca con `equipoConNiveles` y aplica `trasVictoria` después de cada
 * combate ganado; sin ella se comporta exactamente como antes.
 */
export async function simularExpedicion(
	semilla: string,
	datos: DatosSimulacion,
): Promise<ResultadoExpedicion> {
	let e = expedicionInicial(semilla, datos.sets, datos.balance);
	const progresion = datos.progresion;
	if (progresion !== undefined) e = equipoConNiveles(e, progresion);
	const ctx =
		progresion === undefined ? undefined : contextoDeProgresion(progresion);

	const nivelesAlJefe: {
		1: number | null;
		2: number | null;
		3: number | null;
	} = { 1: null, 2: null, 3: null };

	const ruta = crearRng(`${semilla}:balance:ruta`);
	while (e.estado === "en-curso") {
		const opciones = elegibles(e);
		const id = elegirRuta(e, opciones, () =>
			ruta.entero(0, opciones.length - 1),
		);
		const tipo = e.mapa.capas.flat().find((n) => n.id === id)?.tipo;
		if (tipo === undefined) throw new RangeError(`nodo ${id} sin tipo`);
		const pisoCombate = e.piso;
		// El nivel se mide justo antes de entrar al jefe, con el equipo que llega.
		if (tipo === "jefe" && progresion !== undefined) {
			nivelesAlJefe[pisoCombate] = nivelMedioConsciente(e);
		}
		e = entrar(e, id);
		if (esNodoDeCombate(tipo)) {
			const combate = await jugarCombate(e, id, datos);
			e = cerrarCombate(
				e,
				combate.resultado,
				datos.balance.curaTrasVictoriaPct,
			);
			if (combate.resultado.victoria && ctx !== undefined) {
				e = trasVictoria(e, tipo, combate.vivos, ctx, pisoCombate);
			}
			if (e.estado === "en-curso") e = curarConBayas(e);
		} else if (tipo === "tienda") {
			e = comprarBayas(e, datos);
		} else if (tipo === "manantial" || tipo === "cofre" || tipo === "evento") {
			e = resolverEleccion(e, id, tipo, datos);
		}
	}
	return {
		estado: e,
		nivelMedioAlJefe: [nivelesAlJefe[1], nivelesAlJefe[2], nivelesAlJefe[3]],
	};
}

/** Simula una expedición por semilla y resume victorias y piso de la derrota. */
export async function simular(
	semillas: readonly string[],
	datos: DatosSimulacion,
): Promise<ResumenSimulacion> {
	const muertesPorPiso: [number, number, number] = [0, 0, 0];
	const acumulado: [number[], number[], number[]] = [[], [], []];
	let victorias = 0;
	for (const semilla of semillas) {
		const { estado: final, nivelMedioAlJefe } = await simularExpedicion(
			semilla,
			datos,
		);
		if (final.estado === "victoria") victorias++;
		else
			muertesPorPiso[final.piso - 1] =
				(muertesPorPiso[final.piso - 1] ?? 0) + 1;
		for (const [piso, nivel] of nivelMedioAlJefe.entries()) {
			if (nivel !== null) acumulado[piso]?.push(nivel);
		}
	}
	const total = semillas.length;
	const resumen: ResumenSimulacion = {
		victorias,
		total,
		tasa: total === 0 ? 0 : victorias / total,
		muertesPorPiso,
	};
	if (datos.progresion !== undefined) {
		const medios: [number, number, number] = [0, 0, 0];
		for (let piso = 0; piso < 3; piso++) {
			const valores = acumulado[piso] ?? [];
			if (valores.length > 0) {
				medios[piso] =
					valores.reduce((suma, nivel) => suma + nivel, 0) / valores.length;
			}
		}
		resumen.nivelMedioAlJefe = medios;
	}
	return resumen;
}
