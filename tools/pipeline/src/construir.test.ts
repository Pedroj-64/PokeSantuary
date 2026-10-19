import {
	cpSync,
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
import { verificar } from "./verificar.js";

const raiz = fileURLToPath(new URL("../", import.meta.url));

describe("construir", () => {
	it("es determinista y verificable, usando solo la caché", async () => {
		const dirKanto = join(raiz, "../../packs/kanto");
		const trabajos = join(dirKanto, "trabajos.json");
		const salida = () => {
			const d = mkdtempSync(join(tmpdir(), "salida-"));
			cpSync(trabajos, join(d, "trabajos.json"));
			cpSync(join(dirKanto, "sets.json"), join(d, "sets.json"));
			cpSync(join(dirKanto, "expedicion.json"), join(d, "expedicion.json"));
			cpSync(join(dirKanto, "eventos.json"), join(d, "eventos.json"));
			cpSync(join(dirKanto, "elites.json"), join(d, "elites.json"));
			return d;
		};
		const red = vi.fn();
		const opciones = {
			especies: join(raiz, "especies.json"),
			movimientos: join(raiz, "movimientos.json"),
			dirCache: join(raiz, "cache"),
			red,
		};
		const a = salida();
		const b = salida();
		await construir({ ...opciones, dirPack: a });
		await construir({ ...opciones, dirPack: b });
		for (const f of [
			"especies.json",
			"movimientos.json",
			"sets.json",
			"manifest.json",
			"oficial.json",
		]) {
			expect(readFileSync(join(a, f))).toEqual(readFileSync(join(b, f)));
		}
		expect(await verificar(a)).toEqual([]);
		expect(red).not.toHaveBeenCalled();
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
