import { crearRng, type Rng } from "../rng.js";
import { efectoDeCodigos } from "./codigos.js";
import type {
	EstadoSantuario,
	Residente,
	Sabor,
	SantuarioBalance,
} from "./estado.js";
import {
	type ContextoJornada,
	pasoHabitats,
	pasoVisitantesAlba,
	pasoVisitantesAtardecer,
} from "./habitats.js";
import { pasoObra, pasoProduccion } from "./produccion.js";
import { pasoTerreno } from "./terreno.js";

/** Eventos que produce un paso de la jornada; las Tareas 3 a 5 añaden los suyos. */
export type EventoSantuario =
	| { tipo: "avisoInquietud"; uid: string }
	| { tipo: "seVa"; uid: string }
	| { tipo: "comio"; uid: string; sabor: Sabor }
	| { tipo: "sinBayas"; uid: string }
	| { tipo: "recursoPerdido"; recurso: string; cantidad: number }
	| { tipo: string; [k: string]: unknown };

/** Resultado de resolver un momento: estado nuevo y eventos para la escena. */
export interface Resultado {
	estado: EstadoSantuario;
	eventos: EventoSantuario[];
}

/** Un paso de la jornada; recibe y devuelve estado sin mutarlo. */
export type Paso = (
	e: EstadoSantuario,
	b: SantuarioBalance,
	rng: Rng,
	/** Datos y fábrica que solo necesitan los pasos de hábitats. */
	ctx?: ContextoJornada,
) => Resultado;

// Orden canónico de sabores para elegir baya de forma determinista.
const SABORES: readonly Sabor[] = [
	"picante",
	"seco",
	"dulce",
	"amargo",
	"acido",
	"neutro",
];

/** Acota un número a [min, max]. */
function acotar(valor: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, valor));
}

/**
 * Baja el Hambre y hace comer una baya a quien baje del umbral.
 *
 * La baya se elige primero por sabor favorito, luego por cualquiera que no sea
 * el que no le gusta, y por último el que no le gusta. Los residentes se
 * procesan por uid ascendente. El cambio de Ánimo de la comida se aplica aquí
 * (acotado) y el paso de Ánimo suma después el resto de la tabla.
 */
const pasoComida: Paso = (e, b) => {
	const recursos = { ...e.recursos };
	const residentes = e.residentes.map((r) => ({ ...r }));
	const eventos: EventoSantuario[] = [];
	const orden = residentes
		.map((_, i) => i)
		.sort((a, z) => {
			const ua = residentes[a]?.uid ?? "";
			const uz = residentes[z]?.uid ?? "";
			return ua < uz ? -1 : ua > uz ? 1 : 0;
		});

	for (const i of orden) {
		const r = residentes[i];
		if (r === undefined) continue;
		const hambre = acotar(r.hambre - b.comida.caidaPorJornada, 0, 100);
		if (hambre >= b.comida.umbral) {
			residentes[i] = { ...r, hambre };
			continue;
		}

		const disponibles = SABORES.filter(
			(sabor) => (recursos[`baya:${sabor}`] ?? 0) > 0,
		);
		if (disponibles.length === 0) {
			residentes[i] = { ...r, hambre };
			eventos.push({ tipo: "sinBayas", uid: r.uid });
			continue;
		}

		const preferencia = b.comida.sabores[r.naturaleza];
		if (preferencia === undefined) {
			throw new RangeError(
				`comida(): naturaleza desconocida '${r.naturaleza}' en ${r.uid}`,
			);
		}
		const elegido =
			(recursos[`baya:${preferencia.favorito}`] ?? 0) > 0
				? preferencia.favorito
				: (disponibles.find((sabor) => sabor !== preferencia.noGusta) ??
					disponibles[0]);
		if (elegido === undefined) {
			residentes[i] = { ...r, hambre };
			eventos.push({ tipo: "sinBayas", uid: r.uid });
			continue;
		}

		const clave = `baya:${elegido}`;
		recursos[clave] = (recursos[clave] ?? 0) - 1;
		// Las naturalezas neutras tienen favorito y noGusta "neutro": cualquier
		// baya les sienta neutra. La baya neutra también usa el efecto neutro
		// para el resto, y es el efecto de "otra" baya.
		const favorita =
			preferencia.favorito !== "neutro" && elegido === preferencia.favorito;
		const noGusta =
			preferencia.noGusta !== "neutro" && elegido === preferencia.noGusta;
		const efecto = favorita
			? b.comida.favorita
			: noGusta
				? b.comida.noGusta
				: b.comida.neutra;
		residentes[i] = {
			...r,
			hambre: acotar(hambre + efecto.hambre, 0, 100),
			animo: acotar(r.animo + efecto.animo, 0, 100),
		};
		eventos.push({ tipo: "comio", uid: r.uid, sabor: elegido });
	}

	return { estado: { ...e, residentes, recursos }, eventos };
};

/**
 * Suma la tabla de Ánimo de cada residente y acota el resultado a 0..100.
 *
 * El Confort se calcula una vez por zona. Animar se aplica una sola vez por
 * zona aunque haya varios animadores.
 */
