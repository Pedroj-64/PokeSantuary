import type { Biblioteca } from "./motor.js";

/**
 * Gestor de audio del juego. Vive en el paquete principal pero es pequeño: la
 * síntesis y los datos se cargan la primera vez que suena algo (`motor.ts`).
 *
 * - Un solo `AudioContext`, que se reanuda con el primer gesto del jugador.
 * - Una música a la vez, con fundido corto al cambiar; pedir la que ya suena no la reinicia.
 * - Efectos superpuestos sobre un nodo de ganancia propio.
 * - Silencio (tecla M) y volumen guardados en `localStorage` (sin él, valores por defecto).
 */

const CLAVE_SILENCIO = "santuario.silencio";
const FUNDIDO_S = 0.25;
const VOLUMEN_MUSICA = 0.5;
const VOLUMEN_EFECTOS = 0.8;

/** Registro de lo pedido, para que los e2e comprueben sonidos sin oírlos. */
export interface RegistroAudio {
	musica: string | null;
	efectos: string[];
	silenciado: boolean;
}

let ctx: AudioContext | null = null;
let biblioteca: Promise<Biblioteca> | null = null;
let gananciaMaestra: GainNode | null = null;
let gananciaMusica: GainNode | null = null;
let gananciaEfectos: GainNode | null = null;
let fuenteMusica: AudioBufferSourceNode | null = null;
let musicaActual: string | null = null;
/** Número de petición de música: una petición vieja que termina tarde no pisa a la nueva. */
let turnoMusica = 0;
const registro: RegistroAudio = {
	musica: null,
	efectos: [],
	silenciado: leerSilencio(),
};
let reanudacionPuesta = false;

function leerSilencio(): boolean {
	try {
		return localStorage.getItem(CLAVE_SILENCIO) === "1";
	} catch {
		return false; // almacenamiento bloqueado: sin silencio guardado
	}
}

function contexto(): AudioContext | null {
	if (ctx) return ctx;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!Ctor) return null;
	ctx = new Ctor();
	gananciaMaestra = ctx.createGain();
	gananciaMaestra.gain.value = registro.silenciado ? 0 : 1;
	gananciaMaestra.connect(ctx.destination);
	gananciaMusica = ctx.createGain();
	gananciaMusica.gain.value = VOLUMEN_MUSICA;
	gananciaMusica.connect(gananciaMaestra);
	gananciaEfectos = ctx.createGain();
	gananciaEfectos.gain.value = VOLUMEN_EFECTOS;
	gananciaEfectos.connect(gananciaMaestra);
	if (!reanudacionPuesta) {
		reanudacionPuesta = true;
		// Los navegadores no dejan sonar antes de un gesto: se reanuda en el primero.
		const reanudar = (): void => {
			if (ctx?.state === "suspended") void ctx.resume();
		};
		window.addEventListener("keydown", reanudar);
		window.addEventListener("pointerdown", reanudar);
	}
	return ctx;
}

function cargarBiblioteca(c: AudioContext): Promise<Biblioteca> {
	biblioteca ??= import("./motor.js").then((m) => m.crearBiblioteca(c));
	return biblioteca;
}

function publicar(): void {
	const g = window as unknown as { __santuario?: Record<string, unknown> };
	if (new URLSearchParams(location.search).get("test") !== "1") return;
	g.__santuario ??= {};
	g.__santuario.audio = { ...registro, efectos: [...registro.efectos] };
}

/** Pone una música en bucle (o una vez si la canción no repite); no reinicia la que ya suena. */
export async function musica(id: string): Promise<void> {
	if (musicaActual === id) return;
	musicaActual = id;
	registro.musica = id;
	publicar();
	const turno = ++turnoMusica;
	const c = contexto();
	if (!c || !gananciaMusica) return;
	try {
		const bib = await cargarBiblioteca(c);
		const encontrada = bib.cancion(id);
		if (turno !== turnoMusica || !encontrada) return;
		detenerFuente();
		const fuente = c.createBufferSource();
		fuente.buffer = encontrada.buffer;
		fuente.loop = encontrada.cancion.repetir;
		const bucle = (encontrada.cancion as { bucle?: { desde: number } }).bucle;
		if (fuente.loop && bucle) {
			const porPaso =
				60 / (encontrada.cancion.bpm * encontrada.cancion.pasosPorNegra);
			fuente.loopStart = bucle.desde * porPaso;
			fuente.loopEnd = encontrada.buffer.duration;
		}
		fuente.connect(gananciaMusica);
		gananciaMusica.gain.cancelScheduledValues(c.currentTime);
		gananciaMusica.gain.setValueAtTime(0, c.currentTime);
		gananciaMusica.gain.linearRampToValueAtTime(
			VOLUMEN_MUSICA,
			c.currentTime + FUNDIDO_S,
		);
		fuente.start();
		fuente.onended = () => {
			if (fuenteMusica === fuente) {
				fuenteMusica = null;
				if (!fuente.loop && musicaActual === id) {
					musicaActual = null;
					registro.musica = null;
					publicar();
				}
			}
		};
		fuenteMusica = fuente;
	} catch (error) {
		console.warn("[audio] no se pudo reproducir la música", id, error);
	}
}

function detenerFuente(): void {
	if (!fuenteMusica) return;
	try {
		fuenteMusica.onended = null;
		fuenteMusica.stop();
	} catch {
		// ya estaba parada
	}
	fuenteMusica = null;
}

/** Silencia la música (por ejemplo al volver a un menú sin tema). */
export function pararMusica(): void {
	++turnoMusica;
	musicaActual = null;
	registro.musica = null;
	publicar();
	detenerFuente();
}

/** Dispara un efecto corto; los desconocidos se ignoran sin ruido. */
export async function efecto(id: string): Promise<void> {
	registro.efectos.push(id);
	if (registro.efectos.length > 50) registro.efectos.shift();
	publicar();
	const c = contexto();
	if (!c || !gananciaEfectos) return;
	try {
		const encontrado = (await cargarBiblioteca(c)).efecto(id);
		if (!encontrado) return;
		const fuente = c.createBufferSource();
		fuente.buffer = encontrado.buffer;
		fuente.connect(gananciaEfectos);
		fuente.start();
	} catch (error) {
		console.warn("[audio] no se pudo reproducir el efecto", id, error);
	}
}

/** Alterna el silencio general y lo guarda. */
export function alternarSilencio(): boolean {
	registro.silenciado = !registro.silenciado;
	if (gananciaMaestra) gananciaMaestra.gain.value = registro.silenciado ? 0 : 1;
	try {
		localStorage.setItem(CLAVE_SILENCIO, registro.silenciado ? "1" : "0");
	} catch {
		// sin persistencia: vale para esta sesión
	}
	publicar();
	return registro.silenciado;
}
