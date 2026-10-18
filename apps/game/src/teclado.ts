import type Phaser from "phaser";

/** `timeStamp` del último `keydown` atendido; compartido por todas las escenas. */
let ultimo = Number.NEGATIVE_INFINITY;

/**
 * Escucha las pulsaciones de teclado de una escena sin atender dos veces el
 * mismo evento: con la ventana bajo carga, la cola de teclado de Phaser puede
 * volver a entregar `keydown` ya tratados en el fotograma siguiente, también a
 * la escena recién creada tras un `restart` (un Esc repetido sacaba al jugador
 * del combate y un 1 repetido avanzaba dos nodos). Los `timeStamp` del DOM
 * crecen siempre, así que se descarta todo evento no posterior al último.
 */
export function alPulsarTecla(
	escena: Phaser.Scene,
	atender: (ev: KeyboardEvent) => void,
): void {
	escena.input.keyboard?.on("keydown", (ev: KeyboardEvent) => {
		if (ev.timeStamp <= ultimo) return;
		ultimo = ev.timeStamp;
		atender(ev);
	});
}
