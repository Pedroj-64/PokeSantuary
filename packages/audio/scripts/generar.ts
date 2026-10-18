import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Genera `datos/audio.json`. No se ejecuta en las pruebas:
 *
 *   pnpm exec tsx packages/audio/scripts/generar.ts
 *
 * Escalas de los temas, todas naturales:
 * - `mapa`: La menor (A B C D E F G), 16 compases a 100 bpm.
 * - `combate`: Mi menor (E F# G A B C D), 16 compases a 150 bpm.
 * - `victoria`: Do mayor (C D E F G A B), 8 compases a 132 bpm.
 */

type Nota = { t: number; d: number; n: number; v: number };
type Pista = {
	canal: "pulso1" | "pulso2" | "onda" | "ruido";
	ciclo?: number;
	onda?: number[];
	ruidoCorto?: boolean;
	notas: Nota[];
};
type Cancion = {
	id: string;
	nombre: string;
	bpm: number;
	pasosPorNegra: number;
	pasos: number;
	repetir: boolean;
	pistas: Pista[];
};
type Efecto = {
	id: string;
	canal: "pulso1" | "pulso2" | "ruido";
	ciclo?: number;
	duracionMs: number;
	volumen: number;
	frecInicial: number;
	deslizamiento: number;
	vibrato?: { hz: number; profundidad: number };
	envolvente: { ataqueMs: number; decaimientoMs: number };
};

const MENOR = [0, 2, 3, 5, 7, 8, 10];
const MAYOR = [0, 2, 4, 5, 7, 9, 11];
const COMPAS = 16;

const nota = (t: number, d: number, n: number, v: number): Nota => ({
	t,
	d,
	n,
	v,
});

/**
 * Nota MIDI de un grado de la escala (0 = tónica), moviéndola de octava hasta
 * caer en [min, max].
 */
function grado(
	tonica: number,
	escala: number[],
	g: number,
	min: number,
	max: number,
): number {
	const octava = Math.floor(g / 7);
	const i = ((g % 7) + 7) % 7;
	let n = tonica + 12 * octava + (escala[i] ?? 0);
	while (n < min) n += 12;
	while (n > max) n -= 12;
	return n;
}

/** Onda triangular de 32 muestras de 0 a 15 para el canal onda. */
const TRIANGULO = Array.from({ length: 32 }, (_, i) =>
	Math.round(((i < 16 ? i : 31 - i) * 15) / 15),
);

/** Progresión de acordes de `mapa`, en grados de La menor. */
const ACORDES_MAPA = [0, 5, 2, 6, 0, 3, 4, 0, 0, 5, 2, 6, 3, 4, 0, 0];

/** Figuras melódicas de `mapa`, en grados relativos al acorde del compás. */
const FIGURAS_MAPA = [
	[0, 2, 4, 2, 3, 4, 2, 0],
	[4, 2, 0, 2, 4, 5, 4, 2],
	[2, 4, 5, 4, 2, 0, 2, 4],
	[0, 4, 2, 0, 3, 2, 0, 0],
];

function cancionMapa(): Cancion {
	const melodia: Nota[] = [];
	const armonia: Nota[] = [];
	const bajo: Nota[] = [];
	const percusion: Nota[] = [];
	ACORDES_MAPA.forEach((g, compas) => {
		const t = compas * COMPAS;
		if (compas % 8 === 7) {
			melodia.push(
				nota(t, 8, grado(57, MENOR, 0, 57, 81), 13),
				nota(t + 8, 8, grado(57, MENOR, 4, 57, 81), 12),
			);
		} else {
			const figura = FIGURAS_MAPA[compas % FIGURAS_MAPA.length] ?? [];
			figura.forEach((rel, i) => {
				melodia.push(nota(t + i * 2, 2, grado(57, MENOR, g + rel, 57, 81), 13));
			});
		}
		armonia.push(
			nota(t, 8, grado(57, MENOR, g + 2, 53, 69), 6),
			nota(t + 8, 8, grado(57, MENOR, g + 4, 53, 69), 6),
		);
		bajo.push(
			nota(t, 8, grado(45, MENOR, g, 28, 55), 12),
			nota(t + 8, 8, grado(45, MENOR, g + 4, 28, 55), 11),
		);
		for (const paso of [4, 12]) {
			percusion.push(nota(t + paso, 1, 96, 3));
		}
	});
	return {
		id: "mapa",
		nombre: "audio.mapa.nombre",
		bpm: 100,
		pasosPorNegra: 4,
		pasos: ACORDES_MAPA.length * COMPAS,
		repetir: true,
		pistas: [
			{ canal: "pulso1", ciclo: 50, notas: melodia },
			{ canal: "pulso2", ciclo: 25, notas: armonia },
			{ canal: "onda", onda: TRIANGULO, notas: bajo },
			{ canal: "ruido", ruidoCorto: true, notas: percusion },
		],
	};
}

/** Progresión de acordes de `combate`, en grados de Mi menor. */
const ACORDES_COMBATE = [0, 0, 5, 6, 0, 5, 4, 4, 0, 0, 5, 6, 3, 4, 0, 0];

/** Riff de `combate` en dieciseisavos; `null` deja un silencio. */
const RIFF_COMBATE: Array<number | null> = [
	0,
	2,
	4,
	2,
	3,
	null,
	4,
	5,
	4,
	2,
	0,
	null,
	2,
	4,
	2,
	0,
];

/** Golpes de armonía de `combate`, a contratiempo. */
const GOLPES_COMBATE = [2, 6, 10, 14];

function cancionCombate(): Cancion {
	const melodia: Nota[] = [];
	const armonia: Nota[] = [];
	const bajo: Nota[] = [];
	const percusion: Nota[] = [];
	ACORDES_COMBATE.forEach((g, compas) => {
		const t = compas * COMPAS;
		if (compas % 8 === 7) {
			melodia.push(
				nota(t, 4, grado(64, MENOR, g, 55, 88), 13),
				nota(t + 4, 4, grado(64, MENOR, g + 4, 55, 88), 12),
				nota(t + 8, 8, grado(64, MENOR, g, 55, 88), 13),
			);
		} else {
			RIFF_COMBATE.forEach((rel, i) => {
				if (rel === null) return;
				melodia.push(nota(t + i, 1, grado(64, MENOR, g + rel, 55, 88), 12));
			});
		}
		for (const paso of GOLPES_COMBATE) {
			armonia.push(nota(t + paso, 1, grado(64, MENOR, g + 2, 55, 76), 8));
		}
		const bajo8 = [g, g, g + 4, g, g + 4, g, g, g + 4];
		bajo8.forEach((rel, i) => {
			bajo.push(nota(t + i * 2, 2, grado(40, MENOR, rel, 28, 55), 14));
		});
		for (const paso of [4, 12]) {
			percusion.push(nota(t + paso, 2, 72, 12));
		}
		if (compas % 4 === 3) {
			percusion.push(nota(t + 14, 1, 80, 8), nota(t + 15, 1, 84, 10));
		}
	});
	return {
		id: "combate",
		nombre: "audio.combate.nombre",
		bpm: 150,
		pasosPorNegra: 4,
		pasos: ACORDES_COMBATE.length * COMPAS,
		repetir: true,
		pistas: [
			{ canal: "pulso1", ciclo: 25, notas: melodia },
			{ canal: "pulso2", ciclo: 12.5, notas: armonia },
			{ canal: "onda", onda: TRIANGULO, notas: bajo },
			{ canal: "ruido", notas: percusion },
		],
	};
}

/** Melodía de `victoria`: [paso, duración, MIDI]. */
const MELODIA_VICTORIA: Array<[number, number, number]> = [
	[0, 4, 72],
	[4, 4, 76],
	[8, 8, 79],
	[16, 8, 84],
	[24, 4, 79],
	[28, 4, 76],
	[32, 4, 77],
	[36, 4, 81],
	[40, 8, 84],
	[48, 8, 83],
	[56, 8, 79],
	[64, 4, 76],
	[68, 4, 79],
	[72, 8, 84],
	[80, 8, 86],
	[88, 4, 84],
	[92, 4, 79],
	[96, 4, 81],
	[100, 4, 84],
	[104, 8, 88],
	[112, 16, 84],
];

/** Acordes de `victoria`, en grados de Do mayor (uno por compás). */
const ACORDES_VICTORIA = [0, 0, 3, 4, 0, 4, 3, 0];

function cancionVictoria(): Cancion {
	const melodia = MELODIA_VICTORIA.map(([t, d, n], i) =>
		nota(t, d, n, i === MELODIA_VICTORIA.length - 1 ? 14 : 13),
	);
	const armonia: Nota[] = [];
	const bajo: Nota[] = [];
	const percusion: Nota[] = [];
	ACORDES_VICTORIA.forEach((g, compas) => {
		const t = compas * COMPAS;
		armonia.push(
			nota(t, 8, grado(60, MAYOR, g + 2, 55, 72), 7),
			nota(t + 8, 8, grado(60, MAYOR, g + 4, 55, 72), 7),
		);
		bajo.push(
			nota(t, 8, grado(36, MAYOR, g, 28, 55), 13),
			nota(t + 8, 8, grado(36, MAYOR, g + 4, 28, 55), 12),
		);
	});
	for (let i = 0; i < 4; i++) {
		percusion.push(nota(i, 1, 100, 6 + i));
	}
	percusion.push(nota(112, 16, 96, 10));
	return {
		id: "victoria",
		nombre: "audio.victoria.nombre",
		bpm: 132,
		pasosPorNegra: 4,
		pasos: 128,
		repetir: false,
		pistas: [
			{ canal: "pulso1", ciclo: 50, notas: melodia },
			{ canal: "pulso2", ciclo: 25, notas: armonia },
			{ canal: "onda", onda: TRIANGULO, notas: bajo },
			{ canal: "ruido", ruidoCorto: true, notas: percusion },
		],
	};
}

const EFECTOS: Efecto[] = [
	{
		id: "menu-mover",
		canal: "pulso1",
		ciclo: 25,
		duracionMs: 50,
		volumen: 7,
		frecInicial: 880,
		deslizamiento: 0,
		envolvente: { ataqueMs: 0, decaimientoMs: 45 },
	},
	{
		id: "menu-aceptar",
		canal: "pulso1",
		ciclo: 50,
		duracionMs: 110,
		volumen: 9,
		frecInicial: 660,
		deslizamiento: 26,
		envolvente: { ataqueMs: 0, decaimientoMs: 100 },
	},
	{
		id: "menu-volver",
		canal: "pulso2",
		ciclo: 25,
		duracionMs: 130,
		volumen: 7,
		frecInicial: 520,
		deslizamiento: -22,
		envolvente: { ataqueMs: 0, decaimientoMs: 120 },
	},
	{
		id: "golpe",
		canal: "ruido",
		duracionMs: 70,
		volumen: 12,
		frecInicial: 900,
		deslizamiento: -30,
		envolvente: { ataqueMs: 0, decaimientoMs: 60 },
	},
	{
		id: "golpe-fuerte",
		canal: "ruido",
		duracionMs: 220,
		volumen: 15,
		frecInicial: 420,
		deslizamiento: -25,
		envolvente: { ataqueMs: 0, decaimientoMs: 200 },
	},
	{
		id: "captura-exito",
		canal: "pulso1",
		ciclo: 12.5,
		duracionMs: 450,
		volumen: 10,
		frecInicial: 440,
		deslizamiento: 44,
		envolvente: { ataqueMs: 0, decaimientoMs: 420 },
	},
	{
		id: "captura-fallo",
		canal: "pulso2",
		ciclo: 75,
		duracionMs: 400,
		volumen: 8,
		frecInicial: 700,
		deslizamiento: -40,
		envolvente: { ataqueMs: 0, decaimientoMs: 380 },
	},
	{
		id: "curar",
		canal: "pulso1",
		ciclo: 50,
		duracionMs: 700,
		volumen: 8,
		frecInicial: 300,
		deslizamiento: 22,
		vibrato: { hz: 6, profundidad: 0.5 },
		envolvente: { ataqueMs: 100, decaimientoMs: 550 },
	},
];

const coleccion = {
	canciones: [cancionMapa(), cancionCombate(), cancionVictoria()],
	efectos: EFECTOS,
};

const destino = fileURLToPath(new URL("../datos/audio.json", import.meta.url));
const raiz = fileURLToPath(new URL("../../../", import.meta.url));
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, `${JSON.stringify(coleccion, null, "\t")}\n`);
// El JSON versionado sigue el formato del repositorio (tabuladores, 80 columnas).
execFileSync("pnpm", ["exec", "biome", "check", "--write", destino], {
	cwd: raiz,
	stdio: "ignore",
});
