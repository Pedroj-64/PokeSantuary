import { curar, type EstadoExpedicion } from "./expedicion.js";
import { crearRng, type Rng } from "./rng.js";
import { anadirRuna, type IdRuna, MAX_RUNAS } from "./runas.js";

/** Tipos de nodo que se resuelven con una pantalla de elección. */
export type NodoEvento = "manantial" | "cofre" | "evento";

/** Rival de un combate lanzado por un evento. */
export type RivalEvento = "salvaje" | "entrenador" | "sombrio";

/**
 * Efecto de una opción. Repite la forma de `Efecto` de `@santuario/data`
 * porque `@santuario/core` no depende del paquete de datos.
 */
export type Efecto =
	| { tipo: "curar"; pct: number }
	| { tipo: "dinero"; cantidad: number }
	| { tipo: "runa"; runa: IdRuna | "aleatoria" }
	| { tipo: "combate"; rival: RivalEvento }
	| { tipo: "costePs"; pct: number };

/** Forma mínima de un evento: el nodo decide cuáles entran en el sorteo. */
export interface EventoElegible {
	nodo: NodoEvento;
}

/** Resultado de aplicar un efecto; el estado nunca se muta. */
export interface ResultadoEfecto {
	estado: EstadoExpedicion;
	/** Si el efecto es un combate, el rival: la escena lo lanza; el estado no cambia. */
	combate?: RivalEvento;
	/** Runa que no cabe porque la mochila está llena: la escena pide cuál sustituir. */
	ofreceSustituir?: IdRuna;
}

/** Runas que pueden salir al azar; "?" solo se obtiene de forma explícita. */
const CANDIDATAS: readonly IdRuna[] = ["A", "C", "F", "S"];

/** Todos los ids válidos de runa. */
const IDS: readonly IdRuna[] = [...CANDIDATAS, "?"];

/** Tipos de efecto que entiende `aplicarEfecto`. */
const TIPOS: readonly Efecto["tipo"][] = [
	"curar",
	"dinero",
	"runa",
	"combate",
	"costePs",
];

/** ¿Es un id de runa conocido? */
function esRuna(valor: unknown): valor is IdRuna {
	return IDS.includes(valor as IdRuna);
}

/**
 * Lanza si el efecto no trae un `tipo` conocido.
 *
 * @throws {RangeError} Si falta el tipo o no es uno de los admitidos.
 */
function exigirTipoConocido(efecto: Efecto): void {
	const tipo: unknown = (efecto as { tipo?: unknown }).tipo;
	if (
		typeof tipo !== "string" ||
		!(TIPOS as readonly string[]).includes(tipo)
	) {
		throw new RangeError(
			`aplicarEfecto(): efecto desconocido '${String(tipo)}'`,
		);
	}
}

/**
 * Añade una runa a la mochila; si no cabe pide sustituir una de las que hay.
 *
 * @returns El estado nuevo y, si no cabe, la runa que se ofrece.
 */
function aplicarRuna(
	e: EstadoExpedicion,
	cual: IdRuna | "aleatoria",
	rng: Rng,
): ResultadoEfecto {
	const nueva = cual === "aleatoria" ? elegirRunaLibre(e.runas, rng) : cual;
	if (nueva === undefined) return { estado: e };
	if (!esRuna(nueva)) {
		throw new RangeError(`aplicarEfecto(): '${String(nueva)}' no es una runa`);
	}
	if (e.runas.includes(nueva)) return { estado: e };
	if (e.runas.length >= MAX_RUNAS) return { estado: e, ofreceSustituir: nueva };
	return { estado: { ...e, runas: anadirRuna(e.runas, nueva) } };
}

/**
 * Runa al azar entre A, C, F y S que no esté ya en la mochila.
 *
 * @returns La elegida, o undefined si ya están las cuatro.
 */
function elegirRunaLibre(
	runas: readonly IdRuna[],
	rng: Rng,
): IdRuna | undefined {
	const libres = CANDIDATAS.filter((runa) => !runas.includes(runa));
	if (libres.length === 0) return undefined;
	return libres[rng.entero(0, libres.length - 1)];
}

/**
 * Aplica un efecto de evento sobre la expedición.
 *
 * Es puro: no muta el estado recibido y devuelve uno nuevo solo cuando cambia
 * algo. `combate` no toca el estado; la escena se encarga de lanzarlo.
 *
 * @throws {RangeError} Si la expedición no está en curso, si el efecto es
 * desconocido o si trae valores fuera de rango.
 */
