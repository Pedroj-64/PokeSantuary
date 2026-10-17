import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AtlasSchema } from "@santuario/data";
import { PNG } from "pngjs";
import { describe, expect, it, vi } from "vitest";
import type { Red } from "./descargar.js";
import {
	ACOLCHADO,
	descargarSprite,
	empaquetar,
	nombreMarco,
	rutaSprite,
} from "./sprites.js";

const fx = (f: string) =>
	readFileSync(
		fileURLToPath(new URL(`../test/fixtures/${f}`, import.meta.url)),
	);
const BUENA =
	"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/63.png";
const ok = (bytes: Buffer) =>
	vi.fn<Red>(async () => new Response(new Uint8Array(bytes)));
const o = () => ({
	dirCache: mkdtempSync(join(tmpdir(), "cache-")),
	pausaMs: 0,
});

describe("descargarSprite", () => {
	it("guarda un PNG válido y la segunda vez no usa la red", async () => {
		const op = o();
		const red = ok(fx("abra-frente.png"));
		await descargarSprite("abra", "frente", BUENA, { ...op, red });
		expect(existsSync(rutaSprite(op.dirCache, "abra", "frente"))).toBe(true);
		const red2 = vi.fn();
		await descargarSprite("abra", "frente", BUENA, { ...op, red: red2 });
		expect(red).toHaveBeenCalledOnce();
		expect(red2).not.toHaveBeenCalled();
	});

	it("rechaza hosts y formas de URL no permitidos", async () => {
		for (const url of [
			"https://evil.example/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/63.png",
			"http://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/63.png",
			"https://raw.githubusercontent.com.evil.example/x.png",
			"https://user@raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/63.png",
			"https://raw.githubusercontent.com/otro/repo/x.png",
			`${BUENA}?x=1`,
			"no es url",
			undefined,
		]) {
			const red = vi.fn();
			await expect(
				descargarSprite("abra", "frente", url, { ...o(), red }),
			).rejects.toThrow(/URL/);
			expect(red).not.toHaveBeenCalled();
		}
	});

	it("rechaza un IHDR falsificado enorme sin llamar al decodificador", async () => {
		const falso = Buffer.from(fx("abra-frente.png"));
		falso.writeUInt32BE(100000, 16);
		falso.writeUInt32BE(100000, 20);
		const op = o();
		const leer = vi.spyOn(PNG.sync, "read");
		await expect(
			descargarSprite("abra", "frente", BUENA, { ...op, red: ok(falso) }),
		).rejects.toThrow(/dimensiones del PNG fuera de rango/);
		expect(leer).not.toHaveBeenCalled();
		leer.mockRestore();
		expect(existsSync(rutaSprite(op.dirCache, "abra", "frente"))).toBe(false);
	});

	it("rechaza por content-length declarado sobre el tope", async () => {
		const red = async () =>
			new Response(new Uint8Array(fx("abra-frente.png")), {
				headers: { "content-length": String(300 * 1024) },
			});
		await expect(
			descargarSprite("abra", "frente", BUENA, { ...o(), red }),
		).rejects.toThrow(/demasiado grande/);
	});

	it("pasa redirect: error al fetch", async () => {
		const red = ok(fx("abra-frente.png"));
		await descargarSprite("abra", "frente", BUENA, { ...o(), red });
		expect(red.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
	});

	it("en cache hit también comprueba la firma PNG", async () => {
		const op = o();
		await descargarSprite("abra", "frente", BUENA, {
			...op,
			red: ok(fx("abra-frente.png")),
		});
		writeFileSync(
			rutaSprite(op.dirCache, "abra", "frente"),
			"basura".repeat(10),
		);
		await expect(
			descargarSprite("abra", "frente", BUENA, { ...op, red: vi.fn() }),
		).rejects.toThrow(/no es un PNG/);
	});

	it("rechaza slugs inseguros", async () => {
		await expect(
			descargarSprite("../x", "frente", BUENA, { ...o(), red: vi.fn() }),
		).rejects.toThrow(/slug/);
	});

	it("rechaza bytes que no son PNG, PNG enormes y HTTP no OK, sin cachearlos", async () => {
		const casos: [Response, RegExp][] = [
			[new Response("<html>"), /no es un PNG/],
			[new Response(new Uint8Array(300 * 1024)), /demasiado grande/],
			[new Response("x", { status: 404 }), /HTTP 404/],
		];
		for (const [resp, msg] of casos) {
			const op = o();
			await expect(
				descargarSprite("abra", "frente", BUENA, {
					...op,
					red: async () => resp,
				}),
			).rejects.toThrow(msg);
			expect(existsSync(rutaSprite(op.dirCache, "abra", "frente"))).toBe(false);
		}
	});
});

describe("empaquetar", () => {
	it("pone los marcos sin solaparse y es determinista", () => {
		const marcos = ["frente", "espalda"].map((l) => ({
			nombre: nombreMarco("abra", l as "frente" | "espalda"),
			png: PNG.sync.read(fx(`abra-${l}.png`)),
		}));
		const a = empaquetar(marcos);
		const b = empaquetar([...marcos].reverse());
		expect(a.png).toEqual(b.png);
		expect(a.json).toEqual(b.json);
		expect(AtlasSchema.parse(a.json)).toBeTruthy();
		expect(Object.keys(a.json.frames)).toEqual([
			"combate/abra/espalda",
			"combate/abra/frente",
		]);
	});
});

describe("empaquetar sin solapes", () => {
	const caja = (w: number, h: number, n: number) => {
		const png = new PNG({ width: w, height: h });
		png.data.fill(n);
		return { nombre: `combate/e${n}/frente`, png };
	};

	it("deja 10 marcos de tamaños variados disjuntos, con acolchado y dentro de la imagen", () => {
		const tams = [
			[96, 96],
			[80, 64],
			[96, 50],
			[120, 130],
			[40, 40],
			[200, 90],
			[96, 96],
			[33, 71],
			[150, 150],
			[64, 64],
		];
		const { json } = empaquetar(
			tams.map(([w, h], i) => caja(w as number, h as number, i + 1)),
		);
		const cajas = Object.values(json.frames).map((f) => f.frame);
		expect(cajas).toHaveLength(10);
		expect(new Set(cajas.map((c) => c.y)).size).toBeGreaterThan(1); // hubo salto de estante
		for (const c of cajas) {
			expect(c.x).toBeGreaterThanOrEqual(ACOLCHADO);
			expect(c.y).toBeGreaterThanOrEqual(ACOLCHADO);
			expect(c.x + c.w + ACOLCHADO).toBeLessThanOrEqual(json.meta.size.w);
			expect(c.y + c.h + ACOLCHADO).toBeLessThanOrEqual(json.meta.size.h);
		}
		for (const [i, a] of cajas.entries())
			for (const b of cajas.slice(i + 1)) {
				const separados =
					a.x + a.w + ACOLCHADO <= b.x ||
					b.x + b.w + ACOLCHADO <= a.x ||
					a.y + a.h + ACOLCHADO <= b.y ||
					b.y + b.h + ACOLCHADO <= a.y;
				expect(separados).toBe(true);
			}
	});

	it("lanza si un sprite no cabe en el ancho del atlas", () => {
		expect(() => empaquetar([caja(600, 10, 1)])).toThrow(/más ancho/);
	});
});
