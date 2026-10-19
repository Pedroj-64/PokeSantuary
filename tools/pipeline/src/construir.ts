import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type Aprendizaje,
	AprendizajeSchema,
	MovimientoSchema,
	SetCombateSchema,
	TrabajosPorTipoSchema,
} from "@santuario/data";
import { z } from "zod";
import { type AprendizajeNivel, aprendizajePorNivel } from "./aprendizaje.js";
import { descargar, descargarMovimiento, type Red } from "./descargar.js";
import { sha256 } from "./manifiesto.js";
import {
	erroresDeSets,
	type MovimientoApi,
	recortarMovimiento,
	unirMovimiento,
} from "./movimientos.js";
import { oficialDe } from "./oficial.js";
import { type EspecieApi, type PokemonApi, recortar } from "./recortar.js";
import { unir } from "./unir.js";

export type OpcionesConstruir = {
	especies: string; // ruta a especies.json (lista de slugs)
	movimientos: string; // ruta a movimientos.json (lista de slugs)
	dirCache: string;
	dirPack: string; // debe contener ya trabajos.json, sets.json y expedicion.json
	red?: Red;
};

// Archivos del pack que entran al manifiesto: todos menos el propio manifest.json.
export const archivosDelPack = (dirPack: string) =>
	readdirSync(dirPack)
		.filter((f) => f !== "manifest.json" && statSync(join(dirPack, f)).isFile())
		.sort();

export const aJson = (v: unknown) => `${JSON.stringify(v, null, "\t")}\n`;

// Movimientos por nivel de todas las especies, con las claves ordenadas. Exige
// que el pipeline descargue todos los movimientos que hacen falta.
async function generarAprendizaje(
	especies: string[],
	movimientosDisponibles: string[],
): Promise<Aprendizaje> {
	const crudo: Record<string, AprendizajeNivel[]> = {};
	for (const especie of [...especies].sort())
		crudo[especie] = await aprendizajePorNivel(especie);
	const aprendizaje = AprendizajeSchema.parse(crudo);
	const disponibles = new Set(movimientosDisponibles);
	const faltan = [
		...new Set(
			Object.values(aprendizaje).flatMap((lista) =>
				lista.map((e) => e.movimiento),
			),
		),
	]
		.filter((m) => !disponibles.has(m))
		.sort();
	if (faltan.length > 0)
		throw new Error(
			`aprendizaje.json: faltan movimientos en tools/pipeline/movimientos.json: ${faltan.join(", ")}`,
		);
	return aprendizaje;
}

export async function construir(o: OpcionesConstruir): Promise<number> {
	const slugs: string[] = JSON.parse(readFileSync(o.especies, "utf8"));
	const trabajos = TrabajosPorTipoSchema.parse(
		JSON.parse(readFileSync(join(o.dirPack, "trabajos.json"), "utf8")),
	);
	const lista = [];
	const fuentes = [];
	for (const slug of slugs) {
		const { pokemon, especie } = await descargar(slug, o);
		fuentes.push({ slug, pokemon });
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
	writeFileSync(
		join(o.dirPack, "aprendizaje.json"),
		aJson(
			await generarAprendizaje(
				lista.map((e) => e.id),
				slugsMov,
			),
		),
	);
	writeFileSync(join(o.dirPack, "oficial.json"), aJson(oficialDe(fuentes)));
	const archivos = Object.fromEntries(
		archivosDelPack(o.dirPack).map((f) => [f, sha256(join(o.dirPack, f))]),
	);
	writeFileSync(join(o.dirPack, "manifest.json"), aJson({ archivos }));
	return lista.length;
}
