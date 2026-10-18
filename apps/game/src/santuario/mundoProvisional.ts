import { crearRng } from "@santuario/core";

/**
 * Mundo PROVISIONAL del Santuario para el prototipo caminable: se genera aquí
 * mientras llega el núcleo de gestión (`packages/core/src/santuario`), que lo
 * sustituirá con el terreno y los edificios guardados.
 */

/** Orden de las filas de `losetas.png` (4 variantes por fila). */
export const TIPOS_LOSETA = [
	"yerma",
	"tierra",
	"pradera",
	"hierba-alta",
	"agua",
	"arena",
	"roca",
	"camino",
] as const;
export type TipoLosetaProvisional = (typeof TIPOS_LOSETA)[number];

export const LADO = 16;
const BLOQUEAN: ReadonlySet<number> = new Set([
	TIPOS_LOSETA.indexOf("agua"),
	TIPOS_LOSETA.indexOf("roca"),
]);

export interface EdificioProvisional {
	tipo: string;
	/** Esquina superior izquierda y tamaño, en losetas. */
	x: number;
	y: number;
	ancho: number;
	alto: number;
}

export interface Mundo {
	ancho: number;
	alto: number;
	/** Índice en `TIPOS_LOSETA`, fila a fila. */
	losetas: number[];
	variantes: number[];
	edificios: EdificioProvisional[];
	/** Punto de partida del protagonista, en píxeles. */
	inicio: { x: number; y: number };
}

const ANCHO = 40;
const ALTO = 30;
const idx = (t: TipoLosetaProvisional) => TIPOS_LOSETA.indexOf(t);

/** Isla elíptica rodeada de agua, con un lago, rocas, hierba alta y caminos; determinista por semilla. */
export function crearMundo(semilla: string): Mundo {
	const rng = crearRng(`${semilla}:santuario:mundo`);
	const losetas: number[] = [];
	const variantes: number[] = [];
	for (let y = 0; y < ALTO; y++) {
		for (let x = 0; x < ANCHO; x++) {
			const dx = (x - 20) / 18;
			const dy = (y - 15) / 12;
			const d = dx * dx + dy * dy;
			let t: TipoLosetaProvisional;
			if (d > 1) t = "agua";
			else if (d > 0.9) t = "arena";
			else if (Math.hypot(x - 20, y - 15) < 6) t = "tierra";
			else {
				const r = rng.siguiente();
				t =
					r < 0.07
						? "roca"
						: r < 0.2
							? "hierba-alta"
							: r < 0.25
								? "yerma"
								: "pradera";
			}
			// lago al suroeste
			if (((x - 9) / 4) ** 2 + ((y - 21) / 2.6) ** 2 <= 1) t = "agua";
			else if (((x - 9) / 5) ** 2 + ((y - 21) / 3.4) ** 2 <= 1 && t !== "agua")
				t = "arena";
			// caminos: hacia el sur y hacia el este desde el Árbol
			if ((x === 20 && y >= 17 && y <= 26) || (y === 17 && x >= 20 && x <= 31))
				t = "camino";
			losetas.push(idx(t));
			variantes.push(rng.entero(0, 3));
		}
	}
	const edificios: EdificioProvisional[] = [
		{ tipo: "arbol-cenit", x: 19, y: 12, ancho: 3, alto: 3 },
		{ tipo: "huerto-bayas", x: 14, y: 15, ancho: 2, alto: 2 },
		{ tipo: "aserradero", x: 25, y: 9, ancho: 2, alto: 2 },
		{ tipo: "cantera", x: 27, y: 18, ancho: 2, alto: 2 },
		{ tipo: "almacen", x: 14, y: 10, ancho: 2, alto: 2 },
		{ tipo: "lecho-hojas", x: 17, y: 17, ancho: 1, alto: 1 },
		{ tipo: "lecho-hojas", x: 23, y: 16, ancho: 1, alto: 1 },
	];
	// El suelo bajo cada edificio es tierra, no roca ni agua.
	for (const e of edificios)
		for (let j = 0; j < e.alto; j++)
			for (let i = 0; i < e.ancho; i++)
				losetas[(e.y + j) * ANCHO + e.x + i] = idx("tierra");
	return {
		ancho: ANCHO,
		alto: ALTO,
		losetas,
		variantes,
		edificios,
		inicio: { x: 20 * LADO + LADO / 2, y: 16 * LADO + LADO / 2 },
	};
}

/** ¿Hay un obstáculo en el rectángulo (en píxeles)? Fuera del mapa cuenta como obstáculo. */
export function bloqueado(
	m: Mundo,
	px: number,
	py: number,
	w: number,
	h: number,
): boolean {
	if (px < 0 || py < 0 || px + w > m.ancho * LADO || py + h > m.alto * LADO)
		return true;
	const x0 = Math.floor(px / LADO);
	const x1 = Math.floor((px + w - 1) / LADO);
	const y0 = Math.floor(py / LADO);
	const y1 = Math.floor((py + h - 1) / LADO);
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			if (BLOQUEAN.has(m.losetas[y * m.ancho + x] as number)) return true;
			for (const e of m.edificios)
				if (x >= e.x && x < e.x + e.ancho && y >= e.y && y < e.y + e.alto)
					return true;
		}
	}
	return false;
}

/** Edificio de un tipo más cercano al punto (en píxeles) y su distancia al centro. */
export function edificioCercano(
	m: Mundo,
	tipo: string,
	px: number,
	py: number,
): { edificio: EdificioProvisional; distancia: number } | undefined {
	let mejor: { edificio: EdificioProvisional; distancia: number } | undefined;
	for (const e of m.edificios) {
		if (e.tipo !== tipo) continue;
		const cx = (e.x + e.ancho / 2) * LADO;
		const cy = (e.y + e.alto / 2) * LADO;
		const distancia = Math.hypot(px - cx, py - cy);
		if (!mejor || distancia < mejor.distancia)
			mejor = { edificio: e, distancia };
	}
	return mejor;
}
