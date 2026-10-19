import oficialCrudo from "@packs/kanto/oficial.json?raw";
import { type Oficial, OficialSchema } from "@santuario/data";

/**
 * Recursos oficiales (GDD §4.3). `o1` pide los sprites de combate a PokeAPI/sprites
 * en ejecución; `ninguno` dibuja siempre el sustituto original. El juego arranca y
 * se termina igual en los dos modos, y si un sprite no llega usa el sustituto.
 */
export type ModoOficial = "ninguno" | "o1";
export type Lado = "frente" | "espalda";

/** Tiempo máximo de espera por un sprite antes de usar el sustituto. */
export const ESPERA_SPRITE_MS = 6000;

/** `?oficial=` manda; si no, la edición compilada (`VITE_OFICIAL`); si no, `ninguno`. */
export function modoOficial(
	consulta: string = location.search,
	edicion: string | undefined = import.meta.env.VITE_OFICIAL,
): ModoOficial {
	const valor = new URLSearchParams(consulta).get("oficial") ?? edicion;
	return valor === "o1" ? "o1" : "ninguno";
}

let oficial: Oficial | undefined;
/** `oficial.json` del pack, validado una sola vez. */
const datosOficiales = (): Oficial =>
	(oficial ??= OficialSchema.parse(JSON.parse(oficialCrudo)));

/** URL oficial del sprite, o `undefined` si el pack no lo conoce. */
export const urlOficial = (especie: string, lado: Lado): string | undefined =>
	datosOficiales().sprites[especie]?.[lado];

export const claveSprite = (especie: string, lado: Lado, modo: ModoOficial) =>
	`sprite:${modo}:${especie}:${lado}`;

/** Color base del sustituto según el tipo principal. */
const COLOR_TIPO: Record<string, number> = {
	normal: 0xa8a77a,
	fire: 0xee8130,
	water: 0x6390f0,
	electric: 0xf7d02c,
	grass: 0x7ac74c,
	ice: 0x96d9d6,
	fighting: 0xc22e28,
	poison: 0xa33ea1,
	ground: 0xe2bf65,
	flying: 0xa98ff3,
	psychic: 0xf95587,
	bug: 0xa6b91a,
	rock: 0xb6a136,
	ghost: 0x735797,
	dragon: 0x6f35fc,
	dark: 0x705746,
	steel: 0xb7b7ce,
	fairy: 0xd685ad,
};
export const colorDeTipo = (tipo: string | undefined): number =>
	COLOR_TIPO[tipo ?? "normal"] ?? 0xa8a77a;

/** Sustituto original: una silueta redondeada del color del tipo, de 96×96 como el sprite oficial. */
function dibujarSustituto(
	escena: Phaser.Scene,
	clave: string,
	lado: Lado,
	tipo: string | undefined,
): void {
	if (escena.textures.exists(clave)) return;
	const color = colorDeTipo(tipo);
	const g = escena.make.graphics({}, false);
	g.fillStyle(0x000000, 0.25).fillEllipse(48, 86, 56, 10);
	g.fillStyle(color, 1).fillEllipse(48, 58, 56, 50);
	g.fillStyle(color, 1).fillCircle(48, 30, 20);
	g.fillStyle(0xffffff, 0.22).fillEllipse(40, 50, 22, 14);
	if (lado === "frente") {
		g.fillStyle(0x12122b, 1).fillCircle(41, 28, 3).fillCircle(55, 28, 3);
	}
	g.generateTexture(clave, 96, 96);
	g.destroy();
}

/** Pide una imagen y resuelve `true` si llegó, `false` si falló o tardó demasiado. */
function cargarImagen(
	escena: Phaser.Scene,
	clave: string,
	url: string,
): Promise<boolean> {
	return new Promise((resolver) => {
		const cargador = escena.load;
		let temporizador: ReturnType<typeof setTimeout> | undefined;
		const fin = (bien: boolean) => {
			if (temporizador) clearTimeout(temporizador);
			cargador.off(`filecomplete-image-${clave}`, alLlegar);
			cargador.off("loaderror", alFallar);
			resolver(bien && escena.textures.exists(clave));
		};
		const alLlegar = () => fin(true);
		const alFallar = (archivo: { key: string }) => {
			if (archivo.key === clave) fin(false);
		};
		cargador.on(`filecomplete-image-${clave}`, alLlegar);
		cargador.on("loaderror", alFallar);
		temporizador = setTimeout(() => fin(false), ESPERA_SPRITE_MS);
		cargador.image(clave, url);
		if (!cargador.isLoading()) cargador.start();
	});
}

/**
 * Deja lista la textura del sprite de combate de una especie y devuelve su clave.
 * Con `o1` intenta la imagen oficial; ante cualquier fallo (red, 404, tiempo) o con
 * `ninguno`, dibuja el sustituto. Nunca lanza.
 */
export async function asegurarSprite(
	escena: Phaser.Scene,
	especie: string,
	lado: Lado,
	tipo: string | undefined,
	modo: ModoOficial = modoOficial(),
): Promise<string> {
	const oficialClave = claveSprite(especie, lado, "o1");
	if (modo === "o1") {
		if (escena.textures.exists(oficialClave)) return oficialClave;
		const url = urlOficial(especie, lado);
		if (url && (await cargarImagen(escena, oficialClave, url)))
			return oficialClave;
	}
	const clave = claveSprite(especie, lado, "ninguno");
	dibujarSustituto(escena, clave, lado, tipo);
	return clave;
}
