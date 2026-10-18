/**
 * Qué suena en cada momento del juego. Un solo sitio para que ampliar el
 * catálogo de audio no obligue a tocar las escenas.
 */
export const MUSICA = {
	mapa: "mapa",
	combate: "combate",
	combateSalvaje: "combate-salvaje",
	combateEntrenador: "combate-entrenador",
	victoria: "victoria",
	victoriaSalvaje: "victoria-salvaje",
	victoriaEntrenador: "victoria-entrenador",
} as const;

export const SFX = {
	mover: "menu-mover",
	aceptar: "menu-aceptar",
	volver: "menu-volver",
	golpe: "golpe",
	golpeSuper: "golpe-superefectivo",
	golpePoco: "golpe-poco-eficaz",
	golpeNulo: "golpe-sin-efecto",
	golpeCritico: "golpe-critico",
	golpeFallo: "golpe-fallo",
	debilitado: "debilitado",
	golpeFuerte: "golpe-fuerte",
	capturaExito: "captura-exito",
	capturaFallo: "captura-fallo",
	curar: "curar",
	comprar: "comprar",
	sinDinero: "sin-dinero",
	bolaLanzar: "bola-lanzar",
	bolaAgitar: "bola-agitar",
	entradaCampo: "entrada-campo",
	cofreAbrir: "cofre-abrir",
	evento: "evento",
	runaObtenida: "runa-obtenida",
	alfaAparece: "alfa-aparece",
	sombrioAparece: "sombrio-aparece",
	jefeAparece: "jefe-aparece",
} as const;

/** Sonido de lanzar un movimiento según su tipo (`mov-fire`, `mov-water`…). */
export const sonidoDeMovimiento = (tipo: string): string => `mov-${tipo}`;
