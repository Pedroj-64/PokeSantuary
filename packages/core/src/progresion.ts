import {
	aprender,
	aprenderTodos,
	type EntradaAprendizaje,
	MAX_MOVIMIENTOS,
	type Movimientos,
	nuevosMovimientos,
} from "./aprender.js";
import {
	type Evolucion,
	evolucionesDisponibles,
	type MomentoJornada,
} from "./evolucionar.js";
import type { EstadoExpedicion, MiembroExp } from "./expedicion.js";
import { subirNiveles, type TablaSubida, type TipoRival } from "./niveles.js";

/** Datos y momento con los que se resuelve la progresión del equipo. */
export interface ContextoProgresion {
	tabla: TablaSubida;
	/** Por especie: lista de aprendizaje ordenada (como `aprendizaje.json`). */
	aprendizaje: Readonly<Record<string, readonly EntradaAprendizaje[]>>;
	/** Por especie: sus evoluciones (como `evoluciones.json`, solo la lista). */
	evoluciones: Readonly<Record<string, readonly Evolucion[]>>;
	momento: MomentoJornada;
}

/** Cambio de progresión para que el juego lo anuncie y decida. */
export type EventoProgresion =
	| {
			tipo: "subeNivel";
			indice: number;
			especie: string;
			de: number;
			a: number;
	  }
	| { tipo: "aprende"; indice: number; especie: string; movimiento: string }
	| {
			tipo: "pendienteMovimiento";
			indice: number;
			especie: string;
			movimiento: string;
	  }
	| {
			tipo: "puedeEvolucionar";
			indice: number;
			especie: string;
			opciones: string[];
	  };

/** Estado nuevo tras aplicar la progresión, más lo que ocurrió. */
export interface ResultadoProgresion {
	estado: EstadoExpedicion;
	eventos: EventoProgresion[];
}

/** Qué pasó en el combate para repartir la subida de niveles. */
export interface OpcionesVictoria {
	rival: TipoRival;
	/** Índices del equipo completo que combatieron. */
	participantes: readonly number[];
	/** Nivel del as del jefe del piso (tope). */
	techo: number;
}

/** ¿La condición evolutiva se dispara al subir de nivel? (El Santuario se encarga del resto). */
function seDisparaAlSubir(condicion: Evolucion["condicion"]): boolean {
	return condicion.tipo === "nivel" || condicion.tipo === "amistad";
}

/** Exige que `indice` sea una posición válida del equipo. */
function exigirIndice(
	equipo: readonly MiembroExp[],
	indice: number,
	quien: string,
): void {
	if (!Number.isInteger(indice) || indice < 0 || indice >= equipo.length) {
		throw new RangeError(
			`${quien}(): el índice ${String(indice)} no existe en el equipo (0..${equipo.length - 1})`,
		);
	}
}

/** Cambia un miembro del equipo sin tocar el resto del estado. */
function reemplazarMiembro(
	e: EstadoExpedicion,
	indice: number,
	miembro: MiembroExp,
): EstadoExpedicion {
	return {
		...e,
		equipo: e.equipo.map((actual, i) => (i === indice ? miembro : actual)),
	};
}

/**
 * Resuelve lo que le pasa al equipo tras ganar un combate: sube de nivel a
 * quienes tienen nivel, les enseña los movimientos nuevos y anuncia las
 * evoluciones disponibles. No cambia nada más del estado (PS, dinero, mapa...).
 *
 * Solo cuentan los miembros con `nivel`; los que no lo tienen se ignoran (ni
 * suben ni entran en el "más alto"). Si nadie tiene nivel, devuelve el mismo
 * estado y sin eventos.
 *
 * Orden de eventos: por índice ascendente; dentro de cada miembro primero
 * `subeNivel`, luego sus `aprende`/`pendienteMovimiento` en orden de
 * movimiento y por último `puedeEvolucionar`.
 *
 * @throws {RangeError} Si algún índice de `participantes` no existe en el
 * equipo o si lanza {@link subirNiveles}.
 */
