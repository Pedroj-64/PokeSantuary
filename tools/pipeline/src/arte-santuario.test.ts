import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

/** Ancho y alto de un PNG leídos de su cabecera IHDR (sin dependencias). */
function dimensiones(nombre: string): { w: number; h: number } {
	const b = readFileSync(
		new URL(
			`../../../apps/game/src/assets/santuario/${nombre}`,
			import.meta.url,
		),
	);
	if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${nombre}: no es PNG`);
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Tamaños que espera la escena del Santuario (losetas de 16 px, 8 tipos × 4 variantes).
const ESPERADAS: Record<string, [number, number]> = {
	"losetas.png": [64, 128],
	"protagonista.png": [48, 48],
	"arbol-cenit.png": [48, 48],
	"lecho-hojas.png": [16, 16],
	"huerto-bayas.png": [32, 32],
	"aserradero.png": [32, 32],
	"cantera.png": [32, 32],
	"almacen.png": [32, 32],
};

describe("arte del Santuario", () => {
	for (const [nombre, [w, h]] of Object.entries(ESPERADAS)) {
		it(`${nombre} mide ${w}×${h}`, () => {
			expect(dimensiones(nombre)).toEqual({ w, h });
		});
	}
});

const leerPaleta = (): Set<string> =>
	new Set(
		Object.values(
			JSON.parse(
				readFileSync(
					new URL("../../../packs/comun/paleta.json", import.meta.url),
					"utf8",
				),
			).colores as Record<string, string>,
		),
	);

describe("paleta del arte original", () => {
	it("la paleta de santuario.lua es exactamente packs/comun/paleta.json", () => {
		const lua = readFileSync(
			new URL("../../arte/santuario.lua", import.meta.url),
			"utf8",
		);
		const enLua = new Set(
			[...lua.matchAll(/hex\("(#[0-9a-fA-F]{6})"\)/g)].map((m) =>
				(m[1] as string).toLowerCase(),
			),
		);
		expect(enLua).toEqual(leerPaleta());
	});

	for (const nombre of Object.keys(ESPERADAS)) {
		it(`${nombre} solo usa colores de la paleta`, () => {
			const paleta = leerPaleta();
			const png = PNG.sync.read(
				readFileSync(
					new URL(
						`../../../apps/game/src/assets/santuario/${nombre}`,
						import.meta.url,
					),
				),
			);
			const fuera = new Set<string>();
			for (let i = 0; i < png.data.length; i += 4) {
				if (png.data[i + 3] === 0) continue;
				const hex = `#${[0, 1, 2].map((k) => (png.data[i + k] as number).toString(16).padStart(2, "0")).join("")}`;
				if (!paleta.has(hex)) fuera.add(hex);
			}
			expect([...fuera]).toEqual([]);
		});
	}
});
