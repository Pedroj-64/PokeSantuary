import { crearRng } from "../rng.js";
import type {
	Edificio,
	EstadoSantuario,
	Loseta,
	Residente,
	SantuarioBalance,
	TipoLoseta,
} from "./estado.js";
import type { Fabricar } from "./expedicion.js";
import type { EventoSantuario, Paso } from "./jornada.js";

/** Receta de un hábitat: lo que hay que reunir en una ventana de 3 x 3. */
export interface RecetaHabitat {
	/** Losetas por tipo (ids de `TipoLoseta`). */
	loseta?: Partial<Record<TipoLoseta, number>>;
	/** Objetos de loseta: `flor`, `arbol`, `tocon`, `farol-apagado`, `farol-encendido`, `fogata-encendida` o `decoracion:<id>`. */
	objetos?: Record<string, number>;
	/** Ids de edificio cuyo anclaje debe caer dentro de la ventana. */
	edificios?: string[];
}

/**
 * Un hábitat del pack. Repite estructuralmente el esquema de `@santuario/data`
 * porque el núcleo no depende del paquete de datos.
 */
export interface HabitatData {
	id: string;
	/** Clave i18n del nombre. */
	nombre?: string;
	/** Clave i18n de la pista del Libro de Hábitats. */
	pista?: string;
	receta: RecetaHabitat;
	momento: "dia" | "noche";
	/** Especies que lo prefieren, en orden de preferencia. */
	especies: string[];
	/** Probabilidad por Alba de que llegue su visitante; 1 si falta. */
	raro?: number;
}

/** Por qué se va un visitante. */
export type MotivoVisita = "habitat" | "hambre" | "armonia" | "sinSitio";

/** Contexto que necesitan los pasos de hábitats: los datos y la fábrica. */
export interface ContextoJornada {
	habitats: readonly HabitatData[];
	/** La misma fábrica de residentes que usa la Expedición. */
	fabricar: Fabricar;
	/**
	 * Especies que la fábrica sabe crear (las del pack). Los hábitats pueden listar
	 * especies que aún no están en el pack: se ignoran. Si falta, valen todas.
	 */
	especiesDisponibles?: readonly string[];
}

/** Lado de la ventana de un hábitat. */
const LADO_VENTANA = 3;
/** Hambre mínima del visitante para quedarse (GDD §11.7). */
const HAMBRE_MINIMA_VISITANTE = 50;
/** Armonía mínima del Santuario para que el visitante se quede (GDD §11.7). */
const ARMONIA_MINIMA_VISITANTE = 40;
/** Jornadas que aguanta un visitante antes de ser residente (GDD §11.7). */
const JORNADAS_VISITANTE = 3;

/** ¿La loseta cubre esta clave de objeto de una receta? */
function coincideObjeto(l: Loseta, clave: string): boolean {
	if (l.objeto === clave) return true;
	if (clave === "farol-apagado") {
		return (
			(l.objeto === "farol" || l.objeto === "decoracion:farol") && !l.encendido
		);
	}
	if (clave === "farol-encendido") {
		return (
			(l.objeto === "farol" || l.objeto === "decoracion:farol") && l.encendido
		);
	}
	if (clave === "fogata-encendida") {
		return (
			(l.objeto === "fogata" || l.objeto === "decoracion:fogata") && l.encendido
		);
	}
	return false;
}

/** Un elemento de la receta que consume una loseta. */
type Requisito = { tipo: TipoLoseta } | { objeto: string };

/** Desglosa la receta en requisitos de una loseta cada uno. */
function requisitos(receta: RecetaHabitat): Requisito[] {
	const lista: Requisito[] = [];
	for (const [tipo, n] of Object.entries(receta.loseta ?? {})) {
		for (let i = 0; i < n; i++) lista.push({ tipo: tipo as TipoLoseta });
	}
	for (const [clave, n] of Object.entries(receta.objetos ?? {})) {
		for (let i = 0; i < n; i++) lista.push({ objeto: clave });
	}
	return lista;
}

/** ¿La loseta sirve para este requisito? */
function acepta(l: Loseta, req: Requisito): boolean {
	return "tipo" in req ? l.tipo === req.tipo : coincideObjeto(l, req.objeto);
}

/**
 * Empareja los requisitos con losetas distintas de la ventana (una loseta por
 * requisito). Devuelve los índices de loseta usados, o `undefined` si no hay
 * emparejamiento completo.
 */