export function registrarVictoria(
	e: EstadoExpedicion,
	o: OpcionesVictoria,
	ctx: ContextoProgresion,
): ResultadoProgresion {
	const quien = "registrarVictoria";
	for (const participante of o.participantes) {
		if (
			!Number.isInteger(participante) ||
			participante < 0 ||
			participante >= e.equipo.length
		) {
			throw new RangeError(
				`${quien}(): 'participantes' incluye el índice ${String(participante)}, que no existe en el equipo (0..${e.equipo.length - 1})`,
			);
		}
	}

	const indicesConNivel: number[] = [];
	for (let i = 0; i < e.equipo.length; i++) {
		if (e.equipo[i]?.nivel !== undefined) indicesConNivel.push(i);
	}
	if (indicesConNivel.length === 0) return { estado: e, eventos: [] };

	// Posición de cada miembro con nivel dentro de la sublista que ve subirNiveles.
	const posicion = new Map<number, number>();
	for (let k = 0; k < indicesConNivel.length; k++) {
		posicion.set(indicesConNivel[k] as number, k);
	}
	const niveles = indicesConNivel.map(
		(indice) => (e.equipo[indice] as MiembroExp).nivel as number,
	);
	const conscientes = indicesConNivel.map(
		(indice) => (e.equipo[indice] as MiembroExp).psPct > 0,
	);
	const participantes = o.participantes
		.map((indice) => posicion.get(indice))
		.filter((k): k is number => k !== undefined);

	const subidos = subirNiveles(ctx.tabla, {
		niveles,
		participantes,
		conscientes,
		rival: o.rival,
		techo: o.techo,
	});

	const cambios = new Map<number, MiembroExp>();
	const eventos: EventoProgresion[] = [];

	for (let k = 0; k < indicesConNivel.length; k++) {
		const indice = indicesConNivel[k] as number;
		const de = niveles[k] as number;
		const a = subidos[k] as number;
		if (a <= de) continue;
		const miembro = e.equipo[indice] as MiembroExp;
		const especie = miembro.especie;
		eventos.push({ tipo: "subeNivel", indice, especie, de, a });

		const activosAntes = miembro.movimientos ?? [];
		const nuevos = nuevosMovimientos(ctx.aprendizaje[especie] ?? [], de, a);
		const resultado = aprenderTodos(
			{
				activos: activosAntes,
				recordables: miembro.recordables ?? [],
			},
			nuevos,
		);

		const antes = new Set(activosAntes);
		const aprendidos: string[] = [];
		const pendientesNuevos: string[] = [];
		for (const movimiento of nuevos) {
			if (antes.has(movimiento)) continue;
			if (resultado.pendientes.includes(movimiento)) {
				pendientesNuevos.push(movimiento);
				eventos.push({
					tipo: "pendienteMovimiento",
					indice,
					especie,
					movimiento,
				});
			} else {
				aprendidos.push(movimiento);
				eventos.push({ tipo: "aprende", indice, especie, movimiento });
			}
		}

		const actualizado: MiembroExp = { ...miembro, nivel: a };
		if (aprendidos.length > 0) {
			actualizado.movimientos = resultado.movimientos.activos;
			actualizado.recordables = resultado.movimientos.recordables;
		}
		if (pendientesNuevos.length > 0) {
			const pendientes = [...(miembro.pendientesMovimiento ?? [])];
			for (const movimiento of pendientesNuevos) {
				if (!pendientes.includes(movimiento)) pendientes.push(movimiento);
			}
			actualizado.pendientesMovimiento = pendientes;
		}
		cambios.set(indice, actualizado);

		const disponibles = evolucionesDisponibles(ctx.evoluciones[especie] ?? [], {
			nivel: a,
			amistad: miembro.amistad ?? 0,
			momento: ctx.momento,
		}).filter((evolucion) => seDisparaAlSubir(evolucion.condicion));
		if (disponibles.length > 0) {
			eventos.push({
				tipo: "puedeEvolucionar",
				indice,
				especie,
				opciones: disponibles.map((evolucion) => evolucion.a),
			});
		}
	}

	if (cambios.size === 0) return { estado: e, eventos };
	return {
		estado: {
			...e,
			equipo: e.equipo.map((miembro, i) => cambios.get(i) ?? miembro),
		},
		eventos,
	};
}

