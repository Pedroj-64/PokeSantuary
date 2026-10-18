import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Ancho y alto de un PNG leídos de su cabecera IHDR (sin dependencias). */
function dimensiones(nombre: string): { w: number; h: number } {
	const b = readFileSync(new URL(nombre, import.meta.url));
	if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${nombre}: no es PNG`);
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Tamaños que espera la escena del Santuario (losetas de 16 px, 8 tipos × 4 variantes).
const ESPERADAS: Record<string, [number, number]> = {
	"losetas.png": [64, 128],
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
