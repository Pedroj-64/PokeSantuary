import { desempaquetar, ErrorGuardado, type Opciones } from "./sobre.js";

/** Almacén de texto por clave. `degradado` avisa de que no persiste (se perderá al cerrar). */
export interface AlmacenClaveValor {
	readonly degradado: boolean;
	leer(clave: string): Promise<string | null>;
	escribir(clave: string, valor: string): Promise<void>;
}

/** Almacén sin persistencia: respaldo cuando IndexedDB no está disponible (modo privado, cuota). */
export function almacenEnMemoria(): AlmacenClaveValor {
	const datos = new Map<string, string>();
	return {
		degradado: true,
		leer: async (k) => datos.get(k) ?? null,
		escribir: async (k, v) => void datos.set(k, v),
	};
}

const TABLA = "partidas";

const promesa = <T>(r: IDBRequest<T>) =>
	new Promise<T>((ok, mal) => {
		r.onsuccess = () => ok(r.result);
		r.onerror = () => mal(r.error);
	});

/** Abre IndexedDB (base `nombre`); si no se puede, devuelve uno en memoria. Nunca lanza. */
export async function abrirAlmacen(
	nombre = "ecos-del-santuario",
): Promise<AlmacenClaveValor> {
	try {
		if (typeof indexedDB === "undefined" || !indexedDB)
			return almacenEnMemoria();
		const abrir = indexedDB.open(nombre, 1);
		abrir.onupgradeneeded = () => abrir.result.createObjectStore(TABLA);
		const bd = await promesa(abrir);
		const tabla = (modo: IDBTransactionMode) =>
			bd.transaction(TABLA, modo).objectStore(TABLA);
		return {
			degradado: false,
			leer: async (k) =>
				((await promesa(tabla("readonly").get(k))) as string | undefined) ??
				null,
			escribir: async (k, v) =>
				void (await promesa(tabla("readwrite").put(v, k))),
		};
	} catch {
		return almacenEnMemoria();
	}
}

/**
 * Guarda `texto` (ya empaquetado) en `ranura` y conserva lo anterior en `ranura.copia`.
 * Devuelve `false` si el almacén falla (cuota llena): el juego sigue y la interfaz avisa.
 */
export async function guardarPartida(
	almacen: AlmacenClaveValor,
	ranura: string,
	texto: string,
): Promise<boolean> {
	try {
		const anterior = await almacen.leer(ranura);
		if (anterior !== null) await almacen.escribir(`${ranura}.copia`, anterior);
		await almacen.escribir(ranura, texto);
		return true;
	} catch {
		return false;
	}
}

/**
 * Carga la partida de `ranura`. Si lo último está corrupto o mal formado, usa la copia
 * anterior y lo avisa (`avisos: ["copia"]`). Una versión futura NO cae a la copia: se
 * lanza para no pisar un guardado de un juego más nuevo. Sin guardado, devuelve `null`.
 */
export async function cargarPartida<T>(
	almacen: AlmacenClaveValor,
	ranura: string,
	o: Opciones<T>,
): Promise<{ partida: T; avisos: string[] } | null> {
	const actual = await almacen.leer(ranura);
	if (actual === null) return null;
	try {
		return { partida: await desempaquetar(actual, o), avisos: [] };
	} catch (e) {
		if (!(e instanceof ErrorGuardado) || e.codigo === "version-futura") throw e;
		const copia = await almacen.leer(`${ranura}.copia`);
		if (copia === null) throw e;
		try {
			return { partida: await desempaquetar(copia, o), avisos: ["copia"] };
		} catch {
			throw e;
		}
	}
}
