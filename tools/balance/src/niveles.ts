import { techoDelPiso as techoDelPisoPack } from "@santuario/battle";
import {
	type ContextoProgresion,
	crearRng,
	type EstadoExpedicion,
	type Evolucion,
	elegirOlvido,
	evolucionar,
	MAX_MOVIMIENTOS,
	type MiembroExp,
	movimientosIniciales,
	nivelInicial,
	type Rng,
	registrarVictoria,
	type TablaNiveles,
	type TipoRival,
} from "@santuario/core";
import type {
	Aprendizaje,
	Evoluciones,
	Niveles,
	SetCombate,
} from "@santuario/data";

/** Datos de progresión del pack, tal como los consume el simulador. */
export interface ProgresionSimulacion {
	/** Tablas de niveles del pack (`niveles.json`). */
	niveles: Niveles;
	/** Listas de aprendizaje por especie (`aprendizaje.json`). */
	aprendizaje: Aprendizaje;
	/** Etapas y evoluciones por especie (`evoluciones.json`). */
	evoluciones: Evoluciones;
	/** Nivel de gimnasio con el que sale el equipo (0 por defecto). */
	nivelGimnasio: number;
}

/**
 * Contexto de `progresion.ts` más lo que necesita el simulador: la tabla de
 * niveles del pack (para el techo del jefe) y el poder de los movimientos.
 */
export interface ContextoNiveles extends ContextoProgresion {
	/** Tabla de niveles del pack (`niveles.json` → `nivel`). */
	tablaNiveles: TablaNiveles;
	/**
	 * Poder por movimiento para elegir cuál olvidar. Si falta o ningún
	 * movimiento activo tiene dato, se olvida el primero de la lista.
	 */
	poder?: Readonly<Record<string, number>>;
}

/**
 * Contexto de progresión para el simulador. El momento es siempre `"dia"`
 * porque la simulación no modela la hora del Santuario; en la práctica solo
 * afecta a las evoluciones por amistad, que aquí no se dan (los miembros no
 * llevan amistad).
 */
export function contextoDeProgresion(
	p: ProgresionSimulacion,
	poder?: Readonly<Record<string, number>>,
): ContextoNiveles {
	const evoluciones: Record<string, readonly Evolucion[]> = {};
	for (const [especie, datos] of Object.entries(p.evoluciones)) {
		evoluciones[especie] = datos.evoluciones;
	}
	return {
		tabla: p.niveles.subida,
		aprendizaje: p.aprendizaje,
		evoluciones,
		momento: "dia",
		tablaNiveles: p.niveles.nivel,
		...(poder !== undefined && { poder }),
	};
}

/**
 * Da nivel y movimientos iniciales a todo el equipo: el nivel sale de
 * `nivelInicial(nivelGimnasio, nivelEtapa)` y los movimientos de
 * `movimientosIniciales(aprendizaje, nivel)`.
 *
 * No muta `e` ni `p`.
 *
 * @throws {RangeError} Si una especie del equipo no está en `evoluciones.json`
 * o en `aprendizaje.json` (el mensaje incluye su nombre).
 */
export function equipoConNiveles(
	e: EstadoExpedicion,
	p: ProgresionSimulacion,
): EstadoExpedicion {
	return {
		...e,
		equipo: e.equipo.map((m) => {
			const etapa = p.evoluciones[m.especie];
			if (etapa === undefined) {
				throw new RangeError(
					`equipoConNiveles(): la especie '${m.especie}' no está en evoluciones.json`,
				);
			}
			const lista = p.aprendizaje[m.especie];
			if (lista === undefined) {
				throw new RangeError(
					`equipoConNiveles(): la especie '${m.especie}' no está en aprendizaje.json`,
				);
			}
			const nivel = nivelInicial(p.nivelGimnasio, etapa.nivelEtapa);
			return {
				...m,
				nivel,
				movimientos: movimientosIniciales(lista, nivel),
			};
		}),
	};
}

/** Tabla exacta de nodo del mapa a tipo de rival de `niveles.ts`. */
const RIVAL_POR_NODO: Readonly<Record<string, TipoRival>> = {
	salvaje: "salvaje",
	entrenador: "rival",
	alfa: "alfa",
	sombrio: "sombrio",
	jefe: "jefe",
};

/**
 * Traduce un tipo de nodo del mapa a `TipoRival`:
 *
 * | Nodo         | Rival    |
 * | ------------ | -------- |
 * | `salvaje`    | salvaje  |
 * | `entrenador` | rival    |
 * | `alfa`       | alfa     |
 * | `sombrio`    | sombrio  |
 * | `jefe`       | jefe     |
 *
 * Los nodos que no son de combate (`tienda`, `manantial`, `evento`, `cofre`)
 * y cualquier otro valor lanzan `RangeError`.
 */
export function tipoRivalDeNodo(tipoNodo: string): TipoRival {
	const rival = RIVAL_POR_NODO[tipoNodo];
	if (rival === undefined) {
		throw new RangeError(
			`tipoRivalDeNodo(): '${tipoNodo}' no es un tipo de nodo de combate`,
		);
	}
	return rival;
}

