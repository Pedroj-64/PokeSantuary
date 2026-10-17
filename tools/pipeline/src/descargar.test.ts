import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { descargar } from "./descargar.js";

describe("descargar", () => {
	it("con caché no usa la red", async () => {
		const dir = mkdtempSync(join(tmpdir(), "cache-"));
		writeFileSync(join(dir, "pokemon-pikachu.json"), '{"a":1}');
		writeFileSync(join(dir, "pokemon-species-pikachu.json"), '{"b":2}');
		const red = vi.fn();
		const r = await descargar("pikachu", { dirCache: dir, red });
		expect(r).toEqual({ pokemon: { a: 1 }, especie: { b: 2 } });
		expect(red).not.toHaveBeenCalled();
	});

	it("rechaza slugs que no son seguros", async () => {
		const dir = mkdtempSync(join(tmpdir(), "cache-"));
		await expect(
			descargar("../x", { dirCache: dir, red: vi.fn() }),
		).rejects.toThrow(/slug/);
	});

	it("sin caché pide ambos endpoints con User-Agent y los guarda", async () => {
		const dir = mkdtempSync(join(tmpdir(), "cache-"));
		const red = vi.fn(async () => new Response('{"ok":true}'));
		await descargar("abra", { dirCache: dir, red, pausaMs: 0 });
		const urls = red.mock.calls.map((c) => String((c as unknown[])[0]));
		expect(urls).toEqual([
			"https://pokeapi.co/api/v2/pokemon/abra",
			"https://pokeapi.co/api/v2/pokemon-species/abra",
		]);
		const init = (red.mock.calls[0] as unknown[])[1] as {
			headers: Record<string, string>;
		};
		expect(init.headers["User-Agent"]).toMatch(/^santuario-pipeline/);
		// segunda llamada: ya en caché
		await descargar("abra", { dirCache: dir, red, pausaMs: 0 });
		expect(red).toHaveBeenCalledTimes(2);
	});
});