const pasoAnimo: Paso = (e, b) => {
	const animadas = new Set(
		e.residentes
			.filter(
				(r) => r.tarea.tipo === "especialidad" && r.tarea.accion === "animar",
			)
			.map((r) => r.zona),
	);
	const confort = new Map<number, number>();
	const confortDe = (zona: number): number => {
		const guardado = confort.get(zona);
		if (guardado !== undefined) return guardado;
		const valor = confortDeZona(e, zona, b);
		confort.set(zona, valor);
		return valor;
	};

	// Códigos del Altar: Ánimo fijo por jornada para todos (puede ser negativo).
	const animoCodigos = efectoDeCodigos(
		e.codigos ?? {},
		b.codigos,
	).animoPorJornada;
	const residentes = e.residentes.map((r) => {
		let delta = animoCodigos;
		if (r.trabajoHoy === "preferido") delta += b.animo.preferido;
		else if (r.trabajoHoy === "no-preferido") delta += b.animo.noPreferido;
		delta += b.animo.confortFactor * (confortDe(r.zona) - b.animo.confortBase);
		if (r.hambre < b.animo.hambreBajaUmbral) delta += b.animo.hambreBaja;
		if (r.peticionCumplidaHoy) delta += b.animo.peticion;
		if (e.temaCharla === "animo") delta += b.animo.temaAnimo;
		if (r.lecho === undefined) delta += b.animo.sinLecho;
		if (r.estado === "agotado") delta += b.animo.agotado;
		if (r.sombrio !== undefined) delta += b.animo.sombrioSuelto;
		if (r.habloHoy) delta += b.animo.hablo;
		if (animadas.has(r.zona)) delta += b.animo.animar;
		return { ...r, animo: acotar(r.animo + delta, 0, 100) };
	});

	return { estado: { ...e, residentes }, eventos: [] };
};

/** Calcula la Armonía con los Ánimos ya actualizados del Atardecer. */
const pasoConfortArmonia: Paso = (e, b) => ({
	estado: { ...e, armonia: calcularArmonia(e, b) },
	eventos: [],
});

/** Avisa a los 3 días de Inquietud y saca a quien llega a 4. */
const pasoInquietud: Paso = (e, b) => {
	const residentes: Residente[] = [];
	const eventos: EventoSantuario[] = [];
	for (const r of e.residentes) {
		const enRiesgo =
			e.armonia < b.armonia.umbralBajo && r.animo < b.inquietud.animoUmbral;
		const diasInquieto = enRiesgo ? r.diasInquieto + 1 : 0;
		if (diasInquieto >= b.inquietud.jornadasSalida) {
			eventos.push({ tipo: "seVa", uid: r.uid });
			continue;
		}
		if (diasInquieto === b.inquietud.jornadasAviso) {
			eventos.push({ tipo: "avisoInquietud", uid: r.uid });
		}
		residentes.push({ ...r, diasInquieto });
	}
	return { estado: { ...e, residentes }, eventos };
};

/** Los agotados descansan y el momento pasa a noche. */
const pasoCierre: Paso = (e) => ({
	estado: {
		...e,
		momento: "noche",
		residentes: e.residentes.map((r) =>
			r.estado === "agotado" ? { ...r, estado: "descansado" } : r,
		),
	},
	eventos: [],
});

/**
 * Pasos del Atardecer, EN ORDEN. Los hábitats se recalculan tras el terreno y
 * los visitantes se evalúan tras la comida (con el Hambre ya comida).
 */
export const PASOS_ATARDECER: { id: string; paso: Paso }[] = [
	{ id: "obra", paso: pasoObra },
	{ id: "produccion", paso: pasoProduccion },
	{ id: "terreno", paso: pasoTerreno },
	{ id: "habitats", paso: pasoHabitats },
	{ id: "comida", paso: pasoComida },
	{ id: "visitantes-atardecer", paso: pasoVisitantesAtardecer },
	{ id: "animo", paso: pasoAnimo },
	{ id: "confort-armonia", paso: pasoConfortArmonia },
	{ id: "inquietud", paso: pasoInquietud },
	{ id: "cierre", paso: pasoCierre },
];

/** Pasos del Alba: la llegada de visitantes a los hábitats pendientes. */
export const PASOS_ALBA: { id: string; paso: Paso }[] = [
	{ id: "visitantes", paso: pasoVisitantesAlba },
];

/** Zona de la isla que contiene la loseta (x, y). */
export function zonaDe(x: number, y: number, b: SantuarioBalance): number {
	const lado = b.isla.zona;
	const columnas = b.isla.ancho / lado;
	return Math.floor(y / lado) * columnas + Math.floor(x / lado);
}

