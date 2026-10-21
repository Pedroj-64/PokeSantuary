import { crearRng, type Rng } from "./rng.js";

/** Runa Unown; "?" todavía no ha revelado su letra. */
export type IdRuna = "A" | "C" | "F" | "S" | "?";

/** Cuántas runas caben en la mochila. */
export const MAX_RUNAS = 5;

/** Efectos acumulados de las runas; los valores neutros son 1, 0, 1, 0 y 0. */
export interface Modificadores {
	/** Multiplicador del daño del primer movimiento (1 = sin cambio). */
	multDanoPrimerMovimiento: number;
	/** Puntos de PS% que cura al miembro con menos PS tras ganar (0 = nada). */
	curaPostCombatePct: number;
	/** Multiplicador de dinero ganado (1 = sin cambio). */
	multDinero: number;
	/** Opciones extra en la tienda. */
	opcionesTiendaExtra: number;
	/** Probabilidad extra de rendición sombría (0..1, se suma). */
	bonusRendicionSombria: number;
}

/** Runas con efecto, en el orden en que se revelan los misterios. */
const CANDIDATAS: readonly IdRuna[] = ["A", "C", "F", "S"];

/** Todos los ids válidos de runa. */
const IDS: readonly IdRuna[] = [...CANDIDATAS, "?"];

/** Modificadores neutros, punto de partida del reparto. */
const NEUTROS: Modificadores = {
	multDanoPrimerMovimiento: 1,
	curaPostCombatePct: 0,
	multDinero: 1,
	opcionesTiendaExtra: 0,
	bonusRendicionSombria: 0,
};

/** ¿Es un id de runa conocido? */
function esRuna(valor: unknown): valor is IdRuna {
	return IDS.includes(valor as IdRuna);
}

/** Elige un elemento al azar con el rng; el arreglo no puede estar vacío. */
function elegir<T>(rng: Rng, opciones: readonly T[]): T {
	const primero = opciones[0];
	if (primero === undefined) {
		throw new RangeError("elegir(): se esperaba un arreglo no vacío");
	}
	return opciones[rng.entero(0, opciones.length - 1)] ?? primero;
}

/**
 * Efectos acumulados de las runas. El daño y el dinero se multiplican y el
 * resto se suma; "?" no aporta nada por sí misma.
 *
 * @param runas Runas equipadas, sin repetir.
 * @throws {RangeError} Si hay una runa repetida o un id desconocido.
 */
export function modificadores(runas: readonly IdRuna[]): Modificadores {
	if (!Array.isArray(runas)) {
		throw new RangeError("modificadores(): se esperaba un arreglo de runas");
	}
	const vistas = new Set<IdRuna>();
	const acumulado: Modificadores = { ...NEUTROS };
	for (const runa of runas) {
		if (!esRuna(runa)) {
			throw new RangeError(`modificadores(): '${String(runa)}' no es una runa`);
		}
		if (vistas.has(runa)) {
			throw new RangeError(`modificadores(): la runa ${runa} está repetida`);
		}
		vistas.add(runa);
		switch (runa) {
			case "A":
				acumulado.multDanoPrimerMovimiento *= 1.3;
				break;
			case "C":
				acumulado.curaPostCombatePct += 15;
				break;
			case "F":
				acumulado.multDinero *= 1.25;
				acumulado.opcionesTiendaExtra += 1;
				break;
			case "S":
				acumulado.bonusRendicionSombria += 0.2;
				break;
			case "?":
				break;
		}
	}
	return acumulado;
}

/**
 * Hasta `cantidad` runas con efecto (A, C, F, S) que aún no tienes, para elegir una
 * (Bendición del Viajero). Orden y selección deterministas por `semilla`.
 */
export function opcionesDeRuna(
	semilla: string,
	tengo: readonly IdRuna[],
	cantidad: number,
): IdRuna[] {
	const libres = CANDIDATAS.filter((r) => !tengo.includes(r));
	const rng = crearRng(`${semilla}:bendicion`);
	const orden: IdRuna[] = [];
	while (libres.length > 0 && orden.length < cantidad) {
		const i = rng.entero(0, libres.length - 1);
		orden.push(libres.splice(i, 1)[0] as IdRuna);
	}
	return orden;
}

/**
 * Añade una runa a la lista.
 *
 * @returns Arreglo nuevo; no toca el recibido.
 * @throws {RangeError} Si la runa ya está en la lista o si ya hay {@link MAX_RUNAS}.
 */
export function anadirRuna(runas: readonly IdRuna[], nueva: IdRuna): IdRuna[] {
	if (!esRuna(nueva)) {
		throw new RangeError(`anadirRuna(): '${String(nueva)}' no es una runa`);
	}
	if (!Array.isArray(runas)) {
		throw new RangeError("anadirRuna(): se esperaba un arreglo de runas");
	}
	if (runas.includes(nueva)) {
		throw new RangeError(`anadirRuna(): ya tienes la runa ${nueva}`);
	}
	if (runas.length >= MAX_RUNAS) {
		throw new RangeError(
			`anadirRuna(): no caben más de ${MAX_RUNAS} runas (tienes ${runas.length})`,
		);
	}
	return [...runas, nueva];
}

/**
 * Revela los misterios: cada "?" se convierte en una runa A, C, F o S que no
 * esté ya en la lista, elegida con `crearRng(\`${semilla}:runa:p${piso}\`)`. Si
 * ya están las cuatro, el "?" se queda como está.
 *
 * Es determinista y conserva el orden; no toca la lista recibida.
 *
 * @throws {RangeError} Si el piso no es 1, 2 o 3, o si hay un id desconocido.
 */
export function resolverMisterio(
	runas: readonly IdRuna[],
	semilla: string,
	piso: 1 | 2 | 3,
): IdRuna[] {
	if (piso !== 1 && piso !== 2 && piso !== 3) {
		throw new RangeError(
			`resolverMisterio(): 'piso' debe ser 1, 2 o 3 (recibido ${String(piso)})`,
		);
	}
	if (!Array.isArray(runas)) {
		throw new RangeError("resolverMisterio(): se esperaba un arreglo de runas");
	}
	for (const runa of runas) {
		if (!esRuna(runa)) {
			throw new RangeError(
				`resolverMisterio(): '${String(runa)}' no es una runa`,
			);
		}
	}

	const rng = crearRng(`${semilla}:runa:p${piso}`);
	const cogidas = new Set<IdRuna>(runas);
	const resueltas: IdRuna[] = [];
	for (const runa of runas) {
		if (runa !== "?") {
			resueltas.push(runa);
			continue;
		}
		const libres = CANDIDATAS.filter((candidata) => !cogidas.has(candidata));
		if (libres.length === 0) {
			resueltas.push("?");
			continue;
		}
		const elegida = elegir(rng, libres);
		cogidas.add(elegida);
		resueltas.push(elegida);
	}
	return resueltas;
}
