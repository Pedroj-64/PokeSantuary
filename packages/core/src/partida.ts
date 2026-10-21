import type {
	EstadoExpedicion,
	EstadoExpedicion as Expedicion,
	MiembroExp,
} from "./expedicion.js";
import type {
	SantuarioBalance,
	Tarea,
	TemaCharla,
} from "./santuario/estado.js";
import { crearSantuario, type EstadoSantuario } from "./santuario/estado.js";
import {
	iniciarDesdeSantuario,
	liquidarEnSantuario,
} from "./santuario/expedicion.js";
import {
	asignarLecho,
	asignarTarea,
	colocarKit,
	mejorarEdificio,
} from "./santuario/gestion.js";
import type { ContextoJornada } from "./santuario/habitats.js";
import {
	amanecer,
	type EventoSantuario,
	resolverAtardecer,
} from "./santuario/jornada.js";
import { aplicarRetorno, type CatalogoProgresion } from "./santuario/puente.js";
import {
	colocarCamino,
	colocarDecoracion,
	desmarcarAccion,
	marcarAccion,
} from "./santuario/terreno.js";

/** Versión del formato de la partida; sube con cada cambio que necesite migración. */
export const VERSION_PARTIDA = 1;

/** Todo lo que se guarda de una partida. */
export interface EstadoPartida {
	version: number;
	santuario: EstadoSantuario;
	/** Solo mientras hay una expedición en curso o recién terminada que aún no se liquidó. */
	expedicion?: Expedicion;
	/** Jornada en la que salió la última expedición: como mucho una por jornada. */
	expedicionJornada?: number;
	/** Especies que volvieron de una expedición y no cupieron; esperan sitio en el Santuario. */
	pendientesDeSitio: string[];
}

/** Datos que necesita el reductor y que no se guardan: balance, hábitats y fábrica de residentes. */
export type ContextoPartida = {
	balance: SantuarioBalance;
	/** Datos de progresión por especie; sin ellos, la expedición no lleva niveles ni movimientos. */
	progresion?: CatalogoProgresion;
	/** Nivel del Gimnasio del Santuario (0 por defecto): fija el nivel de salida de los residentes. */
	nivelGimnasio?: number;
} & ContextoJornada;

export type AccionPartida =
	| { tipo: "elegirTema"; tema: TemaCharla }
	| { tipo: "comenzarDia" }
	| { tipo: "asignarTarea"; uid: string; tarea: Tarea }
	| { tipo: "asignarLecho"; uid: string; edificio?: string }
	| { tipo: "colocarKit"; edificio: string; x: number; y: number }
	| { tipo: "mejorarEdificio"; uid: string }
	| { tipo: "marcarAccion"; uid: string; accion: string; x: number; y: number }
	| { tipo: "desmarcarAccion"; uid: string }
	| { tipo: "colocarCamino"; x: number; y: number }
	| { tipo: "colocarDecoracion"; id: string; x: number; y: number }
	| { tipo: "pasarDia" }
	| { tipo: "dormir" }
	| {
			tipo: "salirAExpedicion";
			uids: string[];
			semilla: string;
			/** Dinero y mochila con los que empieza la expedición (los pone el balance de la expedición). */
			dinero?: number;
			mochila?: Record<string, number>;
			/** Llamas del Farol con las que sale (las calcula `llamasIniciales`); sin ellas, perder termina la expedición. */
			llamas?: number;
			/** Miembros ya armados con `miembroDeResidente`, en el orden de `uids`. */
			miembros?: MiembroExp[];
	  }
	/** La escena avanza la expedición con las funciones de `expedicion.ts` y la deja aquí. */
	| { tipo: "actualizarExpedicion"; expedicion: EstadoExpedicion }
	| { tipo: "volverDeExpedicion" };

/** Estado nuevo y lo que la escena anima ("llegó un visitante", "se terminó una obra"...). */
export interface ResultadoPartida {
	partida: EstadoPartida;
	eventos: EventoSantuario[];
}

/** Una partida nueva: Alba de la jornada 1. */
export function crearPartida(
	semilla: string,
	balance: SantuarioBalance,
): EstadoPartida {
	return {
		version: VERSION_PARTIDA,
		santuario: crearSantuario(semilla, balance),
		pendientesDeSitio: [],
	};
}

function exigirMomento(
	p: EstadoPartida,
	momento: EstadoSantuario["momento"],
	accion: string,
): void {
	if (p.santuario.momento !== momento) {
		throw new RangeError(
			`${accion}: solo vale en "${momento}" (ahora es "${p.santuario.momento}")`,
		);
	}
}

/** Gestión del Santuario: de día y sin expedición en curso. */
function exigirGestion(p: EstadoPartida, accion: string): void {
	exigirMomento(p, "dia", accion);
	if (p.expedicion !== undefined) {
		throw new RangeError(`${accion}: hay una expedición en curso`);
	}
}

/** Cambia solo el Santuario de la partida. */
const conSantuario = (
	p: EstadoPartida,
	santuario: EstadoSantuario,
): ResultadoPartida => ({
	partida: { ...p, santuario },
	eventos: [],
});

