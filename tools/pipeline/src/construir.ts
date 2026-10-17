import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	MovimientoSchema,
	SetCombateSchema,
	TrabajosPorTipoSchema,
} from "@santuario/data";
import { z } from "zod";
import { descargar, descargarMovimiento, type Red } from "./descargar.js";
import { sha256 } from "./manifiesto.js";
import {
	erroresDeSets,
	type MovimientoApi,
	recortarMovimiento,
	unirMovimiento,
} from "./movimientos.js";
import { type EspecieApi, type PokemonApi, recortar } from "./recortar.js";
import { unir } from "./unir.js";

export type OpcionesConstruir = {
	especies: string; // ruta a especies.json (lista de slugs)
	movimientos: string; // ruta a movimientos.json (lista de slugs)
	dirCache: string;
	dirPack: string; // debe contener ya trabajos.json y sets.json
	red?: Red;
};

// Archivos del pack que entran al manifiesto: todos menos el propio manifest.json.
export const archivosDelPack = (dirPack: string) =>
	readdirSync(dirPack)
		.filter((f) => f !== "manifest.json" && statSync(join(dirPack, f)).isFile())
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
	const slugsMov: string[] = JSON.parse(readFileSync(o.movimientos, "utf8"));
	const movs = [];
	for (const slug of new Set(slugsMov)) {
		const api = await descargarMovimiento(slug, o);
		movs.push(unirMovimiento(recortarMovimiento(api as MovimientoApi)));
	}
	movs.sort((a, b) => (a.id < b.id ? -1 : 1));
	const sets = z
		.array(SetCombateSchema)
		.parse(JSON.parse(readFileSync(join(o.dirPack, "sets.json"), "utf8")));
	const errores = await erroresDeSets(sets, {
		movimientos: movs,
		especies: lista.map((e) => e.id),
	});
	if (errores.length > 0) throw new Error(errores.join("\n"));
	writeFileSync(
		join(o.dirPack, "movimientos.json"),
		aJson(z.array(MovimientoSchema).parse(movs)),
	);
	writeFileSync(join(o.dirPack, "especies.json"), aJson(lista));
	const archivos = Object.fromEntries(
		archivosDelPack(o.dirPack).map((f) => [f, sha256(join(o.dirPack, f))]),
	);
	writeFileSync(join(o.dirPack, "manifest.json"), aJson({ archivos }));
	return lista.length;
}