export function aplicarEfecto(
	e: EstadoExpedicion,
	efecto: Efecto,
	rng: Rng,
): ResultadoEfecto {
	if (e === null || typeof e !== "object" || e.estado !== "en-curso") {
		throw new RangeError(
			`aplicarEfecto(): la expedición no está en curso (recibido ${String(e?.estado)})`,
		);
	}
	if (efecto === null || typeof efecto !== "object") {
		throw new RangeError("aplicarEfecto(): se esperaba un efecto");
	}
	exigirTipoConocido(efecto);

	switch (efecto.tipo) {
		case "curar":
			return { estado: curar(e, efecto.pct) };
		case "dinero": {
			if (!Number.isInteger(efecto.cantidad)) {
				throw new RangeError(
					`aplicarEfecto(): 'cantidad' debe ser un entero (recibido ${String(efecto.cantidad)})`,
				);
			}
			return {
				estado: {
					...e,
					dinero: Math.max(0, e.dinero + efecto.cantidad),
				},
			};
		}
		case "costePs": {
			if (!Number.isInteger(efecto.pct) || efecto.pct < 1 || efecto.pct > 99) {
				throw new RangeError(
					`aplicarEfecto(): 'pct' debe ser un entero entre 1 y 99 (recibido ${String(efecto.pct)})`,
				);
			}
			return {
				estado: {
					...e,
					equipo: e.equipo.map((miembro) => ({
						...miembro,
						psPct:
							miembro.psPct > 0
								? Math.max(1, miembro.psPct - efecto.pct)
								: miembro.psPct,
					})),
				},
			};
		}
		case "runa":
			return aplicarRuna(e, efecto.runa, rng);
		case "combate":
			return { estado: e, combate: efecto.rival };
	}
}

/**
 * Cambia una runa de la mochila por otra.
 *
 * @returns Estado nuevo con la runa sustituida en su sitio.
 * @throws {RangeError} Si alguna de las dos no es una runa, si no tienes la
 * que se quita o si ya tienes la que se añade.
 */
export function sustituirRuna(
	e: EstadoExpedicion,
	quitar: IdRuna,
	nueva: IdRuna,
): EstadoExpedicion {
	if (!esRuna(quitar)) {
		throw new RangeError(`sustituirRuna(): '${String(quitar)}' no es una runa`);
	}
	if (!esRuna(nueva)) {
		throw new RangeError(`sustituirRuna(): '${String(nueva)}' no es una runa`);
	}
	const indice = e.runas.indexOf(quitar);
	if (indice === -1) {
		throw new RangeError(`sustituirRuna(): no tienes la runa ${quitar}`);
	}
	if (e.runas.includes(nueva)) {
		throw new RangeError(`sustituirRuna(): ya tienes la runa ${nueva}`);
	}
	const runas = [...e.runas];
	runas[indice] = nueva;
	return { ...e, runas };
}

/**
 * Elige el evento de un nodo con `crearRng(\\`${semilla}:evento:p${piso}:${nodoId}\\`)`.
 *
 * Es determinista y no toca la lista recibida. Para manantial y cofre hay un
 * único candidato.
 *
 * @throws {RangeError} Si el piso no es 1, 2 o 3 o si no hay eventos de ese nodo.
 */
export function elegirEvento<T extends EventoElegible>(
	eventos: readonly T[],
	semilla: string,
	piso: 1 | 2 | 3,
	nodoId: string,
	nodo: NodoEvento,
): T {
	if (piso !== 1 && piso !== 2 && piso !== 3) {
		throw new RangeError(
			`elegirEvento(): 'piso' debe ser 1, 2 o 3 (recibido ${String(piso)})`,
		);
	}
	if (!Array.isArray(eventos)) {
		throw new RangeError("elegirEvento(): se esperaba una lista de eventos");
	}
	const candidatos = eventos.filter((evento) => evento.nodo === nodo);
	const primero = candidatos[0];
	if (primero === undefined) {
		throw new RangeError(`elegirEvento(): no hay eventos de tipo ${nodo}`);
	}
	const rng = crearRng(`${semilla}:evento:p${piso}:${nodoId}`);
	return candidatos[rng.entero(0, candidatos.length - 1)] ?? primero;
}
