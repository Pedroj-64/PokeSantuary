import type { EstadoSantuario, Residente } from "./estado.js";

export type IdCeremonia =
	| "festin-bayas"
	| "fogata-ascuas"
	| "bendicion-viajero"
	| "purificacion";

export interface DefCeremonia {
	/** Armonía mínima del Santuario (la Armonía NO se gasta). */
	armoniaMin: number;
	/** Recursos que cuesta (ids de `EstadoSantuario.recursos`; las bayas se pagan con `baya:<sabor>` en conjunto). */
	coste: Record<string, number>;
	/** Jornadas de espera hasta poder repetirla. */
	espera: number;
	/** Solo se puede celebrar de noche. */
	soloDeNoche?: boolean;
	/** Un residente con esa Especialidad (nivel >= 1). */
	requiereEspecialidad?: string;
}

export type TablaCeremonias = Readonly<Record<IdCeremonia, DefCeremonia>>;

/** Última jornada en que se celebró cada ceremonia (la guarda quien llama). */
export type RegistroCeremonias = Readonly<Partial<Record<IdCeremonia, number>>>;

const ORDEN_CEREMONIAS: readonly IdCeremonia[] = [
	"festin-bayas",
	"fogata-ascuas",
	"bendicion-viajero",
	"purificacion",
];

const CLAVE_BAYAS = "bayas";
const PREFIJO_BAYA = "baya:";

/** Ordena las claves de baya por cantidad descendente; empate: orden alfabético. */
function clavesBayasOrdenadas(recursos: Record<string, number>): string[] {
	return Object.keys(recursos)
		.filter((clave) => clave.startsWith(PREFIJO_BAYA))
		.sort((a, b) => {
			const va = recursos[a] ?? 0;
			const vb = recursos[b] ?? 0;
			if (vb !== va) return vb - va;
			return a < b ? -1 : a > b ? 1 : 0;
		});
}

/** Cantidad total de bayas (cualquier sabor) en los recursos. */
function totalBayas(recursos: Record<string, number>): number {
	let total = 0;
	for (const clave of Object.keys(recursos)) {
		if (clave.startsWith(PREFIJO_BAYA)) {
			const v = recursos[clave];
			if (v !== undefined) total += v;
		}
	}
	return total;
}

/** Descuenta `cantidad` bayas de una en una, siempre del sabor con más existencias. */
function descontarBayas(
	recursos: Record<string, number>,
	cantidad: number,
): Record<string, number> {
	const nuevos = { ...recursos };
	let restante = cantidad;
	while (restante > 0) {
		const claves = clavesBayasOrdenadas(nuevos);
		if (claves.length === 0) break;
		const clave = claves[0];
		if (clave === undefined) break;
		nuevos[clave] = (nuevos[clave] ?? 0) - 1;
		restante--;
	}
	return nuevos;
}

/** Valida si se puede pagar el coste completo (sin mutar). */
function puedePagarCoste(
	recursos: Record<string, number>,
	coste: Record<string, number>,
): boolean {
	const costeBayas = coste[CLAVE_BAYAS];
	if (costeBayas !== undefined && totalBayas(recursos) < costeBayas) {
		return false;
	}
	for (const [clave, valor] of Object.entries(coste)) {
		if (clave === CLAVE_BAYAS) continue;
		const disponible = recursos[clave];
		if (disponible === undefined || disponible < valor) return false;
	}
	return true;
}

/** Aplica el descuento del coste y devuelve los recursos nuevos. */
function aplicarDescuentoCoste(
	recursos: Record<string, number>,
	coste: Record<string, number>,
): Record<string, number> {
	let nuevos = { ...recursos };
	const costeBayas = coste[CLAVE_BAYAS];
	if (costeBayas !== undefined && costeBayas > 0) {
		nuevos = descontarBayas(nuevos, costeBayas);
	}
	for (const [clave, valor] of Object.entries(coste)) {
		if (clave === CLAVE_BAYAS) continue;
		const actual = nuevos[clave] ?? 0;
		nuevos[clave] = actual - valor;
	}
	return nuevos;
}

/** Acota un número a [0, 100]. */
function acotar0100(valor: number): number {
	return Math.min(100, Math.max(0, valor));
}

/** Verifica si un residente cumple el requisito de especialidad. */
function cumpleEspecialidad(r: Residente, especialidad: string): boolean {
	const nivel = r.especialidades[especialidad];
	return (
		(r.estado === "descansado" || r.estado === "visitante") &&
		nivel !== undefined &&
		nivel >= 1
	);
}

function obtenerDefinicion(id: IdCeremonia, t: TablaCeremonias): DefCeremonia {
	const d = t[id];
	if (d === undefined) {
		throw new RangeError(`ceremonia desconocida '${id}'`);
	}
	return d;
}

