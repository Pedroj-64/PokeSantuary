import { type Endpoint, type Remote, releaseProxy, wrap } from "comlink";
import type { Eleccion } from "./combate.js";
import type {
	OpcionesCombate,
	ResultadoTurno,
	SesionCombate,
} from "./sesion.js";

export type { OpcionesCombate, ResultadoTurno };

// Solo tipos de la parte del servidor: el simulador no entra en el paquete principal.

/** Combate abierto: eventos de arranque y primera petición, más el mando remoto. */
export interface CombateAbierto extends ResultadoTurno {
	remoto: CombateRemoto;
}

/** Mando del combate que corre en el Worker. */
export interface CombateRemoto {
	/**
	 * Aplica la elección del jugador (la IA rival juega dentro del Worker).
	 * Rechaza con un `Error` en español si la elección es ilegal.
	 */
	elegirJugador(e: Eleccion): Promise<ResultadoTurno>;
	/** Registro omnisciente del combate, útil para repeticiones y pruebas. */
	registro(): Promise<string>;
	/** Cierra el canal y termina el Worker. */
	cerrar(): void;
}

export interface OpcionesCliente {
	/** Crea el extremo de comunicación; por defecto, un Worker real. Permite inyectar un `MessagePort` en pruebas. */
	crearEndpoint?: () => Endpoint;
	/** Espera máxima de `abrir` (carga el simulador), en ms. Por defecto 15000. */
	tiempoAbrirMs?: number;
	/** Espera máxima de cada turno y del registro, en ms. Por defecto 5000. */
	tiempoTurnoMs?: number;
}

/** Worker real. Va aparte porque no puede ejecutarse en Vitest/Node: lo cubre el e2e. */
function crearWorker(): Endpoint {
	return new Worker(new URL("./worker.ts", import.meta.url), {
		type: "module",
	}) as Endpoint;
}

/** Abre un combate en un Worker y devuelve el estado inicial con su mando remoto. */
export async function abrirCombate(
	op: OpcionesCombate,
	opciones: OpcionesCliente = {},
): Promise<CombateAbierto> {
	const { tiempoAbrirMs = 15000, tiempoTurnoMs = 5000 } = opciones;
	const ep = (opciones.crearEndpoint ?? crearWorker)();
	const sesion: Remote<SesionCombate> = wrap<SesionCombate>(ep);

	// Estado de la sesión: viva, muerta (Worker caído o mudo) o cerrada.
	let fin: Error | null = null;
	let cerrado = false;
	/** Llamadas en vuelo: cada una sabe rechazarse y soltar su temporizador. */
	const pendientes = new Set<{
		rechazar: (e: Error) => void;
		limpiar: () => void;
	}>();
	const terminar = (e: Error): void => {
		if (fin) return;
		fin = e;
		for (const p of [...pendientes]) {
			p.limpiar();
			p.rechazar(e);
		}
	};
	const caido = (ev: Event): void =>
		terminar(
			new Error(
				`El combate dejó de responder: ${(ev as ErrorEvent).message || ev.type}`,
			),
		);
	ep.addEventListener?.("error", caido);
	ep.addEventListener?.("messageerror", caido);

	/** Única vía de llamada: compite con la muerte de la sesión y con un plazo. */
	const llamar = <T>(f: () => Promise<T>, ms: number): Promise<T> => {
		if (fin) return Promise.reject(fin);
		return new Promise<T>((resolver, rechazar) => {
			const temporizador = setTimeout(
				() =>
					terminar(
						new Error(
							`El combate dejó de responder: sin respuesta en ${ms} ms`,
						),
					),
				ms,
			);
			const pendiente = { rechazar, limpiar: () => {} };
			pendiente.limpiar = (): void => {
				clearTimeout(temporizador);
				pendientes.delete(pendiente);
			};
			const limpiar = pendiente.limpiar;
			pendientes.add(pendiente);
			f().then(
				(v) => {
					limpiar();
					resolver(v);
				},
				(e) => {
					limpiar();
					rechazar(e);
				},
			);
		});
	};

	const cerrar = (): void => {
		if (cerrado) return;
		cerrado = true;
		const e = new Error(CERRADO);
		terminar(e);
		fin = e; // también si ya había muerto: lo posterior es "cerrado"
		void sesion[releaseProxy]();
		// Un Worker se termina; un MessagePort se cierra.
		if ("terminate" in ep) (ep as unknown as Worker).terminate();
		else (ep as unknown as MessagePort).close();
	};

	try {
		const inicial = await llamar(() => sesion.abrir(op), tiempoAbrirMs);
		// Las elecciones se encadenan: un doble clic no intercala dos turnos.
		let cola: Promise<unknown> = Promise.resolve();
		return {
			...inicial,
			remoto: {
				elegirJugador: (e) => {
					const r = cola.then(() =>
						llamar(() => sesion.elegirJugador(e), tiempoTurnoMs),
					);
					cola = r.catch(() => undefined);
					return r;
				},
				registro: () => llamar(() => sesion.registro(), tiempoTurnoMs),
				cerrar,
			},
		};
	} catch (error) {
		cerrar();
		throw error;
	}
}

const CERRADO = "El combate está cerrado";
