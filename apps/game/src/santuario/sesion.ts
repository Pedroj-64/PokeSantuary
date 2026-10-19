import {
	type AccionPartida,
	admitir,
	type ContextoPartida,
	crearPartida,
	crearRng,
	type EstadoPartida,
	type EventoSantuario,
	reducir,
	VERSION_PARTIDA,
} from "@santuario/core";
import {
	type AlmacenClaveValor,
	cargarPartida,
	guardarPartida,
} from "../guardado/almacen.js";
import { opcionesPartida } from "../guardado/partida.js";
import { empaquetar } from "../guardado/sobre.js";

/** Una partida abierta: el estado, las acciones y el autoguardado. Sin Phaser, para poder probarla. */
export interface Sesion {
	partida(): EstadoPartida;
	/** Aplica la acción, guarda y devuelve los eventos. Una orden ilegal lanza y no cambia nada. */
	despachar(accion: AccionPartida): EventoSantuario[];
	/** Se resuelve cuando todo lo despachado ya está guardado. */
	guardada(): Promise<void>;
	/** `false` si algún guardado falló (cuota llena): la interfaz avisa. */
	guardadoOk(): boolean;
	readonly ctx: ContextoPartida;
}

export interface OpcionesSesion {
	almacen: AlmacenClaveValor;
	ranura: string;
	/** Semilla de la partida si es nueva; una partida guardada trae la suya. */
	semilla: string;
	ctx: ContextoPartida;
	/** Especies con las que empieza el Santuario (provisional hasta el Prólogo). */
	iniciales: readonly string[];
}

/** Partida nueva con los residentes iniciales ya admitidos. */
function partidaNueva(o: OpcionesSesion): EstadoPartida {
	let p = crearPartida(o.semilla, o.ctx.balance);
	for (const especie of o.iniciales) {
		const uid = `r${p.santuario.siguienteUid}`;
		const rng = crearRng(`${o.semilla}:residente:${uid}`);
		const residente = o.ctx.fabricar({ especie, uid, origen: "captura", rng });
		p = {
			...p,
			santuario: {
				...admitir(p.santuario, residente, o.ctx.balance),
				siguienteUid: p.santuario.siguienteUid + 1,
			},
		};
	}
	return p;
}

/**
 * Abre la partida de `ranura`: la carga si existe (con la copia anterior si lo último
 * está dañado) o crea una nueva. Un guardado ilegible sin copia lanza `ErrorGuardado`
 * en vez de empezar de cero, para no pisar una partida que quizá se pueda rescatar.
 */
export async function abrirSesion(
	o: OpcionesSesion,
): Promise<{ sesion: Sesion; avisos: string[] }> {
	const cargada = await cargarPartida(o.almacen, o.ranura, opcionesPartida);
	const avisos = [...(cargada?.avisos ?? [])];
	if (o.almacen.degradado) avisos.push("sin-guardado");
	let partida = cargada?.partida ?? partidaNueva(o);
	let cola: Promise<void> = Promise.resolve();
	let ok = true;
	const guardar = () => {
		const instantanea = partida;
		cola = cola.then(async () => {
			const texto = await empaquetar(instantanea, VERSION_PARTIDA);
			ok = (await guardarPartida(o.almacen, o.ranura, texto)) && ok;
		});
	};
	if (cargada === null) guardar();
	const sesion: Sesion = {
		ctx: o.ctx,
		partida: () => partida,
		despachar(accion) {
			const r = reducir(partida, accion, o.ctx);
			partida = r.partida;
			guardar();
			return r.eventos;
		},
		guardada: () => cola,
		guardadoOk: () => ok,
	};
	return { sesion, avisos };
}
