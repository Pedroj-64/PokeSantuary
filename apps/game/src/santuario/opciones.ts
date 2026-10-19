import {
	asignarLecho,
	asignarTarea,
	colocarCamino,
	colocarDecoracion,
	colocarKit,
	type EstadoSantuario,
	marcarAccion,
	mejorarEdificio,
	type SantuarioBalance,
	type Tarea,
} from "@santuario/core";

/**
 * Qué opciones ofrecer en el panel de gestión. Para saber si algo se puede hacer se
 * prueba la regla del núcleo (`colocarKit`, `asignarTarea`...) sobre una copia: así
 * la interfaz nunca ofrece lo que el núcleo rechazaría y las reglas viven en un solo sitio.
 */

/** Intenta una orden del núcleo: `undefined` si es legal, el motivo si no. */
function rechazo(orden: () => unknown): string | undefined {
	try {
		orden();
		return undefined;
	} catch (e) {
		if (e instanceof RangeError) return e.message;
		throw e;
	}
}

export interface Etiqueta {
	clave: string;
	params?: Record<string, string>;
}

export interface OpcionKit {
	tipo: string;
	coste: Record<string, number>;
	/** ¿Hay materiales para pagarlo ahora? */
	asequible: boolean;
}

const nivelDelArbol = (e: EstadoSantuario): number =>
	e.edificios.find((x) => x.tipo === "arbol-cenit")?.nivel ?? 1;

const alcanza = (
	recursos: Readonly<Record<string, number>>,
	coste: Readonly<Record<string, number>>,
): boolean =>
	Object.entries(coste).every(([recurso, n]) => (recursos[recurso] ?? 0) >= n);

/** Kits que se pueden construir con el nivel actual del Árbol Cenit (sin el propio Árbol). */
export function kitsDisponibles(
	e: EstadoSantuario,
	b: SantuarioBalance,
): OpcionKit[] {
	const nivel = nivelDelArbol(e);
	return b.edificios
		.filter(
			(d) =>
				d.id !== "arbol-cenit" &&
				Object.keys(d.kit).length > 0 &&
				d.requiereArbol <= nivel,
		)
		.map((d) => ({
			tipo: d.id,
			coste: { ...d.kit },
			asequible: alcanza(e.recursos, d.kit),
		}));
}

/** ¿Se puede colocar este kit aquí? Si no, el motivo que da el núcleo. */
export function puedeColocar(
	e: EstadoSantuario,
	tipo: string,
	x: number,
	y: number,
	b: SantuarioBalance,
): { ok: true } | { ok: false; motivo: string } {
	const motivo = rechazo(() => colocarKit(e, tipo, x, y, b));
	return motivo === undefined ? { ok: true } : { ok: false, motivo };
}

export interface OpcionTarea {
	tarea: Tarea;
	etiqueta: Etiqueta;
}

/** Tareas que puede hacer un residente ahora: nada, trabajar en un edificio con plaza o construir. */
export function tareasPosibles(
	e: EstadoSantuario,
	uid: string,
	b: SantuarioBalance,
): OpcionTarea[] {
	const opciones: OpcionTarea[] = [
		{ tarea: { tipo: "nada" }, etiqueta: { clave: "gestion.tarea.nada" } },
	];
	for (const ed of e.edificios) {
		const tarea: Tarea =
			ed.obraRestante > 0
				? { tipo: "construir", edificio: ed.uid }
				: { tipo: "trabajo", edificio: ed.uid };
		if (rechazo(() => asignarTarea(e, uid, tarea, b)) !== undefined) continue;
		opciones.push({
			tarea,
			etiqueta: {
				clave: `gestion.tarea.${tarea.tipo}`,
				params: { edificio: ed.tipo },
			},
		});
	}
	return opciones;
}

/** Uids de los lechos que se le pueden asignar a un residente. */
export function lechosPosibles(
	e: EstadoSantuario,
	uid: string,
	b: SantuarioBalance,
): string[] {
	return e.edificios
		.filter(
			(ed) =>
				ed.tipo.startsWith("lecho-") &&
				rechazo(() => asignarLecho(e, uid, ed.uid, b)) === undefined,
		)
		.map((ed) => ed.uid);
}

