import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
	type OpcionesDescarga,
	pausar,
	USER_AGENT,
	validarSlug,
} from "./descargar.js";

export type Lado = "frente" | "espalda";
export const LADOS: Lado[] = ["frente", "espalda"];
export const MAX_BYTES = 200 * 1024;
export const ANCHO_ATLAS = 512;
export const ACOLCHADO = 2;
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RUTA_SPRITE =
	/^\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-v\/black-white\/(back\/)?\d+\.png$/;

export const nombreMarco = (especie: string, lado: Lado) =>
	`combate/${especie}/${lado}`;

// La URL viene de datos de la API: solo se acepta el host y la ruta exactos.
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

export const MAX_LADO = 256;

// Valida firma e IHDR (dimensiones) ANTES de decodificar: evita bombas de descompresión.
export function validarPng(bytes: Buffer, etiqueta: string, max = MAX_LADO) {
	if (bytes.length < 33 || !bytes.subarray(0, 8).equals(FIRMA_PNG))
		throw new Error(`${etiqueta}: no es un PNG`);
	if (bytes.toString("latin1", 12, 16) !== "IHDR")
		throw new Error(`${etiqueta}: PNG sin cabecera IHDR`);
	const w = bytes.readUInt32BE(16);
	const h = bytes.readUInt32BE(20);
	if (w < 1 || h < 1 || w > max || h > max)
		throw new Error(
			`${etiqueta}: dimensiones del PNG fuera de rango (${w}x${h}, máximo ${max})`,
		);
}

export function leerPng(bytes: Buffer, etiqueta: string, max = MAX_LADO): PNG {
	validarPng(bytes, etiqueta, max);
	return PNG.sync.read(bytes);
}

export const rutaSprite = (dirCache: string, especie: string, lado: Lado) =>
	join(dirCache, "sprites", `${especie}-${lado}.png`);

// Devuelve los bytes del PNG (de la caché o de la red) y los guarda si son válidos.
export async function descargarSprite(
	especie: string,
	lado: Lado,
	urlCruda: unknown,
	o: OpcionesDescarga,
): Promise<Buffer> {
	validarSlug(especie);
	const archivo = rutaSprite(o.dirCache, especie, lado);
	if (existsSync(archivo)) {
		const guardado = readFileSync(archivo);
		validarPng(guardado, archivo);
		return guardado;
	}
	const url = urlSpriteValida(urlCruda);
	await pausar(o.pausaMs);
	const r = await (o.red ?? fetch)(url, {
		headers: { "User-Agent": USER_AGENT },
		redirect: "error",
	});
	if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
	const declarado = Number(r.headers.get("content-length") ?? 0);
	if (declarado > MAX_BYTES) throw new Error(`${url}: PNG demasiado grande`);
	const bytes = Buffer.from(await r.arrayBuffer());
	if (bytes.length > MAX_BYTES) throw new Error(`${url}: PNG demasiado grande`);
	validarPng(bytes, url);
	mkdirSync(join(o.dirCache, "sprites"), { recursive: true });
	writeFileSync(archivo, bytes);
	return bytes;
}

type Marco = { nombre: string; png: PNG };
type Caja = { x: number; y: number; w: number; h: number };

// Empaquetador por estantes, determinista: orden por alto desc y nombre, sin rotar ni recortar.
export function empaquetar(marcos: Marco[]) {
	const orden = [...marcos].sort(
		(a, b) => b.png.height - a.png.height || (a.nombre < b.nombre ? -1 : 1),
	);
	const cajas = new Map<string, Caja>();
	let x = ACOLCHADO;
	let y = ACOLCHADO;
	let altoFila = 0;
	for (const m of orden) {
		const { width: w, height: h } = m.png;
		if (w + 2 * ACOLCHADO > ANCHO_ATLAS)
			throw new Error(`${m.nombre}: sprite más ancho que el atlas (${w})`);
		if (x + w + ACOLCHADO > ANCHO_ATLAS) {
			x = ACOLCHADO;
			y += altoFila + ACOLCHADO;
			altoFila = 0;
		}
		cajas.set(m.nombre, { x, y, w, h });
		x += w + ACOLCHADO;
		altoFila = Math.max(altoFila, h);
	}
	const alto = y + altoFila + ACOLCHADO;
	if (alto > 2048) throw new Error(`atlas demasiado alto: ${alto}`);
	const atlas = new PNG({
		width: ANCHO_ATLAS,
		height: alto,
		deflateLevel: 9,
		filterType: 4,
	});
	for (const m of orden) {
		const c = cajas.get(m.nombre) as Caja;
		PNG.bitblt(m.png, atlas, 0, 0, c.w, c.h, c.x, c.y);
	}
	const frames = Object.fromEntries(
		[...cajas.entries()]
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([nombre, c]) => [
				nombre,
				{
					frame: c,
					rotated: false,
					trimmed: false,
					spriteSourceSize: { x: 0, y: 0, w: c.w, h: c.h },
					sourceSize: { w: c.w, h: c.h },
				},
			]),
	);
	return {
		png: PNG.sync.write(atlas),
		json: {
			frames,
			meta: {
				image: "atlas-combate.png",
				size: { w: ANCHO_ATLAS, h: alto },
			},
		},
	};
}

// Atlas de combate a partir de los PNG ya cacheados (o descargados) de cada especie.
export async function atlasDeCombate(
	especies: { slug: string; pokemon: unknown }[],
	o: OpcionesDescarga,
) {
	const marcos: Marco[] = [];
	for (const { slug, pokemon } of especies) {
		const bw = (
			pokemon as {
				sprites?: {
					versions?: Record<string, Record<string, Record<string, unknown>>>;
				};
			}
		).sprites?.versions?.["generation-v"]?.["black-white"];
		for (const lado of LADOS) {
			const url = bw?.[lado === "frente" ? "front_default" : "back_default"];
			const bytes = await descargarSprite(slug, lado, url, o);
			marcos.push({
				nombre: nombreMarco(slug, lado),
				png: PNG.sync.read(bytes),
			});
		}
	}
	return empaquetar(marcos);
}
