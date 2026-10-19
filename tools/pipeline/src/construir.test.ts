import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { archivosDelPack, construir } from "./construir.js";
import { gen9 } from "./unir.js";
import { verificar } from "./verificar.js";

const raiz = fileURLToPath(new URL("../", import.meta.url));

// Respuesta de PokeAPI `move/{slug}` mínima, derivada de @pkmn/data, para los
// movimientos que la caché real todavía no trae (el pack los pedirá al
// regenerarse). Así la prueba sigue sin tocar la red.
const movimientoApi = (slug: string) => {
	const m = gen9.moves.get(slug);
	if (!m?.exists)
		throw new Error(`movimiento inexistente en @pkmn/data: ${slug}`);
	return {
		name: slug,
		type: { name: m.type.toLowerCase() },
		damage_class: { name: m.category.toLowerCase() },
		power: m.basePower > 0 ? m.basePower : null,
		accuracy: m.accuracy === true ? null : m.accuracy,
		pp: m.pp,
		names: [
			{ language: { name: "es" }, name: m.name },
			{ language: { name: "en" }, name: m.name },
		],
	};
};

// Copia temporal de la caché completada con todos los movimientos del pipeline.
const cacheCompleta = () => {
	const dir = mkdtempSync(join(tmpdir(), "cache-"));
	cpSync(join(raiz, "cache"), dir, { recursive: true });
	const slugs: string[] = JSON.parse(
		readFileSync(join(raiz, "movimientos.json"), "utf8"),
	);
	for (const slug of slugs) {
		const archivo = join(dir, `move-${slug}.json`);
		if (!existsSync(archivo))
			writeFileSync(archivo, JSON.stringify(movimientoApi(slug)));
	}
	return dir;
};

const dirKanto = join(raiz, "../../packs/kanto");
const salida = () => {
	const d = mkdtempSync(join(tmpdir(), "salida-"));
	cpSync(join(dirKanto, "trabajos.json"), join(d, "trabajos.json"));
	cpSync(join(dirKanto, "sets.json"), join(d, "sets.json"));
	cpSync(join(dirKanto, "expedicion.json"), join(d, "expedicion.json"));
	cpSync(join(dirKanto, "eventos.json"), join(d, "eventos.json"));
	cpSync(join(dirKanto, "elites.json"), join(d, "elites.json"));
	return d;
};

const opciones = (
	dirPack: string,
	movimientos = join(raiz, "movimientos.json"),
) => ({
	especies: join(raiz, "especies.json"),
	movimientos,
	dirCache: cacheCompleta(),
	dirPack,
	red: vi.fn(),
});

describe("construir", () => {
	it("es determinista y verificable, usando solo la caché", async () => {
		const a = salida();
		const b = salida();
		const red = vi.fn();
		await construir({ ...opciones(a), red });
		await construir({ ...opciones(b), red });
		for (const f of [
			"especies.json",
			"movimientos.json",
			"aprendizaje.json",
			"sets.json",
			"manifest.json",
			"oficial.json",
		]) {
			expect(readFileSync(join(a, f))).toEqual(readFileSync(join(b, f)));
		}
		expect(await verificar(a)).toEqual([]);
		expect(red).not.toHaveBeenCalled();
	});

	it("lanza si el pipeline no descarga algún movimiento que se aprende", async () => {
		const dir = salida();
		const completo: string[] = JSON.parse(
			readFileSync(join(raiz, "movimientos.json"), "utf8"),
		);
		const lista = join(mkdtempSync(join(tmpdir(), "lista-")), "m.json");
		writeFileSync(lista, JSON.stringify(completo.filter((m) => m !== "growl")));
		await expect(construir(opciones(dir, lista))).rejects.toThrow(
			/faltan movimientos.*growl/,
		);
	});
});

describe("archivosDelPack", () => {
	it("solo lista archivos regulares, sin carpetas ni el manifiesto", () => {
		const dir = mkdtempSync(join(tmpdir(), "pack-"));
		writeFileSync(join(dir, "b.json"), "{}");
		writeFileSync(join(dir, "a.json"), "{}");
		writeFileSync(join(dir, "manifest.json"), "{}");
		mkdirSync(join(dir, "carpeta"));
		expect(archivosDelPack(dir)).toEqual(["a.json", "b.json"]);
	});
});
