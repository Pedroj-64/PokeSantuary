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
}

export interface ResumenSimulacion {
	victorias: number;
	total: number;
	/** victorias / total; 0 si no hay semillas. */
	tasa: number;
	/** Expediciones perdidas en el piso 1, 2 y 3. */
	muertesPorPiso: [number, number, number];
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

/** Juega un combate de nodo hasta el final; null si se acaba el tope de turnos. */
async function jugarCombate(
	e: EstadoExpedicion,
	nodoId: string,
	datos: DatosSimulacion,
): Promise<ResultadoCombate> {
	const prep = prepararCombate(e, nodoId, datos.sets, {
		setsRival: datos.setsRival,
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
			return { victoria: false, psPct: e.equipo.map(() => 0), dinero: 0 };
		}
		r = await sesion.elegirJugador(elegirJugada(r.peticion));
	}
	return resultadoDeCombate(
		e,
		prep.vivos,
		r.terminado,
		r.equipoFinal ?? [],
		dineroDeNodo(datos.balance, e, nodoId),
	);
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

/** Una expedición completa con rutas al azar (sembradas); devuelve el estado final. */
export async function simularExpedicion(
	semilla: string,
	datos: DatosSimulacion,
): Promise<EstadoExpedicion> {
	let e = expedicionInicial(semilla, datos.sets, datos.balance);
	const ruta = crearRng(`${semilla}:balance:ruta`);
	while (e.estado === "en-curso") {
		const opciones = elegibles(e);
		const id = elegirRuta(e, opciones, () =>
			ruta.entero(0, opciones.length - 1),
		);
		e = entrar(e, id);
		const tipo = e.mapa.capas.flat().find((n) => n.id === id)?.tipo;
		if (tipo === undefined) throw new RangeError(`nodo ${id} sin tipo`);
		if (esNodoDeCombate(tipo)) {
			e = cerrarCombate(
				e,
				await jugarCombate(e, id, datos),
				datos.balance.curaTrasVictoriaPct,
			);
			if (e.estado === "en-curso") e = curarConBayas(e);
		} else if (tipo === "tienda") {
			e = comprarBayas(e, datos);
		} else if (tipo === "manantial" || tipo === "cofre" || tipo === "evento") {
			e = resolverEleccion(e, id, tipo, datos);
		}
	}
	return e;
}

/** Simula una expedición por semilla y resume victorias y piso de la derrota. */
export async function simular(
	semillas: readonly string[],
	datos: DatosSimulacion,
): Promise<ResumenSimulacion> {
	const muertesPorPiso: [number, number, number] = [0, 0, 0];
	let victorias = 0;
	for (const semilla of semillas) {
		const final = await simularExpedicion(semilla, datos);
		if (final.estado === "victoria") victorias++;
		else
			muertesPorPiso[final.piso - 1] =
				(muertesPorPiso[final.piso - 1] ?? 0) + 1;
	}
	const total = semillas.length;
	return {
		victorias,
		total,
		tasa: total === 0 ? 0 : victorias / total,
		muertesPorPiso,
	};
}