/**
 * Motivo por el que no se puede celebrar la ceremonia, o `undefined` si se
 * puede. Prioridad: `sin-altar`, `armonia`, `espera`, `recursos`, `noche`,
 * `especialidad`.
 */
export function motivoNoPuede(
	e: EstadoSantuario,
	id: IdCeremonia,
	t: TablaCeremonias,
	registro: RegistroCeremonias,
	hayAltar: boolean,
): string | undefined {
	const d = obtenerDefinicion(id, t);
	if (!hayAltar) return "sin-altar";
	if (e.armonia < d.armoniaMin) return "armonia";
	const ultima = registro[id];
	if (ultima !== undefined && e.jornada - ultima < d.espera) return "espera";
	if (!puedePagarCoste(e.recursos, d.coste)) return "recursos";
	if (d.soloDeNoche && e.momento !== "noche") {
		return "noche";
	}
	const especialidadRequerida = d.requiereEspecialidad;
	if (
		especialidadRequerida !== undefined &&
		!e.residentes.some((r) => cumpleEspecialidad(r, especialidadRequerida))
	) {
		return "especialidad";
	}
	return undefined;
}

/** `true` si se puede celebrar la ceremonia. */
export function puedeCelebrar(
	e: EstadoSantuario,
	id: IdCeremonia,
	t: TablaCeremonias,
	registro: RegistroCeremonias,
	hayAltar: boolean,
): boolean {
	return motivoNoPuede(e, id, t, registro, hayAltar) === undefined;
}

/**
 * Celebra la ceremonia y devuelve el estado nuevo, el registro nuevo y los
 * eventos. Lanza `RangeError` con el motivo si no se puede celebrar.
 * No muta la entrada.
 */
export function celebrar(
	e: EstadoSantuario,
	id: IdCeremonia,
	t: TablaCeremonias,
	registro: RegistroCeremonias,
	hayAltar: boolean,
): {
	estado: EstadoSantuario;
	registro: RegistroCeremonias;
	bendicionViajero?: true;
	eventos: { tipo: "ceremonia"; id: IdCeremonia }[];
} {
	const motivo = motivoNoPuede(e, id, t, registro, hayAltar);
	if (motivo !== undefined) {
		throw new RangeError(`celebrar(): ${motivo}`);
	}

	const d = obtenerDefinicion(id, t);
	const nuevosRecursos = aplicarDescuentoCoste(e.recursos, d.coste);

	const nuevoRegistroMutable: Partial<Record<IdCeremonia, number>> = {
		...registro,
	};
	nuevoRegistroMutable[id] = e.jornada;
	const nuevoRegistro: RegistroCeremonias = nuevoRegistroMutable;

	let nuevosResidentes = e.residentes;
	let bendicionViajero: true | undefined;

	if (id === "festin-bayas") {
		nuevosResidentes = e.residentes.map((r) => ({
			...r,
			hambre: 100,
			animo: acotar0100(r.animo + 10),
		}));
	} else if (id === "fogata-ascuas") {
		nuevosResidentes = e.residentes.map((r) => ({
			...r,
			animo: acotar0100(r.animo + 15),
		}));
	} else if (id === "bendicion-viajero") {
		bendicionViajero = true;
	} else if (id === "purificacion") {
		nuevosResidentes = e.residentes.map((r) => {
			if (r.sombrio === undefined) return r;
			const nuevoSombrio = acotar0100(r.sombrio - 2);
			return { ...r, sombrio: nuevoSombrio };
		});
	}

	const estado: EstadoSantuario = {
		...e,
		recursos: nuevosRecursos,
		residentes: nuevosResidentes,
	};
	const eventos: { tipo: "ceremonia"; id: IdCeremonia }[] = [
		{ tipo: "ceremonia", id },
	];
	const resultado: {
		estado: EstadoSantuario;
		registro: RegistroCeremonias;
		bendicionViajero?: true;
		eventos: { tipo: "ceremonia"; id: IdCeremonia }[];
	} = { estado, registro: nuevoRegistro, eventos };
	if (bendicionViajero !== undefined) {
		resultado.bendicionViajero = true;
	}
	return resultado;
}

/** Las ceremonias que se pueden celebrar ahora, en orden canónico. */
export function ceremoniasDisponibles(
	e: EstadoSantuario,
	t: TablaCeremonias,
	registro: RegistroCeremonias,
	hayAltar: boolean,
): IdCeremonia[] {
	const disponibles: IdCeremonia[] = [];
	for (const id of ORDEN_CEREMONIAS) {
		if (puedeCelebrar(e, id, t, registro, hayAltar)) {
			disponibles.push(id);
		}
	}
	return disponibles;
}