/** Puntos de Confort que aportan las decoraciones de una zona. */
export function puntosDecoracion(
	e: EstadoSantuario,
	zona: number,
	b: SantuarioBalance,
): number {
	const lado = b.isla.zona;
	const columnas = b.isla.ancho / lado;
	const x0 = (zona % columnas) * lado;
	const y0 = Math.floor(zona / columnas) * lado;
	let total = 0;
	for (let y = y0; y < y0 + lado; y++) {
		for (let x = x0; x < x0 + lado; x++) {
			const objeto = e.terreno.losetas[y * e.terreno.ancho + x]?.objeto;
			if (objeto === undefined || !objeto.startsWith("decoracion:")) continue;
			const id = objeto.slice("decoracion:".length);
			const decoracion = b.decoraciones.find((d) => d.id === id);
			if (decoracion !== undefined) total += decoracion.puntos;
		}
	}
	return total;
}

/**
 * Confort de una zona: 1 + un punto por cada `puntosPorNivel` de decoración,
 * más hábitat completo y 3 especies distintas, menos un Sombrío (todavía no
 * hay Purificador), acotado al rango del balance.
 */
export function confortDeZona(
	e: EstadoSantuario,
	zona: number,
	b: SantuarioBalance,
): number {
	const puntos = puntosDecoracion(e, zona, b);
	const habitat = e.habitatsCompletos.some((h) => zonaDe(h.x, h.y, b) === zona);
	const especies = new Set(
		e.residentes.filter((r) => r.zona === zona).map((r) => r.especie),
	);
	const sombrio = e.residentes.some(
		(r) => r.zona === zona && r.sombrio !== undefined,
	);
	const valor =
		1 +
		Math.floor(puntos / b.confort.puntosPorNivel) +
		(habitat ? 1 : 0) +
		(especies.size >= 3 ? 1 : 0) -
		(sombrio ? 1 : 0);
	return acotar(valor, b.confort.min, b.confort.max);
}

/**
 * Armonía del Atardecer: 0,6 del Ánimo medio y 0,4 de 20 veces el Confort
 * medio de las zonas con residentes. Sin residentes se queda en 50.
 */
export function calcularArmonia(
	e: EstadoSantuario,
	b: SantuarioBalance,
): number {
	if (e.residentes.length === 0) return 50;
	const animoMedio =
		e.residentes.reduce((suma, r) => suma + r.animo, 0) / e.residentes.length;
	const zonas = [...new Set(e.residentes.map((r) => r.zona))];
	const confortMedio =
		zonas.reduce((suma, zona) => suma + confortDeZona(e, zona, b), 0) /
		zonas.length;
	const valor = Math.round(
		b.armonia.pesoAnimo * animoMedio +
			b.armonia.pesoConfort * b.armonia.factorConfort * confortMedio,
	);
	return acotar(valor, 0, 100);
}

/** Uids de quienes están en Inquietud ahora mismo (Armonía y Ánimo bajos). */
export function inquietos(e: EstadoSantuario, b: SantuarioBalance): string[] {
	return e.residentes
		.filter(
			(r) =>
				e.armonia < b.armonia.umbralBajo && r.animo < b.inquietud.animoUmbral,
		)
		.map((r) => r.uid);
}

/**
 * Resuelve el Atardecer entero con `crearRng(semilla:jornada:n)`.
 *
 * @throws {Error} Si el estado no está en el momento "atardecer".
 * @param ctx? Datos y fábrica para los pasos de hábitats; sin él no detectan.
 */
export function resolverAtardecer(
	e: EstadoSantuario,
	b: SantuarioBalance,
	ctx?: ContextoJornada,
): Resultado {
	if (e.momento !== "atardecer") {
		throw new Error(
			`resolverAtardecer(): el momento debe ser "atardecer" (recibido "${e.momento}")`,
		);
	}
	const rng = crearRng(`${e.semilla}:jornada:${e.jornada}`);
	let estado = e;
	const eventos: EventoSantuario[] = [];
	for (const { paso } of PASOS_ATARDECER) {
		const resultado = paso(estado, b, rng, ctx);
		estado = resultado.estado;
		eventos.push(...resultado.eventos);
	}
	return { estado, eventos };
}

/**
 * Pasa a la jornada siguiente al alba, reinicia las banderas diarias y ejecuta
 * los pasos del Alba con `crearRng(semilla:alba:<jornada nueva>)`.
 *
 * @throws {Error} Si el estado no está en el momento "noche".
 * @param ctx? Datos y fábrica para la llegada de visitantes; sin él no llegan.
 */
export function amanecer(
	e: EstadoSantuario,
	b: SantuarioBalance,
	ctx?: ContextoJornada,
): Resultado {
	if (e.momento !== "noche") {
		throw new Error(
			`amanecer(): el momento debe ser "noche" (recibido "${e.momento}")`,
		);
	}
	const jornada = e.jornada + 1;
	const rng = crearRng(`${e.semilla}:alba:${jornada}`);
	let estado: EstadoSantuario = {
		...e,
		jornada,
		momento: "alba",
		temaCharla: undefined,
		residentes: e.residentes.map((r) => ({
			...r,
			habloHoy: false,
			peticionCumplidaHoy: false,
			trabajoHoy: "ninguno",
		})),
	};
	const eventos: EventoSantuario[] = [];
	for (const { paso } of PASOS_ALBA) {
		const resultado = paso(estado, b, rng, ctx);
		estado = resultado.estado;
		eventos.push(...resultado.eventos);
	}
	return { estado, eventos };
}
