import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	EspecieSchema,
	ManifiestoSchema,
	TrabajosPorTipoSchema,
} from "@santuario/data";
import { z } from "zod";
import { archivosDelPack } from "./construir.js";
import { resolverEnPack, sha256 } from "./manifiesto.js";
import { especiesPkmn } from "./unir.js";

const leer = (dir: string, f: string) =>
	JSON.parse(readFileSync(join(dir, f), "utf8"));

// Revisa el pack sin red. Devuelve la lista de errores (vacía si todo está bien).
export function verificar(dirPack: string): string[] {
	const errores: string[] = [];
	const intentar = (f: () => void) => {
		try {
			f();
		} catch (e) {
			errores.push(e instanceof Error ? e.message : String(e));
		}
	};

	let archivos: Record<string, string> = {};
	intentar(() => {
		archivos = ManifiestoSchema.parse(leer(dirPack, "manifest.json")).archivos;
	});
	for (const [clave, esperado] of Object.entries(archivos)) {
		intentar(() => {
			const ruta = resolverEnPack(dirPack, clave);
			if (!existsSync(ruta)) throw new Error(`${clave}: no existe`);
			if (sha256(ruta) !== esperado)
				throw new Error(`${clave}: hash distinto al del manifiesto`);
		});
	}
	intentar(() => {
		for (const f of archivosDelPack(dirPack))
			if (!(f in archivos)) throw new Error(`${f}: no está en el manifiesto`);
	});
	intentar(() => TrabajosPorTipoSchema.parse(leer(dirPack, "trabajos.json")));
	intentar(() => {
		const lista = z.array(EspecieSchema).parse(leer(dirPack, "especies.json"));
		const vistos = new Set<string>();
		for (const e of lista) {
			if (vistos.has(e.id)) throw new Error(`${e.id}: especie repetida`);
			vistos.add(e.id);
			if (!especiesPkmn.get(e.id)?.exists)
				throw new Error(`${e.id}: no existe en @pkmn/data`);
		}
	});
	return errores;
}
