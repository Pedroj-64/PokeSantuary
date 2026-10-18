import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	AtlasSchema,
	EspecieSchema,
	ExpedicionBalanceSchema,
	ManifiestoSchema,
	type Movimiento,
	MovimientoSchema,
	SetCombateSchema,
	TrabajosPorTipoSchema,
} from "@santuario/data";
import { z } from "zod";
import { archivosDelPack } from "./construir.js";
import { resolverEnPack, sha256 } from "./manifiesto.js";
import { erroresDeSets, unirMovimiento } from "./movimientos.js";
import { LADOS, leerPng, nombreMarco, rutaSprite } from "./sprites.js";
import { especiesPkmn } from "./unir.js";

const leer = (dir: string, f: string) =>
	JSON.parse(readFileSync(join(dir, f), "utf8"));

// Revisa el pack sin red. Devuelve la lista de errores (vacía si todo está bien).
export async function verificar(
	dirPack: string,
	listaMovimientos = fileURLToPath(
		new URL("../movimientos.json", import.meta.url),
	),
	dirCache = fileURLToPath(new URL("../cache", import.meta.url)),
): Promise<string[]> {
	const errores: string[] = [];
	const intentar = async (f: () => void | Promise<void>) => {
		try {
			await f();
		} catch (e) {
			errores.push(e instanceof Error ? e.message : String(e));
		}
	};

	let archivos: Record<string, string> = {};
	await intentar(() => {
		archivos = ManifiestoSchema.parse(leer(dirPack, "manifest.json")).archivos;
	});
	for (const [clave, esperado] of Object.entries(archivos)) {
		await intentar(() => {
			const ruta = resolverEnPack(dirPack, clave);
			if (!existsSync(ruta)) throw new Error(`${clave}: no existe`);
			if (sha256(ruta) !== esperado)
				throw new Error(`${clave}: hash distinto al del manifiesto`);
		});
	}
	await intentar(() => {
		for (const f of archivosDelPack(dirPack))
			if (!(f in archivos)) throw new Error(`${f}: no está en el manifiesto`);
	});
	await intentar(() => {
		TrabajosPorTipoSchema.parse(leer(dirPack, "trabajos.json"));
	});
	let especies: string[] = [];
	let movs: Movimiento[] = [];
	await intentar(() => {
		const lista = z.array(EspecieSchema).parse(leer(dirPack, "especies.json"));
		especies = lista.map((e) => e.id);
		const vistos = new Set<string>();
		for (const e of lista) {
			if (vistos.has(e.id)) throw new Error(`${e.id}: especie repetida`);
			vistos.add(e.id);
			if (!especiesPkmn.get(e.id)?.exists)
				throw new Error(`${e.id}: no existe en @pkmn/data`);
		}
	});
	await intentar(() => {
		const atlas = AtlasSchema.parse(leer(dirPack, "atlas-combate.json"));
		const png = leerPng(
			readFileSync(resolverEnPack(dirPack, "atlas-combate.png")),
			"atlas-combate.png",
			2048,
		);
		for (const especie of especies)
			for (const lado of LADOS) {
				const nombre = nombreMarco(especie, lado);
				const m = atlas.frames[nombre];
				if (!m) {
					errores.push(`atlas: falta el marco ${nombre}`);
					continue;
				}
				const { x, y, w, h } = m.frame;
				if (w <= 0 || h <= 0 || x + w > png.width || y + h > png.height) {
					errores.push(`atlas: ${nombre} con tamaño o posición no válidos`);
					continue;
				}
				const rutaFuente = rutaSprite(dirCache, especie, lado);
				const fuente = leerPng(readFileSync(rutaFuente), rutaFuente);
				let igual = fuente.width === w && fuente.height === h;
				for (let fila = 0; igual && fila < h; fila++) {
					const a = (y + fila) * png.width * 4 + x * 4;
					igual = png.data
						.subarray(a, a + w * 4)
						.equals(fuente.data.subarray(fila * w * 4, (fila + 1) * w * 4));
				}
				if (!igual) errores.push(`atlas: ${nombre} difiere del sprite fuente`);
			}
	});
	await intentar(() => {
		const lista = z
			.array(MovimientoSchema)
			.parse(leer(dirPack, "movimientos.json"));
		movs = lista;
		const vistos = new Set<string>();
		for (const m of lista) {
			if (vistos.has(m.id)) throw new Error(`${m.id}: movimiento repetido`);
			vistos.add(m.id);
		}
		for (const m of lista)
			if (JSON.stringify(unirMovimiento(m)) !== JSON.stringify(m))
				throw new Error(`${m.id}: difiere de @pkmn/data`);
	});
	await intentar(async () => {
		const sets = z.array(SetCombateSchema).parse(leer(dirPack, "sets.json"));
		errores.push(
			...(await erroresDeSets(sets, { movimientos: movs, especies })),
		);
		const lista: string[] = JSON.parse(readFileSync(listaMovimientos, "utf8"));
		for (const s of sets)
			for (const m of s.movimientos)
				if (!lista.includes(m))
					errores.push(
						`set de ${s.especie}: ${m} no está en tools/pipeline/movimientos.json`,
					);
	});
	await intentar(() => {
		const balance = ExpedicionBalanceSchema.parse(
			leer(dirPack, "expedicion.json"),
		);
		for (const id of Object.keys(balance.tasaCaptura))
			if (!especies.includes(id))
				throw new Error(
					`expedicion.json: tasaCaptura de ${id}, que no está en especies.json`,
				);
	});
	return errores;
}
