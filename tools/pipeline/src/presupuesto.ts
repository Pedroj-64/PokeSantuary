import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** Cadenas que solo existen en el código del simulador (@pkmn/sim); el chunk principal no debe llevarlas. */
export const MARCAS_SIMULADOR = [
	"@pkmn",
	"BattleStream",
	"BattleQueue",
	"ModdedDex",
	"pokemon-showdown",
];

export const LIMITE_PRINCIPAL_GZIP = 450 * 1024;
/** GDD §9.7: menos de 5 MB comprimidos antes de la pantalla de título. */
export const LIMITE_INICIAL_GZIP = 5 * 1024 * 1024;

export const marcasEn = (texto: string): string[] =>
	MARCAS_SIMULADOR.filter((m) => texto.includes(m));

export const tamanoGzip = (datos: string | Buffer): number =>
	gzipSync(datos).length;

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

export interface Salida {
	/** Texto del HTML de entrada. */
	html: string;
	/** Contenido de cada archivo de `assets/` por nombre. */
	archivos: Record<string, Buffer>;
}

/** Devuelve la lista de incumplimientos (vacía si todo está bien) y un resumen de medidas. */
export function evaluar({ html, archivos }: Salida): {
	errores: string[];
	resumen: string[];
} {
	const errores: string[] = [];
	const resumen: string[] = [];
	const rutas = (re: RegExp) =>
		[...html.matchAll(re)].map((m) => (m[1] ?? "").replace(/^\//, ""));
	const js = rutas(/<script[^>]+src="([^"]+)"/g);
	// <link> con cualquier orden de atributos: hoja de estilos o precarga de módulo
	const enlaces = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
	const conRel = (rel: string) =>
		enlaces
			.filter((l) => new RegExp(`rel="${rel}"`).test(l))
			.map((l) => (/href="([^"]+)"/.exec(l)?.[1] ?? "").replace(/^\//, ""));
	const css = conRel("stylesheet");
	const precargas = conRel("modulepreload");
	const principal = js[0] ?? "";
	const buf = (r: string) => archivos[r.replace(/^assets\//, "")];
	const datosPrincipal = buf(principal);
	if (!datosPrincipal) {
		return {
			errores: [
				`no se encuentra el chunk principal (${principal || "sin <script>"})`,
			],
			resumen,
		};
	}

	for (const r of [...js, ...css, ...precargas])
		if (!buf(r))
			errores.push(`index.html referencia ${r} pero no está en la compilación`);

	// Límite conocido: un chunk con nombre `worker-*` dentro del grafo inicial quedaría sin revisar.
	// Todo .js que no sea el Worker cuenta como carga inicial (entrada, precargas o chunks
	// compartidos); `streams-*.js` es un puente de 29 bytes hacia el Worker y no lleva marcas.
	for (const [nombre, datos] of Object.entries(archivos)) {
		if (!nombre.endsWith(".js") || /^worker-.*\.js$/.test(nombre)) continue;
		const marcas = marcasEn(datos.toString("latin1"));
		if (marcas.length > 0)
			errores.push(
				`${nombre} contiene código del simulador (${marcas.join(", ")}): debe cargarse solo en el Worker`,
			);
	}

	const gzPrincipal = tamanoGzip(datosPrincipal);
	resumen.push(
		`principal: ${kb(datosPrincipal.length)} sin comprimir, ${kb(gzPrincipal)} gzip (límite ${kb(LIMITE_PRINCIPAL_GZIP)})`,
	);
	if (gzPrincipal > LIMITE_PRINCIPAL_GZIP)
		errores.push(
			`el chunk principal pesa ${kb(gzPrincipal)} gzip y el límite es ${kb(LIMITE_PRINCIPAL_GZIP)}`,
		);

	const inicial =
		tamanoGzip(html) +
		[...js, ...css, ...precargas].reduce(
			(s, r) => s + tamanoGzip(buf(r) ?? ""),
			0,
		);
	resumen.push(
		`carga inicial (html+js+css+precargas): ${kb(inicial)} gzip (límite ${kb(LIMITE_INICIAL_GZIP)})`,
	);
	if (inicial > LIMITE_INICIAL_GZIP)
		errores.push(
			`la carga inicial pesa ${kb(inicial)} gzip y el límite es ${kb(LIMITE_INICIAL_GZIP)}`,
		);

	const worker = Object.entries(archivos).find(([n]) =>
		/^worker-.*\.js$/.test(n),
	);
	if (!worker) errores.push("no se emitió ningún chunk worker-*.js");
	else {
		resumen.push(
			`worker: ${kb(worker[1].length)} sin comprimir, ${kb(tamanoGzip(worker[1]))} gzip (carga diferida)`,
		);
		// guardia del detector: si las marcas dejan de aparecer en el Worker, ya no detectan nada
		if (marcasEn(worker[1].toString("latin1")).length === 0)
			errores.push(
				"ninguna marca del simulador aparece en el Worker: hay que revisar MARCAS_SIMULADOR",
			);
	}
	return { errores, resumen };
}

/** Lee la compilación del juego (`dist/web`). */
export function leerSalida(dir: string): Salida {
	const carpeta = join(dir, "assets");
	const archivos: Record<string, Buffer> = {};
	for (const n of readdirSync(carpeta))
		archivos[n] = readFileSync(join(carpeta, n));
	return { html: readFileSync(join(dir, "index.html"), "utf8"), archivos };
}
