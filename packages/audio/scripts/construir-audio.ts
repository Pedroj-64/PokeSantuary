import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	aWav,
	aWavEstereo,
	compilarMml,
	type Efecto,
	parsearColeccion,
	renderizarCancion,
	renderizarCancionEstereo,
	renderizarEfecto,
	TASA_POR_DEFECTO,
} from "../src/index.js";

/**
 * Construye `datos/audio.json` y los WAV de revisión. No se ejecuta en las
 * pruebas; se lanza a mano:
 *
 *   pnpm exec tsx packages/audio/scripts/construir-audio.ts
 *
 * Lee una canción por archivo de `mml/`, los efectos hechos a mano de
 * `datos/efectos.json` (opcional) y escribe las canciones ordenadas por id,
 * más un WAV mono y otro estéreo por canción y un WAV mono por efecto en
 * `salida/` (ignorada por git). La salida es determinista: mismos bytes si no
 * cambia la fuente.
 */

const raizPaquete = fileURLToPath(new URL("../", import.meta.url));
const raizRepo = fileURLToPath(new URL("../../../", import.meta.url));
const carpetaMml = fileURLToPath(new URL("../mml/", import.meta.url));
const carpetaSalida = fileURLToPath(new URL("../salida/", import.meta.url));

const ordenarPorId = <T extends { id: string }>(a: T, b: T): number => {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
};

const archivos = readdirSync(carpetaMml)
	.filter((archivo) => archivo.endsWith(".mml"))
	.sort();
if (archivos.length === 0) {
	throw new Error(`no hay archivos .mml en ${carpetaMml}`);
}

const canciones = archivos.map((archivo) => {
	const texto = readFileSync(`${carpetaMml}${archivo}`, "utf8");
	return compilarMml(texto);
});

const rutaEfectos = `${raizPaquete}datos/efectos.json`;
const efectos: Efecto[] = existsSync(rutaEfectos)
	? (JSON.parse(readFileSync(rutaEfectos, "utf8")) as Efecto[])
	: [];

const coleccion = parsearColeccion({
	canciones: [...canciones].sort(ordenarPorId),
	efectos,
});

const destino = `${raizPaquete}datos/audio.json`;
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, `${JSON.stringify(coleccion, null, "\t")}\n`);
// El JSON versionado sigue el formato del repositorio (tabuladores, 80 columnas).
execFileSync("pnpm", ["exec", "biome", "check", "--write", destino], {
	cwd: raizRepo,
	stdio: "ignore",
});

mkdirSync(carpetaSalida, { recursive: true });
for (const cancion of coleccion.canciones) {
	const mono = renderizarCancion(cancion, TASA_POR_DEFECTO);
	const { izq, der } = renderizarCancionEstereo(cancion, TASA_POR_DEFECTO);
	writeFileSync(
		`${carpetaSalida}${cancion.id}.wav`,
		aWav(mono, TASA_POR_DEFECTO),
	);
	writeFileSync(
		`${carpetaSalida}${cancion.id}-estereo.wav`,
		aWavEstereo(izq, der, TASA_POR_DEFECTO),
	);
}
for (const efecto of coleccion.efectos) {
	const muestras = renderizarEfecto(efecto, TASA_POR_DEFECTO);
	writeFileSync(
		`${carpetaSalida}${efecto.id}.wav`,
		aWav(muestras, TASA_POR_DEFECTO),
	);
}

console.log(
	`audio: ${coleccion.canciones.length} canciones y ${coleccion.efectos.length} efectos`,
);