/**
 * Aplica una acción a la partida. Es pura y determinista: la misma partida y la
 * misma acción dan siempre el mismo resultado. Una orden ilegal lanza `RangeError`
 * y no cambia nada.
 */
export function reducir(
	p: EstadoPartida,
	a: AccionPartida,
	ctx: ContextoPartida,
): ResultadoPartida {
	const s = p.santuario;
	const b = ctx.balance;
	switch (a.tipo) {
		case "elegirTema":
			exigirMomento(p, "alba", "elegirTema");
			return conSantuario(p, { ...s, temaCharla: a.tema });
		case "comenzarDia":
			exigirMomento(p, "alba", "comenzarDia");
			return conSantuario(p, { ...s, momento: "dia" });
		case "asignarTarea":
			exigirGestion(p, "asignarTarea");
			return conSantuario(p, asignarTarea(s, a.uid, a.tarea, b));
		case "asignarLecho":
			exigirGestion(p, "asignarLecho");
			return conSantuario(p, asignarLecho(s, a.uid, a.edificio, b));
		case "colocarKit":
			exigirGestion(p, "colocarKit");
			return conSantuario(p, colocarKit(s, a.edificio, a.x, a.y, b));
		case "mejorarEdificio":
			exigirGestion(p, "mejorarEdificio");
			return conSantuario(p, mejorarEdificio(s, a.uid, b));
		case "marcarAccion":
			exigirGestion(p, "marcarAccion");
			return conSantuario(p, marcarAccion(s, a.uid, a.accion, a.x, a.y, b));
		case "desmarcarAccion":
			exigirGestion(p, "desmarcarAccion");
			return conSantuario(p, desmarcarAccion(s, a.uid));
		case "colocarCamino":
			exigirGestion(p, "colocarCamino");
			return conSantuario(p, colocarCamino(s, a.x, a.y, b));
		case "colocarDecoracion":
			exigirGestion(p, "colocarDecoracion");
			return conSantuario(p, colocarDecoracion(s, a.id, a.x, a.y, b));
		case "pasarDia": {
			exigirGestion(p, "pasarDia");
			const r = resolverAtardecer({ ...s, momento: "atardecer" }, b, ctx);
			return { partida: { ...p, santuario: r.estado }, eventos: r.eventos };
		}
		case "dormir": {
			exigirMomento(p, "noche", "dormir");
			const r = amanecer(s, b, ctx);
			return { partida: { ...p, santuario: r.estado }, eventos: r.eventos };
		}
		case "salirAExpedicion": {
			exigirGestion(p, "salirAExpedicion");
			if (p.expedicionJornada === s.jornada) {
				throw new RangeError(
					"salirAExpedicion: ya salió una expedición en esta jornada",
				);
			}
			const base = iniciarDesdeSantuario(s, a.uids, a.semilla);
			if (a.miembros !== undefined && a.miembros.length !== a.uids.length) {
				throw new RangeError(
					"salirAExpedicion: 'miembros' debe tener uno por residente",
				);
			}
			const expedicion = {
				...base,
				equipo: base.equipo.map((m, i) => ({ ...m, ...a.miembros?.[i] })),
				dinero: a.dinero ?? 0,
				mochila: a.mochila ?? {},
				...(a.llamas !== undefined && { llamas: a.llamas, fallidos: [] }),
			};
			return {
				partida: { ...p, expedicion, expedicionJornada: s.jornada },
				eventos: [],
			};
		}
		case "actualizarExpedicion":
			if (p.expedicion === undefined) {
				throw new RangeError(
					"actualizarExpedicion: no hay expedición en curso",
				);
			}
			return { partida: { ...p, expedicion: a.expedicion }, eventos: [] };
		case "volverDeExpedicion": {
			exigirMomento(p, "dia", "volverDeExpedicion");
			if (p.expedicion === undefined) {
				throw new RangeError("volverDeExpedicion: no hay expedición");
			}
			const liquidada = liquidarEnSantuario(s, p.expedicion, b, ctx.fabricar);
			const catalogo = ctx.progresion;
			let liquidado = liquidada.estado;
			if (catalogo !== undefined) {
				// Lo aprendido y las evoluciones vuelven con el residente; los niveles, no (GDD §6.10).
				const volvieron = new Map(
					p.expedicion.equipo.flatMap((m) =>
						m.uid === undefined ? [] : [[m.uid, m] as const],
					),
				);
				liquidado = {
					...liquidado,
					residentes: liquidado.residentes.map((r) => {
						const m = volvieron.get(r.uid);
						return m === undefined
							? r
							: aplicarRetorno(r, m, catalogo, ctx.nivelGimnasio ?? 0);
					}),
				};
			}
			// Al volver se cierra el día: el Atardecer se resuelve de una vez.
			const atardecer = resolverAtardecer(
				{ ...liquidado, momento: "atardecer" },
				b,
				ctx,
			);
			return {
				partida: {
					...p,
					santuario: atardecer.estado,
					expedicion: undefined,
					pendientesDeSitio: [...p.pendientesDeSitio, ...liquidada.sinSitio],
				},
				eventos: [...liquidada.eventos, ...atardecer.eventos],
			};
		}
	}
}
