import type { MapaPiso } from "@santuario/core";

const MARGEN_X = 40;
const MARGEN_SUPERIOR = 40; // deja sitio al HUD de arriba
const MARGEN_INFERIOR = 24;
const SEPARACION = 56;
const SEPARACION_MINIMA = 40;

/**
 * Posición en pantalla de cada nodo del mapa, en píxeles enteros: las capas se
 * reparten de izquierda a derecha y los nodos de cada capa se centran en
 * vertical, en el orden de su índice (de arriba abajo).
 *
 * @throws {RangeError} Si el lienzo es tan pequeño que dos nodos se solaparían.
 */
export function posicionesNodos(
	mapa: MapaPiso,
	ancho: number,
	alto: number,
): Record<string, { x: number; y: number }> {
	const altoUtil = alto - MARGEN_SUPERIOR - MARGEN_INFERIOR;
	const separacion = Math.min(SEPARACION, Math.floor(altoUtil / 3));
	const huecos = mapa.capas.length - 1;
	if (separacion < SEPARACION_MINIMA || ancho - 2 * MARGEN_X < huecos * 16) {
		throw new RangeError(
			`posicionesNodos(): el lienzo ${ancho}x${alto} es demasiado pequeño`,
		);
	}
	const centroY = MARGEN_SUPERIOR + altoUtil / 2;
	const posiciones: Record<string, { x: number; y: number }> = {};
	mapa.capas.forEach((capa, c) => {
		const x = Math.round(MARGEN_X + (c * (ancho - 2 * MARGEN_X)) / huecos);
		capa.forEach((nodo, i) => {
			const y = Math.round(centroY + (i - (capa.length - 1) / 2) * separacion);
			posiciones[nodo.id] = { x, y };
		});
	});
	return posiciones;
}
