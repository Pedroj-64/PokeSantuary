import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verificar } from "./verificar.js";

const PACK_REAL = fileURLToPath(
	new URL("../../../packs/kanto", import.meta.url),
);

const copia = () => {
	const dir = mkdtempSync(join(tmpdir(), "pack-"));
	cpSync(PACK_REAL, dir, { recursive: true });
	return dir;
};

type Fila = { especie: string; movimientos: string[] };

describe("verificar", () => {
	it("acepta el pack tal como está", async () => {
		expect(await verificar(copia())).toEqual([]);
	});

	it("falla si se altera un byte de especies.json", async () => {
		const dir = copia();
		const ruta = join(dir, "especies.json");
		const texto = readFileSync(ruta, "utf8");
		writeFileSync(ruta, texto.replace("Pikachu", "Pikachu "));
		expect((await verificar(dir)).join("\n")).toMatch(/especies\.json.*hash/);
	});

	it("falla si una especie no existe en @pkmn/data", async () => {
		const dir = copia();
		const ruta = join(dir, "especies.json");
		const especies = JSON.parse(readFileSync(ruta, "utf8"));
		especies[0].id = "noexiste";
		writeFileSync(ruta, JSON.stringify(especies));
		expect((await verificar(dir)).join("\n")).toMatch(
			/noexiste: no existe en @pkmn/,
		);
	});

	it("rechaza claves del manifiesto que escapan del pack o con byte nulo", async () => {
		for (const clave of ["../especies.json", "a\0b.json", "/etc/passwd"]) {
			const dir = copia();
			const hash = "0".repeat(64);
			writeFileSync(
				join(dir, "manifest.json"),
				JSON.stringify({ archivos: { [clave]: hash } }),
			);
			expect((await verificar(dir)).length).toBeGreaterThan(0);
		}
	});

	it("falla si hay un archivo del pack que el manifiesto no declara", async () => {
		const dir = copia();
		writeFileSync(join(dir, "extra.json"), "{}");
		expect((await verificar(dir)).join("\n")).toMatch(/extra\.json/);
	});
	describe("sets y movimientos", () => {
		const editar = (archivo: string, f: (d: Fila[]) => void) => {
			const dir = copia();
			const ruta = join(dir, archivo);
			const datos = JSON.parse(readFileSync(ruta, "utf8"));
			f(datos);
			writeFileSync(ruta, JSON.stringify(datos));
			return dir;
		};

		it("falla si un set referencia un movimiento ausente de movimientos.json", async () => {
			const dir = editar("movimientos.json", (m) => {
				m.splice(0, m.length);
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/no está en movimientos\.json/,
			);
		});

		it("falla si un movimiento no existe en @pkmn/data", async () => {
			const dir = editar("sets.json", (s) => {
				(s[0] as Fila).movimientos[0] = "noexiste";
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/noexiste.*no existe en @pkmn/,
			);
		});

		it("falla si la especie no puede aprender el movimiento", async () => {
			const dir = editar("sets.json", (s) => {
				(s[0] as Fila).movimientos[0] = "thunderbolt";
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/no puede aprender thunderbolt/,
			);
		});

		it("falla si la especie del set no está en especies.json", async () => {
			const dir = editar("sets.json", (s) => {
				(s[0] as Fila).especie = "mew";
			});
			expect((await verificar(dir)).join("\n")).toMatch(/mew.*especies\.json/);
		});

		it("falla si sets.json o movimientos.json se alteran sin actualizar el manifiesto", async () => {
			for (const f of ["sets.json", "movimientos.json"]) {
				const dir = copia();
				writeFileSync(join(dir, f), `${readFileSync(join(dir, f), "utf8")} `);
				expect((await verificar(dir)).join("\n")).toMatch(
					new RegExp(`${f.replace(".", "\\.")}.*hash`),
				);
			}
		});

		it("falla si falta sets.json en el manifiesto", async () => {
			const dir = copia();
			const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
			delete m.archivos["sets.json"];
			writeFileSync(join(dir, "manifest.json"), JSON.stringify(m));
			expect((await verificar(dir)).join("\n")).toMatch(
				/sets\.json: no está en el manifiesto/,
			);
		});

		it("falla si movimientos.json repite un id", async () => {
			const dir = copia();
			const ruta = join(dir, "movimientos.json");
			const m = JSON.parse(readFileSync(ruta, "utf8"));
			m.push(m[0]);
			writeFileSync(ruta, JSON.stringify(m));
			expect((await verificar(dir)).join("\n")).toMatch(/movimiento repetido/);
		});

		it("falla si un movimiento de un set falta en la lista del pipeline", async () => {
			const lista = join(mkdtempSync(join(tmpdir(), "lista-")), "m.json");
			writeFileSync(lista, "[]");
			expect((await verificar(copia(), lista)).join("\n")).toMatch(
				/no está en tools\/pipeline\/movimientos\.json/,
			);
		});
	});
});