export interface OpcionMejora {
	uid: string;
	tipo: string;
	nivel: number;
	/** Coste de subir un nivel: el doble del kit. */
	coste: Record<string, number>;
	asequible: boolean;
}

/** Edificios que aún pueden subir de nivel, con su coste y si se puede pagar. */
export function mejorasPosibles(
	e: EstadoSantuario,
	b: SantuarioBalance,
): OpcionMejora[] {
	const lista: OpcionMejora[] = [];
	for (const ed of e.edificios) {
		const def = b.edificios.find((d) => d.id === ed.tipo);
		if (
			def === undefined ||
			ed.tipo === "arbol-cenit" ||
			ed.obraRestante > 0 ||
			ed.nivel >= def.nivelMax
		)
			continue;
		const coste = Object.fromEntries(
			Object.entries(def.kit).map(([r, n]) => [r, n * 2]),
		);
		lista.push({
			uid: ed.uid,
			tipo: ed.tipo,
			nivel: ed.nivel,
			coste,
			asequible: rechazo(() => mejorarEdificio(e, ed.uid, b)) === undefined,
		});
	}
	return lista;
}

/** Especialidades que cambian el terreno (las demás actúan en otros sitios). */
export const ACCIONES_DE_TERRENO = [
	"crecer",
	"regar",
	"romper",
	"cortar",
	"encender",
] as const;

/** Resultado de probar una orden de terreno: legal, o el motivo que da el núcleo. */
export type Prueba = { ok: true } | { ok: false; motivo: string };
const prueba = (orden: () => unknown): Prueba => {
	const motivo = rechazo(orden);
	return motivo === undefined ? { ok: true } : { ok: false, motivo };
};

/** Residentes que pueden marcar una acción de terreno ahora, con las que saben hacer. */
export function residentesConTerreno(
	e: EstadoSantuario,
): { uid: string; acciones: string[] }[] {
	return e.residentes.flatMap((r) => {
		if (
			(r.estado !== "descansado" && r.estado !== "visitante") ||
			r.tarea.tipo !== "nada"
		)
			return [];
		const acciones = ACCIONES_DE_TERRENO.filter(
			(a) => (r.especialidades[a] ?? 0) >= 1,
		);
		return acciones.length > 0 ? [{ uid: r.uid, acciones: [...acciones] }] : [];
	});
}

/** ¿Puede este residente hacer esta acción en esta loseta? */
export function puedeMarcar(
	e: EstadoSantuario,
	uid: string,
	accion: string,
	x: number,
	y: number,
	b: SantuarioBalance,
): Prueba {
	return prueba(() => marcarAccion(e, uid, accion, x, y, b));
}

/** ¿Se puede trazar un camino en esta loseta (cuesta piedra)? */
export function puedeCamino(
	e: EstadoSantuario,
	x: number,
	y: number,
	b: SantuarioBalance,
): Prueba {
	return prueba(() => colocarCamino(e, x, y, b));
}

/** ¿Se puede colocar esta decoración aquí? */
export function puedeDecorar(
	e: EstadoSantuario,
	id: string,
	x: number,
	y: number,
	b: SantuarioBalance,
): Prueba {
	return prueba(() => colocarDecoracion(e, id, x, y, b));
}

export interface OpcionDecoracion {
	id: string;
	puntos: number;
	coste: Record<string, number>;
	asequible: boolean;
}

/** Decoraciones del balance con su coste y si hay materiales para pagarlas. */
export function decoracionesDisponibles(
	e: EstadoSantuario,
	b: SantuarioBalance,
): OpcionDecoracion[] {
	return b.decoraciones.map((d) => ({
		id: d.id,
		puntos: d.puntos,
		coste: { ...d.coste },
		asequible: alcanza(e.recursos, d.coste),
	}));
}
