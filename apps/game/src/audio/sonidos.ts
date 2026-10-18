/**
 * Qué suena en cada momento del juego. Un solo sitio para que ampliar el
 * catálogo de audio no obligue a tocar las escenas.
 */
export const MUSICA = {
	mapa: "mapa",
	combate: "combate",
	victoria: "victoria",
} as const;

export const SFX = {
	mover: "menu-mover",
	aceptar: "menu-aceptar",
	volver: "menu-volver",
	golpe: "golpe",
	golpeFuerte: "golpe-fuerte",
	capturaExito: "captura-exito",
	capturaFallo: "captura-fallo",
	curar: "curar",
} as const;
