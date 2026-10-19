/** Formato del archivo de guardado: el mismo en el almacén local y al exportar. */
const FORMATO = "ecos-del-santuario";

export type CodigoError =
	| "formato"
	| "corrupto"
	| "version-futura"
	| "migracion"
	| "invalido";

/** Fallo al leer un guardado; `codigo` dice qué hacer (conservar, avisar, caer a la copia). */
export class ErrorGuardado extends Error {
	constructor(
		readonly codigo: CodigoError,
		mensaje: string,
	) {
		super(mensaje);
		this.name = "ErrorGuardado";
	}
}

export interface Opciones<T> {
	versionActual: number;
	/** `migraciones[n]` convierte una partida de la versión n a la n+1. */
	migraciones: Record<number, (vieja: unknown) => unknown>;
	/** Comprueba la forma de la partida ya migrada (p. ej. un esquema Zod); lanza si no cuadra. */
	validar: (partida: unknown) => T;
}

/** JSON con las claves ordenadas: la suma no depende del orden de inserción. */
export function canonico(valor: unknown): string {
	if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
	if (valor !== null && typeof valor === "object") {
		const o = valor as Record<string, unknown>;
		return `{${Object.keys(o)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(valor) ?? "null";
}

async function sha256(texto: string): Promise<string> {
	const h = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(texto),
	);
	return [...new Uint8Array(h)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

const sumaDe = (version: number, partida: unknown) =>
	sha256(canonico({ version, partida }));

/** Serializa la partida con su versión y su suma SHA-256. */
export async function empaquetar(
	partida: unknown,
	version: number,
): Promise<string> {
	if (!Number.isInteger(version) || version < 1)
		throw new RangeError(`empaquetar(): versión no válida (${version})`);
	return JSON.stringify({
		formato: FORMATO,
		version,
		suma: await sumaDe(version, partida),
		partida,
	});
}

/**
 * Lee un guardado: formato, suma, versión (migra las viejas, rechaza las futuras)
 * y forma. Lanza `ErrorGuardado`; nunca devuelve una partida a medias.
 */
export async function desempaquetar<T>(
	texto: string,
	o: Opciones<T>,
): Promise<T> {
	let sobre: unknown;
	try {
		sobre = JSON.parse(texto);
	} catch {
		throw new ErrorGuardado("formato", "el guardado no es JSON");
	}
	const s = sobre as {
		formato?: unknown;
		version?: unknown;
		suma?: unknown;
		partida?: unknown;
	};
	if (
		sobre === null ||
		typeof sobre !== "object" ||
		s.formato !== FORMATO ||
		typeof s.version !== "number" ||
		!Number.isInteger(s.version) ||
		s.version < 1 ||
		typeof s.suma !== "string" ||
		!("partida" in s)
	)
		throw new ErrorGuardado("formato", "no es un guardado de este juego");
	if (s.suma !== (await sumaDe(s.version, s.partida)))
		throw new ErrorGuardado("corrupto", "la suma de control no coincide");
	if (s.version > o.versionActual)
		throw new ErrorGuardado(
			"version-futura",
			`guardado de la versión ${s.version}, este juego llega a la ${o.versionActual}`,
		);
	let partida = s.partida;
	for (let v = s.version; v < o.versionActual; v++) {
		const migrar = o.migraciones[v];
		if (!migrar)
			throw new ErrorGuardado(
				"migracion",
				`falta la migración ${v} → ${v + 1}`,
			);
		partida = migrar(partida);
	}
	try {
		return o.validar(partida);
	} catch (e) {
		throw new ErrorGuardado(
			"invalido",
			e instanceof Error ? e.message : String(e),
		);
	}
}