/**
 * Nivel del as del jefe de `piso`. Delega en `techoDelPiso` de
 * `@santuario/battle` (el jefe no consume RNG, así que el resultado es el
 * mismo); se conserva esta firma con `Rng` por compatibilidad con el
 * simulador y sus pruebas.
 */
export function techoDelPiso(
	tablaNiveles: TablaNiveles,
	piso: number,
	_rng: Rng,
): number {
	return techoDelPisoPack(tablaNiveles, piso as 1 | 2 | 3);
}

/**
 * Movimiento activo de menor poder. Solo compiten los que tienen dato en
 * `poder`; si ninguno lo tiene (o no se pasa la tabla), se elige el primero,
 * que es el más antiguo de la lista. Los empates se resuelven por orden.
 */
function movimientoMasDebil(
	activos: readonly string[],
	poder: Readonly<Record<string, number>> | undefined,
): string {
	const primero = activos[0];
	if (primero === undefined) {
		throw new RangeError(
			"trasVictoria(): el miembro no tiene movimientos activos que olvidar",
		);
	}
	let elegido = primero;
	let minimo: number | undefined;
	if (poder !== undefined) {
		for (const movimiento of activos) {
			const potencia = poder[movimiento];
			if (potencia === undefined) continue;
			if (minimo === undefined || potencia < minimo) {
				minimo = potencia;
				elegido = movimiento;
			}
		}
	}
	return elegido;
}

/**
 * Progresión posterior a un combate ganado, resuelta sin intervención:
 *
 * 1. `registrarVictoria` con el rival que corresponde al nodo y el techo del
 *    as del jefe del piso actual.
 * 2. Cada `pendienteMovimiento` se aprende olvidando el movimiento activo de
 *    menor poder (o el primero si no hay datos de poder).
 * 3. Cada `puedeEvolucionar` evoluciona a la primera opción.
 *
 * No muta `e` ni `ctx`.
 *
 * `piso` es el piso del combate; por defecto, el del estado. El simulador lo
 * pasa explícito porque, al ganar a un jefe, `cerrarCombate` ya ha avanzado el
 * estado al piso siguiente y el techo debe seguir siendo el del combate.
 *
 * @throws {RangeError} Si el nodo no es de combate, si un evento apunta a un
 * índice inexistente o si falla `registrarVictoria`/`elegirOlvido`/`evolucionar`.
 */
export function trasVictoria(
	e: EstadoExpedicion,
	nodoTipo: string,
	participantes: readonly number[],
	ctx: ContextoNiveles,
	piso: number = e.piso,
): EstadoExpedicion {
	const rival = tipoRivalDeNodo(nodoTipo);
	const techo = techoDelPiso(
		ctx.tablaNiveles,
		piso,
		crearRng(`${e.semilla}:p${piso}:techo`),
	);
	const { estado, eventos } = registrarVictoria(
		e,
		{ rival, participantes, techo },
		ctx,
	);

	let actual = estado;
	for (const evento of eventos) {
		if (evento.tipo === "pendienteMovimiento") {
			const miembro = actual.equipo[evento.indice];
			if (miembro === undefined) {
				throw new RangeError(
					`trasVictoria(): el índice ${evento.indice} no existe en el equipo`,
				);
			}
			const activos = miembro.movimientos ?? [];
			const olvidar =
				activos.length >= MAX_MOVIMIENTOS
					? movimientoMasDebil(activos, ctx.poder)
					: undefined;
			actual = elegirOlvido(actual, evento.indice, evento.movimiento, olvidar);
		} else if (evento.tipo === "puedeEvolucionar") {
			const opcion = evento.opciones[0];
			if (opcion === undefined) {
				throw new RangeError(
					`trasVictoria(): la evolución de ${evento.especie} no tiene opciones`,
				);
			}
			actual = evolucionar(actual, evento.indice, opcion, ctx);
		}
	}
	return actual;
}

/**
 * Sets con los que combatir cuando el equipo tiene especies evolucionadas que
 * no están en `sets.json`: presta el set de la especie de la que evolucionan
 * (o el primero del catálogo si no se encuentra el origen) cambiando solo
 * `especie`. `prepararCombate` ya sustituye los movimientos por los del
 * miembro, así que el set prestado solo aporta habilidad y naturaleza.
 *
 * Si no falta ningún set, devuelve la misma lista.
 */
export function setsConEvoluciones(
	sets: readonly SetCombate[],
	equipo: readonly MiembroExp[],
	evoluciones: Evoluciones,
): readonly SetCombate[] {
	const origen = new Map<string, string>();
	for (const [especie, datos] of Object.entries(evoluciones)) {
		for (const evolucion of datos.evoluciones) {
			if (!origen.has(evolucion.a)) origen.set(evolucion.a, especie);
		}
	}

	const faltan = new Set<string>();
	for (const miembro of equipo) {
		if (sets.some((set) => set.especie === miembro.especie)) continue;
		faltan.add(miembro.especie);
	}
	if (faltan.size === 0) return sets;

	const extra: SetCombate[] = [];
	for (const especie of faltan) {
		const especieBase = origen.get(especie);
		const base =
			(especieBase === undefined
				? undefined
				: sets.find((set) => set.especie === especieBase)) ?? sets[0];
		if (base === undefined) continue;
		extra.push({ ...base, especie });
	}
	return extra.length === 0 ? sets : [...sets, ...extra];
}