function emparejar(
	losetas: readonly Loseta[],
	indices: readonly number[],
	reqs: readonly Requisito[],
): number[] | undefined {
	const deUnidad: number[] = reqs.map(() => -1);
	const deLoseta: number[] = indices.map(() => -1);
	const intentar = (u: number, visitadas: boolean[]): boolean => {
		const req = reqs[u];
		if (req === undefined) return false;
		for (let t = 0; t < indices.length; t++) {
			if (visitadas[t]) continue;
			const l = losetas[indices[t] ?? -1];
			if (l === undefined || !acepta(l, req)) continue;
			visitadas[t] = true;
			const anterior = deLoseta[t] ?? -1;
			if (anterior === -1 || intentar(anterior, visitadas)) {
				deLoseta[t] = u;
				deUnidad[u] = t;
				return true;
			}
		}
		return false;
	};
	for (let u = 0; u < reqs.length; u++) {
		if (
			!intentar(
				u,
				indices.map(() => false),
			)
		)
			return undefined;
	}
	const usados: number[] = [];
	for (const t of deUnidad) {
		const indice = t === -1 ? -1 : (indices[t] ?? -1);
		if (indice >= 0) usados.push(indice);
	}
	return usados;
}

/** ¿Están los edificios pedidos dentro de la ventana? */
function edificiosEnVentana(
	edificios: readonly Edificio[],
	x: number,
	y: number,
	requeridos: readonly string[] | undefined,
): boolean {
	if (requeridos === undefined || requeridos.length === 0) return true;
	const cuenta = new Map<string, number>();
	for (const id of requeridos) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
	for (const [id, n] of cuenta) {
		const dentro = edificios.filter(
			(ed) =>
				ed.tipo === id &&
				ed.x >= x &&
				ed.x < x + LADO_VENTANA &&
				ed.y >= y &&
				ed.y < y + LADO_VENTANA,
		).length;
		if (dentro < n) return false;
	}
	return true;
}

/**
 * Detecta los hábitats completos recorriendo la isla de arriba abajo y de
 * izquierda a derecha, ventana de 3 x 3 a ventana de 3 x 3.
 *
 * En cada ventana se elige la primera receta (en el orden recibido) que cumpla;
 * una loseta solo cuenta para un hábitat, así que las losetas que gasta un
 * hábitat no las puede reutilizar otro. El resultado son los ids encontrados
 * con la esquina superior izquierda de su ventana.
 */
export function detectarHabitats(
	e: EstadoSantuario,
	habitats: readonly HabitatData[],
): { id: string; x: number; y: number }[] {
	const ancho = e.terreno.ancho;
	const alto = e.terreno.alto;
	const usadas = new Set<number>();
	const encontrados: { id: string; x: number; y: number }[] = [];

	for (let y = 0; y + LADO_VENTANA <= alto; y++) {
		for (let x = 0; x + LADO_VENTANA <= ancho; x++) {
			const indices: number[] = [];
			for (let dy = 0; dy < LADO_VENTANA; dy++) {
				for (let dx = 0; dx < LADO_VENTANA; dx++) {
					const i = (y + dy) * ancho + (x + dx);
					if (!usadas.has(i)) indices.push(i);
				}
			}
			for (const habitat of habitats) {
				if (!edificiosEnVentana(e.edificios, x, y, habitat.receta.edificios)) {
					continue;
				}
				const usados = emparejar(
					e.terreno.losetas,
					indices,
					requisitos(habitat.receta),
				);
				if (usados === undefined) continue;
				for (const i of usados) usadas.add(i);
				encontrados.push({ id: habitat.id, x, y });
				break;
			}
		}
	}
	return encontrados;
}

/**
 * Residentes que caben según el nivel del Árbol Cenit. Espejo de
 * `gestion.capacidadResidentes`: se repite aquí para que `habitats.ts` no
 * dependa de `gestion.ts` (que a su vez importa `jornada.ts` y formaría un
 * ciclo de módulos).
 */
function cupoDeResidentes(e: EstadoSantuario, b: SantuarioBalance): number {
	const arbol = e.edificios.find((ed) => ed.tipo === "arbol-cenit");
	if (arbol === undefined) return 0;
	return b.capacidadArbol[arbol.nivel - 1] ?? 0;
}

/**
 * Paso `"habitats"` del Atardecer: recalcula los hábitats completos y, por cada
 * id nuevo, lo apunta en el Libro, lo deja pendiente de visitante y avisa.
 * Sin `ctx` no hace nada.
 */
export const pasoHabitats: Paso = (e, _b, _rng, ctx) => {
	if (!ctx) return { estado: { ...e }, eventos: [] };
	const encontrados = detectarHabitats(e, ctx.habitats);
	const eventos: EventoSantuario[] = [];
	const descubiertos = [...e.habitatsDescubiertos];
	const pendientes = [...e.habitatsPendientes];
	for (const { id, x, y } of encontrados) {
		if (descubiertos.includes(id)) continue;
		descubiertos.push(id);
		pendientes.push(id);
		eventos.push({ tipo: "habitatNuevo", id, x, y });
	}
	return {
		estado: {
			...e,
			habitatsCompletos: encontrados,
			habitatsDescubiertos: descubiertos,
			habitatsPendientes: pendientes,
		},
		eventos,
	};
};

