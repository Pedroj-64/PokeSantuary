import type {
	Edificio,
	EstadoSantuario,
	SantuarioBalance,
} from "@santuario/core";

/** Lado de una loseta en píxeles (zoom 1). */
export const LADO = 16;

/** Losetas por las que no se camina. */
const BLOQUEAN: ReadonlySet<string> = new Set(["agua", "roca"]);
/** Objetos que se pisan (los demás bloquean: árboles, faroles, decoraciones...). */
const SE_PISAN: ReadonlySet<string> = new Set(["tocon", "flor", "brote"]);

/** Rectángulo de un edificio en losetas. */
export function rectanguloDeEdificio(
	e: Edificio,
	b: SantuarioBalance,
): { x: number; y: number; ancho: number; alto: number } {
	const def = b.edificios.find((d) => d.id === e.tipo);
	return {
		x: e.x,
		y: e.y,
		ancho: def?.tamano.w ?? 1,
		alto: def?.tamano.h ?? 1,
	};
}

/** Variante visual (0 a 3) de una loseta: fija por posición para que no parpadee al repintar. */
export const varianteDeLoseta = (x: number, y: number): number =>
	(Math.imul(x, 31) + Math.imul(y, 17) + ((x * y) >> 1)) & 3;

/** ¿Hay un obstáculo en el rectángulo (en píxeles)? Fuera de la isla cuenta como obstáculo. */
export function bloqueado(
	e: EstadoSantuario,
	b: SantuarioBalance,
	px: number,
	py: number,
	w: number,
	h: number,
): boolean {
	const { ancho, alto, losetas } = e.terreno;
	if (px < 0 || py < 0 || px + w > ancho * LADO || py + h > alto * LADO)
		return true;
	const x0 = Math.floor(px / LADO);
	const x1 = Math.floor((px + w - 1) / LADO);
	const y0 = Math.floor(py / LADO);
	const y1 = Math.floor((py + h - 1) / LADO);
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const l = losetas[y * ancho + x];
			if (l === undefined || BLOQUEAN.has(l.tipo)) return true;
			if (l.objeto !== undefined && !SE_PISAN.has(l.objeto)) return true;
			for (const ed of e.edificios) {
				const r = rectanguloDeEdificio(ed, b);
				if (x >= r.x && x < r.x + r.ancho && y >= r.y && y < r.y + r.alto)
					return true;
			}
		}
	}
	return false;
}

/** Edificio de un tipo más cercano al punto (en píxeles) y su distancia a su centro. */
export function edificioCercano(
	e: EstadoSantuario,
	b: SantuarioBalance,
	tipo: string,
	px: number,
	py: number,
): { edificio: Edificio; distancia: number } | undefined {
	let mejor: { edificio: Edificio; distancia: number } | undefined;
	for (const ed of e.edificios) {
		if (ed.tipo !== tipo) continue;
		const r = rectanguloDeEdificio(ed, b);
		const distancia = Math.hypot(
			px - (r.x + r.ancho / 2) * LADO,
			py - (r.y + r.alto / 2) * LADO,
		);
		if (!mejor || distancia < mejor.distancia)
			mejor = { edificio: ed, distancia };
	}
	return mejor;
}
