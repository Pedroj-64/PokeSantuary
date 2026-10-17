import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as esperar } from "node:timers/promises";

const BASE = "https://pokeapi.co/api/v2";
const USER_AGENT = "santuario-pipeline (datos de desarrollo, con caché local)";

export type Red = (
	url: string,
	init: { headers: Record<string, string> },
) => Promise<Response>;
export type OpcionesDescarga = {
	dirCache: string;
	red?: Red;
	pausaMs?: number;
};

let ultimaPeticion = 0;

async function obtener(
	endpoint: string,
	slug: string,
	o: OpcionesDescarga,
): Promise<unknown> {
	const archivo = join(o.dirCache, `${endpoint}-${slug}.json`);
	if (existsSync(archivo)) return JSON.parse(readFileSync(archivo, "utf8"));
	// Pausa entre peticiones reales, para no cargar a PokeAPI.
	const pausa = o.pausaMs ?? 1000;
	const falta = ultimaPeticion + pausa - Date.now();
	if (falta > 0) await esperar(falta);
	ultimaPeticion = Date.now();
	const url = `${BASE}/${endpoint}/${slug}`;
	const r = await (o.red ?? fetch)(url, {
		headers: { "User-Agent": USER_AGENT },
	});
	if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
	const texto = await r.text();
	const datos = JSON.parse(texto); // falla antes de guardar si no es JSON
	mkdirSync(o.dirCache, { recursive: true });
	writeFileSync(archivo, texto);
	return datos;
}

const validarSlug = (slug: string) => {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
		throw new Error(`slug no válido: ${slug}`);
};

export async function descargarMovimiento(slug: string, o: OpcionesDescarga) {
	validarSlug(slug);
	return obtener("move", slug, o);
}

export async function descargar(slug: string, o: OpcionesDescarga) {
	validarSlug(slug);
	const pokemon = await obtener("pokemon", slug, o);
	const especie = await obtener("pokemon-species", slug, o);
	return { pokemon, especie };
}
