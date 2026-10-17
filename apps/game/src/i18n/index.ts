import en from "./en.json";
import es from "./es.json";

export type Idioma = "es" | "en";

const textos: Record<Idioma, Record<string, string>> = { es, en };
const CLAVE_ALMACEN = "santuario.idioma";
const oyentes = new Set<(idioma: Idioma) => void>();

const esIdioma = (v: unknown): v is Idioma => v === "es" || v === "en";

function leerGuardado(): Idioma | null {
	try {
		const v = localStorage.getItem(CLAVE_ALMACEN);
		return esIdioma(v) ? v : null;
	} catch {
		return null; // el almacenamiento puede lanzar (modo privado, bloqueado)
	}
}

function idiomaDelNavegador(): Idioma {
	const lengua = typeof navigator === "undefined" ? "" : navigator.language;
	return lengua.toLowerCase().startsWith("es") ? "es" : "en";
}

let actual: Idioma = leerGuardado() ?? idiomaDelNavegador();

export const idiomaActual = (): Idioma => actual;

export function cambiarIdioma(idioma: Idioma): void {
	actual = idioma;
	try {
		localStorage.setItem(CLAVE_ALMACEN, idioma);
	} catch {
		// sin persistencia: el cambio sigue valiendo para esta sesión
	}
	for (const cb of oyentes) cb(idioma);
}

/** Registra un oyente; devuelve la función que lo quita. */
export function alCambiarIdioma(cb: (idioma: Idioma) => void): () => void {
	oyentes.add(cb);
	return () => void oyentes.delete(cb);
}

export function t(clave: string): string {
	const texto = textos[actual][clave];
	if (texto === undefined) {
		console.warn(`[i18n] clave inexistente: ${clave}`);
		return clave;
	}
	return texto;
}
