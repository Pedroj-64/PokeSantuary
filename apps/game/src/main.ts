import Phaser from "phaser";
import { Combate } from "./escenas/Combate.js";
import { ListaEspecies } from "./escenas/ListaEspecies.js";
import { alCambiarIdioma, idiomaActual, t } from "./i18n/index.js";

export const ANCHO = 480;
export const ALTO = 270;

/** Mayor zoom entero que cabe en la ventana (mínimo 1): nunca escala fraccionaria. */
export function zoomEntero(anchoVentana: number, altoVentana: number): number {
	return Math.max(
		1,
		Math.floor(Math.min(anchoVentana / ANCHO, altoVentana / ALTO)),
	);
}

const juego = new Phaser.Game({
	type: Phaser.AUTO,
	parent: "juego",
	width: ANCHO,
	height: ALTO,
	backgroundColor: "#1b1b2f",
	pixelArt: true,
	roundPixels: true,
	scale: {
		mode: Phaser.Scale.NONE,
		zoom: zoomEntero(window.innerWidth, window.innerHeight),
	},
	scene: [ListaEspecies, Combate],
});

window.addEventListener("resize", () =>
	juego.scale.setZoom(zoomEntero(window.innerWidth, window.innerHeight)),
);

/** Sincroniza el idioma y el título de la pestaña con el idioma activo. */
function aplicarIdiomaALaPagina(idioma: string): void {
	document.documentElement.lang = idioma;
	document.title = t("titulo");
}

aplicarIdiomaALaPagina(idiomaActual());
alCambiarIdioma(aplicarIdiomaALaPagina);
