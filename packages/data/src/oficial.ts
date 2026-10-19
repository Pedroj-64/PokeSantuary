import { z } from "zod";
import { slug } from "./slug.js";

/** Ruta exacta de los sprites de combate de Negro y Blanco en `PokeAPI/sprites`. */
const RUTA_SPRITE =
	/^\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-v\/black-white\/(back\/)?\d+\.png$/;

/**
 * La URL de un sprite oficial viene de datos externos: solo se acepta el host y
 * la ruta exactos (https, sin credenciales, puerto, consulta ni fragmento).
 */
export function urlSpriteValida(valor: unknown): string {
	if (typeof valor !== "string") throw new Error("URL de sprite ausente");
	let u: URL;
	try {
		u = new URL(valor);
	} catch {
		throw new Error(`URL de sprite no válida: ${valor}`);
	}
	if (
		u.protocol !== "https:" ||
		u.hostname !== "raw.githubusercontent.com" ||
		u.port !== "" ||
		u.username !== "" ||
		u.password !== "" ||
		u.search !== "" ||
		u.hash !== "" ||
		!RUTA_SPRITE.test(u.pathname)
	)
		throw new Error(`URL de sprite no permitida: ${valor}`);
	return u.href;
}

const UrlSprite = z.string().refine(
	(v) => {
		try {
			return urlSpriteValida(v) === v;
		} catch {
			return false;
		}
	},
	{ message: "URL de sprite no permitida" },
);

/**
 * `packs/kanto/oficial.json`: dónde pedir en ejecución los sprites oficiales de
 * cada especie (capa O1, GDD §4.3). No contiene ningún archivo oficial.
 */
export const OficialSchema = z
	.object({
		sprites: z.record(
			slug,
			z.object({ frente: UrlSprite, espalda: UrlSprite }).strict(),
		),
	})
	.strict();
export type Oficial = z.infer<typeof OficialSchema>;
