import audioCrudo from "@audio/datos/audio.json?raw";
import {
	type Cancion,
	type ColeccionAudio,
	type Efecto,
	parsearColeccion,
	renderizarCancion,
	renderizarEfecto,
} from "@santuario/audio";

/** Tasa a la que se renderiza en el navegador: la mitad que la de estudio ahorra tiempo y memoria. */
const TASA = 22050;

/**
 * Parte pesada del audio (datos y síntesis). Va en un módulo aparte para que
 * Vite lo saque del paquete principal: solo se descarga al sonar algo.
 */
export interface Biblioteca {
	cancion(id: string): { buffer: AudioBuffer; cancion: Cancion } | undefined;
	efecto(id: string): { buffer: AudioBuffer; efecto: Efecto } | undefined;
}

export function crearBiblioteca(ctx: BaseAudioContext): Biblioteca {
	const datos: ColeccionAudio = parsearColeccion(JSON.parse(audioCrudo));
	const canciones = new Map(datos.canciones.map((c) => [c.id, c]));
	const efectos = new Map(datos.efectos.map((e) => [e.id, e]));
	const cacheC = new Map<string, AudioBuffer>();
	const cacheE = new Map<string, AudioBuffer>();
	const aBuffer = (m: Float32Array): AudioBuffer => {
		const b = ctx.createBuffer(1, m.length, TASA);
		b.copyToChannel(m as Float32Array<ArrayBuffer>, 0);
		return b;
	};
	return {
		cancion(id) {
			const cancion = canciones.get(id);
			if (!cancion) return undefined;
			let buffer = cacheC.get(id);
			if (!buffer) {
				buffer = aBuffer(renderizarCancion(cancion, TASA));
				cacheC.set(id, buffer);
			}
			return { buffer, cancion };
		},
		efecto(id) {
			const efecto = efectos.get(id);
			if (!efecto) return undefined;
			let buffer = cacheE.get(id);
			if (!buffer) {
				buffer = aBuffer(renderizarEfecto(efecto, TASA));
				cacheE.set(id, buffer);
			}
			return { buffer, efecto };
		},
	};
}
