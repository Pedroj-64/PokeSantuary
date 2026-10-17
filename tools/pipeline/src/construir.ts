import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TrabajosPorTipoSchema } from "@santuario/data";
import { descargar, type Red } from "./descargar.js";
import { sha256 } from "./manifiesto.js";
import { type EspecieApi, type PokemonApi, recortar } from "./recortar.js";
import { unir } from "./unir.js";

export type OpcionesConstruir = {
	especies: string; // ruta a especies.json (lista de slugs)
	dirCache: string;
	dirPack: string; // debe contener ya trabajos.json
	red?: Red;
};

// Archivos del pack que entran al manifiesto: todos menos el propio manifest.json.
export const archivosDelPack = (dirPack: string) =>
	readdirSync(dirPack)
		.filter((f) => f !== "manifest.json")
		.sort();

export const aJson = (v: unknown) => `${JSON.stringify(v, null, "\t")}\n`;

export async function construir(o: OpcionesConstruir): Promise<number> {
	const slugs: string[] = JSON.parse(readFileSync(o.especies, "utf8"));
	const trabajos = TrabajosPorTipoSchema.parse(
		JSON.parse(readFileSync(join(o.dirPack, "trabajos.json"), "utf8")),
	);
	const lista = [];
	for (const slug of slugs) {
		const { pokemon, especie } = await descargar(slug, o);
		lista.push(
			unir(recortar(pokemon as PokemonApi, especie as EspecieApi), trabajos),
		);
	}
	lista.sort((a, b) => a.dex - b.dex);
	writeFileSync(join(o.dirPack, "especies.json"), aJson(lista));
	const archivos = Object.fromEntries(
		archivosDelPack(o.dirPack).map((f) => [f, sha256(join(o.dirPack, f))]),
	);
	writeFileSync(join(o.dirPack, "manifest.json"), aJson({ archivos }));
	return lista.length;
}