/**
 * Resuelve un movimiento pendiente del miembro `indice`: aprende `movimiento`
 * olvidando `olvidar` (que debe estar entre sus activos) o, si `olvidar` es
 * `undefined`, renuncia a aprenderlo. Si el miembro tiene hueco, `olvidar` se
 * ignora y se aprende directamente.
 *
 * No cambia nada más del estado.
 *
 * @throws {RangeError} Si el índice no existe, si `movimiento` no está entre
 * los pendientes del miembro o si {@link aprender} no puede resolverlo.
 */
export function elegirOlvido(
	e: EstadoExpedicion,
	indice: number,
	movimiento: string,
	olvidar?: string,
): EstadoExpedicion {
	const quien = "elegirOlvido";
	exigirIndice(e.equipo, indice, quien);
	const miembro = e.equipo[indice] as MiembroExp;
	const pendientes = miembro.pendientesMovimiento ?? [];
	if (!pendientes.includes(movimiento)) {
		throw new RangeError(
			`${quien}(): '${movimiento}' no es un movimiento pendiente de ${miembro.especie}`,
		);
	}
	const restantes = pendientes.filter((mov) => mov !== movimiento);

	if (olvidar === undefined) {
		return reemplazarMiembro(e, indice, {
			...miembro,
			pendientesMovimiento: restantes,
		});
	}

	const movimientos: Movimientos = {
		activos: miembro.movimientos ?? [],
		recordables: miembro.recordables ?? [],
	};
	const resultado =
		movimientos.activos.length < MAX_MOVIMIENTOS
			? aprender(movimientos, movimiento)
			: aprender(movimientos, movimiento, olvidar);
	if (resultado.tipo !== "hecho") {
		throw new RangeError(
			`${quien}(): no se pudo aprender '${movimiento}': hay que elegir cuál olvidar`,
		);
	}
	return reemplazarMiembro(e, indice, {
		...miembro,
		movimientos: resultado.movimientos.activos,
		recordables: resultado.movimientos.recordables,
		pendientesMovimiento: restantes,
	});
}

/**
 * Aplica la evolución que elige el jugador: comprueba que `a` esté entre las
 * evoluciones disponibles ahora (nivel y amistad) y cambia la especie
 * conservando `uid`, `psPct`, `nivel`, movimientos, pendientes y amistad.
 *
 * Las evoluciones por objeto y por intercambio las aplica el Santuario.
 *
 * @throws {RangeError} Si el índice no existe, si el miembro no tiene nivel o
 * si `a` no está disponible con su nivel, amistad y el momento dados.
 */
export function evolucionar(
	e: EstadoExpedicion,
	indice: number,
	a: string,
	ctx: ContextoProgresion,
): EstadoExpedicion {
	const quien = "evolucionar";
	exigirIndice(e.equipo, indice, quien);
	const miembro = e.equipo[indice] as MiembroExp;
	if (miembro.nivel === undefined) {
		throw new RangeError(
			`${quien}(): ${miembro.especie} no tiene nivel; no se puede comprobar la evolución`,
		);
	}
	const disponibles = evolucionesDisponibles(
		ctx.evoluciones[miembro.especie] ?? [],
		{
			nivel: miembro.nivel,
			amistad: miembro.amistad ?? 0,
			momento: ctx.momento,
		},
	).filter((evolucion) => seDisparaAlSubir(evolucion.condicion));
	if (!disponibles.some((evolucion) => evolucion.a === a)) {
		throw new RangeError(
			`${quien}(): ${miembro.especie} no puede evolucionar a '${a}' ahora`,
		);
	}
	return reemplazarMiembro(e, indice, { ...miembro, especie: a });
}
