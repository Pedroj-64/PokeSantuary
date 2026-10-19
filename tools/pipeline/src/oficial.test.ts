import { OficialSchema } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { oficialDe, oficialesVersionados, spritesDe } from "./oficial.js";

const BASE =
	"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/";
const pokemon = (frente: unknown, espalda: unknown) => ({
	sprites: {
		versions: {
			"generation-v": {
				"black-white": { front_default: frente, back_default: espalda },
			},
		},
	},
});

describe("spritesDe", () => {
	it("devuelve las dos URL de Negro y Blanco", () => {
		expect(spritesDe(pokemon(`${BASE}63.png`, `${BASE}back/63.png`))).toEqual({
			frente: `${BASE}63.png`,
			espalda: `${BASE}back/63.png`,
		});
	});

	it("rechaza hosts y formas de URL no permitidos", () => {
		for (const url of [
			"https://evil.example/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/63.png",
			`http://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/63.png`,
			"https://raw.githubusercontent.com.evil.example/x.png",
			"https://user@raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/63.png",
			"https://raw.githubusercontent.com/otro/repo/x.png",
			`${BASE}63.png?x=1`,
			"no es url",
			null,
		])
			expect(() => spritesDe(pokemon(url, `${BASE}back/63.png`))).toThrow();
	});

	it("falla si el Pokémon no trae sprites de Negro y Blanco", () => {
		expect(() => spritesDe({})).toThrow(/ausente/);
	});
});

describe("oficialDe", () => {
	it("ordena por especie y valida con el esquema", () => {
		const o = oficialDe([
			{
				slug: "zubat",
				pokemon: pokemon(`${BASE}41.png`, `${BASE}back/41.png`),
			},
			{ slug: "abra", pokemon: pokemon(`${BASE}63.png`, `${BASE}back/63.png`) },
		]);
		expect(Object.keys(o.sprites)).toEqual(["abra", "zubat"]);
		expect(OficialSchema.safeParse(o).success).toBe(true);
	});
});

describe("oficialesVersionados", () => {
	it("marca sprites, atlas y la carpeta oficial/, y deja pasar el resto", () => {
		expect(
			oficialesVersionados([
				"oficial/o2/golpe.wav",
				"tools/pipeline/cache/sprites/abra-frente.png",
				"packs/kanto/atlas-combate.png",
				"packs/kanto/atlas-combate.json",
				"packs/kanto/oficial.json",
				"tools/pipeline/cache/pokemon-abra.json",
				"apps/game/src/assets/santuario/losetas.png",
			]),
		).toEqual([
			"oficial/o2/golpe.wav",
			"tools/pipeline/cache/sprites/abra-frente.png",
			"packs/kanto/atlas-combate.png",
			"packs/kanto/atlas-combate.json",
		]);
	});
});
