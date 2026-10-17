import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verificar } from "./verificar.js";

const PACK_REAL = new URL("../../../packs/kanto", import.meta.url).pathname;

const copia = () => {
	const dir = mkdtempSync(join(tmpdir(), "pack-"));
	cpSync(PACK_REAL, dir, { recursive: true });
	return dir;
};

describe("verificar", () => {
	it("acepta el pack tal como está", () => {
		expect(verificar(copia())).toEqual([]);
	});

	it("falla si se altera un byte de especies.json", () => {
		const dir = copia();
		const ruta = join(dir, "especies.json");
		const texto = readFileSync(ruta, "utf8");
		writeFileSync(ruta, texto.replace("Pikachu", "Pikachu "));
		expect(verificar(dir).join("\n")).toMatch(/especies\.json.*hash/);
	});

	it("falla si una especie no existe en @pkmn/data", () => {
		const dir = copia();
		const ruta = join(dir, "especies.json");
		const especies = JSON.parse(readFileSync(ruta, "utf8"));
		especies[0].id = "noexiste";
		writeFileSync(ruta, JSON.stringify(especies));
		expect(verificar(dir).join("\n")).toMatch(/noexiste: no existe en @pkmn/);
	});

	it("rechaza claves del manifiesto que escapan del pack o con byte nulo", () => {
		for (const clave of ["../especies.json", "a\0b.json", "/etc/passwd"]) {
			const dir = copia();
			const hash = "0".repeat(64);
			writeFileSync(
				join(dir, "manifest.json"),
				JSON.stringify({ archivos: { [clave]: hash } }),
			);
			expect(verificar(dir).length).toBeGreaterThan(0);
		}
	});

	it("falla si hay un archivo del pack que el manifiesto no declara", () => {
		const dir = copia();
		writeFileSync(join(dir, "extra.json"), "{}");
		expect(verificar(dir).join("\n")).toMatch(/extra\.json/);
	});
});