/**
 * Paso `"visitantes-atardecer"`: decide si cada visitante se queda o se va.
 *
 * Se ejecuta DESPUÉS de la comida, así que evalúa el Hambre ya comida; la
 * Armonía es la de la jornada anterior. Solo decrementa `visitanteRestante`
 * cuando el hábitat sigue intacto, el Hambre llega a 50 y la Armonía a 40; al
 * llegar a 0 se vuelve residente si cabe (si no, se va sin sitio).
 */
export const pasoVisitantesAtardecer: Paso = (e, b) => {
	const cupo = cupoDeResidentes(e, b);
	const residentes: Residente[] = [];
	const eventos: EventoSantuario[] = [];
	let noVisitantes = e.residentes.filter(
		(r) => r.estado !== "visitante",
	).length;

	for (const r of e.residentes) {
		if (r.estado !== "visitante") {
			residentes.push(r);
			continue;
		}
		if (!e.habitatsCompletos.some((h) => h.id === r.habitat)) {
			eventos.push({ tipo: "visitanteSeVa", uid: r.uid, motivo: "habitat" });
			continue;
		}
		if (r.hambre < HAMBRE_MINIMA_VISITANTE) {
			eventos.push({ tipo: "visitanteSeVa", uid: r.uid, motivo: "hambre" });
			continue;
		}
		if (e.armonia < ARMONIA_MINIMA_VISITANTE) {
			eventos.push({ tipo: "visitanteSeVa", uid: r.uid, motivo: "armonia" });
			continue;
		}
		const restante = (r.visitanteRestante ?? 0) - 1;
		if (restante > 0) {
			residentes.push({ ...r, visitanteRestante: restante });
			continue;
		}
		if (noVisitantes < cupo) {
			noVisitantes++;
			residentes.push({
				...r,
				estado: "descansado",
				origen: "habitat",
				visitanteRestante: restante,
			});
			eventos.push({ tipo: "visitanteSeQueda", uid: r.uid });
		} else {
			eventos.push({ tipo: "visitanteSeVa", uid: r.uid, motivo: "sinSitio" });
		}
	}

	return { estado: { ...e, residentes }, eventos };
};

/**
 * Paso `"visitantes"` del Alba: por cada hábitat pendiente busca una especie que
 * lo prefiera y no esté ya en el Santuario, prefiriendo las no vistas. El
 * sorteo de `raro` decide si llega; si no pasa, el hábitat sigue pendiente.
 * Sin `ctx` no hace nada.
 */
export const pasoVisitantesAlba: Paso = (e, _b, _rng, ctx) => {
	if (!ctx) return { estado: { ...e }, eventos: [] };
	const { habitats, fabricar } = ctx;
	const residentes = [...e.residentes];
	const vistas = [...e.vistas];
	const pendientes: string[] = [];
	const eventos: EventoSantuario[] = [];
	let siguienteUid = e.siguienteUid;

	for (const id of e.habitatsPendientes) {
		const habitat = habitats.find((h) => h.id === id);
		if (habitat === undefined) {
			pendientes.push(id);
			continue;
		}
		const presentes = new Set(residentes.map((r) => r.especie));
		const candidatas = habitat.especies.filter(
			(s) =>
				!presentes.has(s) &&
				(ctx.especiesDisponibles === undefined ||
					ctx.especiesDisponibles.includes(s)),
		);
		if (candidatas.length === 0) {
			pendientes.push(id);
			continue;
		}
		const yaVistas = new Set(vistas);
		const noVistas = candidatas.filter((s) => !yaVistas.has(s));
		const pool = noVistas.length > 0 ? noVistas : candidatas;

		const rng = crearRng(`${e.semilla}:habitat:${id}:${e.jornada}`);
		if (rng.siguiente() >= (habitat.raro ?? 1)) {
			pendientes.push(id);
			continue;
		}
		const especie = pool[rng.entero(0, pool.length - 1)] ?? pool[0] ?? "";
		const uid = `r${siguienteUid}`;
		siguienteUid++;
		const nuevo = fabricar({ especie, rng, uid, origen: "habitat" });
		residentes.push({
			...nuevo,
			uid,
			especie,
			estado: "visitante",
			visitanteRestante: JORNADAS_VISITANTE,
			origen: "habitat",
			habitat: id,
		});
		if (!yaVistas.has(especie)) vistas.push(especie);
		eventos.push({ tipo: "visitanteLlega", uid, especie, habitat: id });
	}

	return {
		estado: {
			...e,
			residentes,
			vistas,
			habitatsPendientes: pendientes,
			siguienteUid,
		},
		eventos,
	};
};
