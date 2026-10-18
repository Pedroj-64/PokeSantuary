import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Efecto } from "../src/index.js";

/**
 * Genera `datos/efectos.json`. No se ejecuta en las pruebas; el JSON es lo que
 * se versiona:
 *
 *   pnpm exec tsx packages/audio/scripts/generar-efectos.ts
 *
 * El catálogo cubre los ids que busca el juego: 18 tipos de movimiento,
 * impactos y resultados, captura, interfaz, estados de combate y expedición.
 * Todos los sonidos son originales y están pensados para el motor v2: pulsos
 * estrechos, barridos, vibrato, ruido y capas para arpegios y golpes dobles.
 */

interface Capa {
	desdeMs: number;
	efecto: Efecto;
}

interface Opciones {
	ciclo?: 12.5 | 25 | 50 | 75;
	vibrato?: { hz: number; profundidad: number };
	ataqueMs?: number;
	capas?: Capa[];
}

type Canal = "pulso1" | "pulso2" | "ruido";

/** Construye un efecto con la envolvente ajustada a su duración. */
const efecto = (
	canal: Canal,
	id: string,
	duracionMs: number,
	volumen: number,
	frecInicial: number,
	deslizamiento: number,
	opciones: Opciones = {},
): Efecto => {
	const ataqueMs = opciones.ataqueMs ?? 0;
	return {
		id,
		canal,
		...(opciones.ciclo === undefined ? {} : { ciclo: opciones.ciclo }),
		duracionMs,
		volumen,
		frecInicial,
		deslizamiento,
		...(opciones.vibrato === undefined ? {} : { vibrato: opciones.vibrato }),
		envolvente: {
			ataqueMs,
			decaimientoMs: Math.max(0, duracionMs - ataqueMs),
		},
		...(opciones.capas === undefined ? {} : { capas: opciones.capas }),
	};
};

const p1 = (
	id: string,
	duracionMs: number,
	volumen: number,
	frecInicial: number,
	deslizamiento: number,
	opciones: Opciones = {},
) =>
	efecto(
		"pulso1",
		id,
		duracionMs,
		volumen,
		frecInicial,
		deslizamiento,
		opciones,
	);
const p2 = (
	id: string,
	duracionMs: number,
	volumen: number,
	frecInicial: number,
	deslizamiento: number,
	opciones: Opciones = {},
) =>
	efecto(
		"pulso2",
		id,
		duracionMs,
		volumen,
		frecInicial,
		deslizamiento,
		opciones,
	);
const n = (
	id: string,
	duracionMs: number,
	volumen: number,
	frecInicial: number,
	deslizamiento: number,
	opciones: Opciones = {},
) =>
	efecto(
		"ruido",
		id,
		duracionMs,
		volumen,
		frecInicial,
		deslizamiento,
		opciones,
	);

const capa = (desdeMs: number, efecto: Efecto): Capa => ({ desdeMs, efecto });
const vib = (hz: number, profundidad: number) => ({ hz, profundidad });

const EFECTOS: Efecto[] = [
	// --- 18 tipos de movimiento -------------------------------------------------
	p1("mov-normal", 300, 11, 330, 6, {
		capas: [
			capa(20, n("mov-normal-golpe", 120, 8, 900, -20)),
			capa(0, p2("mov-normal-cuerpo", 220, 5, 165, 3)),
		],
	}),
	p1("mov-fire", 450, 12, 150, 18, {
		capas: [
			capa(0, n("mov-fire-ruido", 440, 11, 600, 30)),
			capa(90, n("mov-fire-crujido-1", 70, 7, 1400, -10)),
			capa(180, n("mov-fire-crujido-2", 60, 6, 1600, -12)),
			capa(270, n("mov-fire-crujido-3", 55, 5, 1800, -14)),
		],
	}),
	p1("mov-water", 500, 12, 700, -34, {
		vibrato: vib(7, 1.5),
		capas: [
			capa(80, n("mov-water-burbuja", 200, 5, 800, -20)),
			capa(220, p2("mov-water-gota", 240, 7, 520, -24)),
		],
	}),
	p2("mov-grass", 550, 10, 440, 4, {
		vibrato: vib(5, 0.8),
		capas: [
			capa(60, n("mov-grass-hoja-1", 60, 5, 4500, -10)),
			capa(200, n("mov-grass-hoja-2", 50, 4, 4800, -12)),
			capa(300, p1("mov-grass-brote", 200, 6, 523, 2)),
		],
	}),
	p1("mov-electric", 400, 12, 1200, 8, {
		ciclo: 12.5,
		vibrato: vib(18, 3),
		capas: [
			capa(70, n("mov-electric-chispa-1", 25, 6, 5000, 0)),
			capa(150, n("mov-electric-chispa-2", 25, 5, 5200, 0)),
			capa(230, n("mov-electric-chispa-3", 25, 4, 4800, 0)),
		],
	}),
	p1("mov-ice", 500, 9, 1320, 20, {
		ciclo: 12.5,
		capas: [
			capa(90, p2("mov-ice-cristal-2", 160, 8, 1760, 15)),
			capa(180, p1("mov-ice-cristal-3", 150, 7, 2093, 15)),
			capa(270, p2("mov-ice-cristal-4", 190, 6, 2637, 12)),
			capa(360, p1("mov-ice-cristal-5", 200, 5, 3136, 10)),
		],
	}),
	n("mov-fighting", 320, 13, 400, -30, {
		capas: [
			capa(140, n("mov-fighting-segundo", 100, 12, 500, -30)),
			capa(0, p1("mov-fighting-cuerpo", 60, 6, 150, -12)),
		],
	}),
	p2("mov-poison", 580, 10, 500, -30, {
		vibrato: vib(9, 2.5),
		capas: [
			capa(100, n("mov-poison-burbuja", 150, 5, 700, -35)),
			capa(260, p1("mov-poison-eco", 260, 7, 420, -25)),
		],
	}),
	n("mov-ground", 600, 14, 150, -10, {
		capas: [
			capa(0, p1("mov-ground-retumbo", 600, 10, 80, -4)),
			capa(200, n("mov-ground-eco", 300, 8, 90, -3)),
		],
	}),
	n("mov-flying", 350, 9, 3000, 20, {
		capas: [
			capa(0, p1("mov-flying-impulso", 300, 7, 800, 30)),
			capa(100, n("mov-flying-aire", 150, 5, 6000, 15)),
		],
	}),
	p1("mov-psychic", 620, 10, 600, 12, {
		vibrato: vib(3, 4),
		capas: [
			capa(0, p2("mov-psychic-capa", 600, 6, 900, -12, { vibrato: vib(4, 3) })),
			capa(200, n("mov-psychic-zumbido", 400, 3, 1200, 10)),
		],
	}),
	p1("mov-bug", 450, 10, 220, 5, {
		vibrato: vib(16, 1.5),
		capas: [
			capa(0, p2("mov-bug-zumbido", 400, 6, 330, 8, { vibrato: vib(20, 1) })),
			capa(150, n("mov-bug-alas", 150, 4, 2500, 0)),
		],
	}),
	n("mov-rock", 400, 14, 250, -25, {
		capas: [
			capa(120, n("mov-rock-segundo", 90, 12, 200, -20)),
			capa(0, p1("mov-rock-cuerpo", 120, 8, 110, -10)),
		],
	}),
	p1("mov-ghost", 600, 9, 180, -4, {
		vibrato: vib(2, 3),
		capas: [
			capa(0, p2("mov-ghost-sombra", 550, 6, 190, -4, { vibrato: vib(2, 2) })),
			capa(200, p1("mov-ghost-eco", 300, 4, 160, -3)),
			capa(300, n("mov-ghost-aire", 250, 3, 300, 0)),
		],
	}),
	n("mov-dragon", 650, 14, 120, 12, {
		capas: [
			capa(0, p1("mov-dragon-rugido", 620, 10, 90, 8)),
			capa(250, n("mov-dragon-cola", 300, 8, 200, -8)),
		],
	}),
	p1("mov-dark", 600, 9, 110, 0, {
		capas: [
			capa(0, p2("mov-dark-disonancia", 580, 8, 116, 0)),
			capa(250, n("mov-dark-sombra", 350, 5, 200, -6)),
			capa(300, p1("mov-dark-eco", 250, 4, 104, 0)),
		],
	}),
	p1("mov-steel", 380, 10, 880, 6, {
		ciclo: 12.5,
		capas: [
			capa(0, n("mov-steel-golpe", 45, 9, 5200, -15)),
			capa(90, p2("mov-steel-filo", 100, 7, 1100, 10)),
			capa(170, p1("mov-steel-brillo", 120, 5, 1320, 8)),
		],
	}),
	p1("mov-fairy", 550, 8, 1568, 15, {
		ciclo: 25,
		capas: [
			capa(40, p2("mov-fairy-campana-1", 200, 7, 1976, 12)),
			capa(80, p1("mov-fairy-campana-2", 200, 6, 2349, 12)),
			capa(120, p2("mov-fairy-campana-3", 200, 6, 2794, 10)),
			capa(160, p1("mov-fairy-campana-4", 220, 5, 3136, 8)),
			capa(220, n("mov-fairy-brillo", 200, 3, 7000, 0)),
		],
	}),

	// --- impactos y resultados --------------------------------------------------
	n("golpe", 80, 12, 900, -20, {
		capas: [capa(0, p1("golpe-cuerpo", 50, 6, 180, -10))],
	}),
	n("golpe-fuerte", 220, 15, 420, -25, {
		capas: [capa(0, p1("golpe-fuerte-cuerpo", 150, 8, 160, -8))],
	}),
	n("golpe-superefectivo", 240, 15, 700, -30, {
		capas: [
			capa(0, p1("golpe-superefectivo-cuerpo", 180, 9, 220, 0)),
			capa(60, n("golpe-superefectivo-segundo", 120, 10, 1400, -25)),
		],
	}),
	n("golpe-poco-eficaz", 150, 8, 300, -12, {
		capas: [capa(0, p1("golpe-poco-eficaz-cuerpo", 100, 5, 140, -5))],
	}),
	n("golpe-sin-efecto", 110, 6, 180, -5, {
		capas: [capa(0, p2("golpe-sin-efecto-cuerpo", 80, 4, 100, -3))],
	}),
	n("golpe-critico", 360, 10, 1200, -35, {
		capas: [
			capa(50, n("golpe-critico-segundo", 200, 7, 1800, -30)),
			capa(0, p1("golpe-critico-cuerpo", 300, 4, 300, 12)),
			capa(120, p2("golpe-critico-brillo", 180, 3, 600, 8)),
		],
	}),
	p1("golpe-fallo", 300, 9, 500, -30, {
		vibrato: vib(5, 1),
		capas: [capa(0, n("golpe-fallo-aire", 200, 5, 400, -20))],
	}),
	p1("debilitado", 600, 8, 330, -12, {
		vibrato: vib(4, 2),
		capas: [
			capa(0, p2("debilitado-capa", 500, 5, 220, -8)),
			capa(200, n("debilitado-aire", 300, 3, 300, 0)),
		],
	}),
	p1("curar", 700, 8, 523, 15, {
		ataqueMs: 80,
		vibrato: vib(6, 0.5),
		capas: [
			capa(200, p2("curar-capa-2", 400, 6, 659, 12)),
			capa(400, p1("curar-capa-3", 300, 5, 784, 10)),
		],
	}),

	// --- captura ----------------------------------------------------------------
	p1("captura-exito", 1200, 9, 523, 12, {
		ataqueMs: 20,
		capas: [
			capa(100, p2("captura-exito-capa-2", 600, 8, 659, 12)),
			capa(220, p1("captura-exito-capa-3", 600, 8, 784, 12)),
			capa(360, p2("captura-exito-capa-4", 500, 6, 1047, 10)),
			capa(520, p1("captura-exito-capa-5", 500, 5, 1319, 8)),
		],
	}),
	p2("captura-fallo", 500, 8, 700, -35, {
		capas: [
			capa(0, n("captura-fallo-ruido", 300, 5, 500, -20)),
			capa(200, p1("captura-fallo-capa", 250, 5, 400, -20)),
		],
	}),
	n("bola-lanzar", 350, 9, 500, 25, {
		capas: [capa(0, p1("bola-lanzar-impulso", 300, 5, 300, 20))],
	}),
	p1("bola-agitar", 600, 7, 400, 0, {
		vibrato: vib(10, 1),
		capas: [
			capa(0, n("bola-agitar-ruido", 500, 3, 2000, 0)),
			capa(300, p2("bola-agitar-capa", 250, 4, 500, 2)),
		],
	}),
	p1("bola-clic", 60, 7, 1200, 0, {
		ciclo: 12.5,
		capas: [capa(0, n("bola-clic-ruido", 25, 4, 4000, 0))],
	}),

	// --- interfaz ---------------------------------------------------------------
	p1("menu-mover", 50, 5, 880, 0, { ciclo: 25 }),
	p1("menu-aceptar", 110, 6, 660, 20, {
		capas: [capa(40, p2("menu-aceptar-capa", 70, 4, 990, 10))],
	}),
	p2("menu-volver", 120, 5, 520, -18),
	p1("menu-error", 180, 6, 220, 0, {
		vibrato: vib(14, 2),
		capas: [capa(100, p2("menu-error-capa", 80, 4, 233, 0))],
	}),
	p1("comprar", 220, 6, 784, 8, {
		capas: [capa(70, p2("comprar-capa", 150, 5, 1047, 15))],
	}),
	p1("sin-dinero", 160, 5, 300, -10, {
		capas: [capa(70, p2("sin-dinero-capa", 90, 4, 280, -6))],
	}),
	p1("mensaje", 90, 4, 1000, 0, {
		capas: [capa(0, n("mensaje-ruido", 40, 2, 3000, 0))],
	}),

	// --- combate extra ----------------------------------------------------------
	p1("entrada-campo", 700, 9, 440, 10, {
		capas: [
			capa(150, p2("entrada-campo-capa-2", 400, 7, 554, 8)),
			capa(300, p1("entrada-campo-capa-3", 350, 6, 659, 8)),
			capa(450, p2("entrada-campo-capa-4", 250, 5, 880, 5)),
		],
	}),
	p1("cambio-pokemon", 600, 8, 700, -20, {
		capas: [
			capa(150, p2("cambio-pokemon-capa", 350, 6, 500, 15)),
			capa(0, n("cambio-pokemon-flash", 200, 3, 3000, 0)),
		],
	}),
	p1("ps-bajos", 550, 6, 880, 0, {
		vibrato: vib(12, 1.5),
		capas: [capa(200, p2("ps-bajos-capa", 300, 5, 660, 0))],
	}),
	n("estado-quemado", 600, 9, 700, -25, {
		capas: [capa(120, n("estado-quemado-crujido", 200, 6, 1300, -20))],
	}),
	p1("estado-paralizado", 600, 8, 700, 0, {
		vibrato: vib(18, 4),
		capas: [capa(0, n("estado-paralizado-chispa", 120, 4, 5000, 0))],
	}),
	p2("estado-envenenado", 620, 7, 400, -20, {
		vibrato: vib(7, 2),
		capas: [capa(0, n("estado-envenenado-burbuja", 400, 3, 600, -15))],
	}),
	p1("estado-dormido", 700, 6, 220, -3, {
		ataqueMs: 100,
		capas: [capa(0, p2("estado-dormido-capa", 600, 4, 165, -2))],
	}),
	p1("estado-congelado", 600, 7, 1568, 12, {
		ciclo: 12.5,
		capas: [
			capa(0, p2("estado-congelado-capa", 400, 5, 2093, 10)),
			capa(100, n("estado-congelado-brillo", 150, 3, 5000, 0)),
		],
	}),
	p1("estado-confuso", 650, 7, 500, 0, {
		vibrato: vib(5, 5),
		capas: [
			capa(
				0,
				p2("estado-confuso-capa", 620, 5, 540, 0, { vibrato: vib(6, 4) }),
			),
			capa(100, n("estado-confuso-aire", 400, 3, 800, 0)),
		],
	}),
	p1("sube-stat", 450, 8, 523, 18, {
		capas: [
			capa(100, p2("sube-stat-capa-2", 300, 6, 659, 15)),
			capa(200, p1("sube-stat-capa-3", 250, 6, 784, 12)),
			capa(300, p2("sube-stat-capa-4", 150, 5, 1047, 8)),
		],
	}),
	p1("baja-stat", 450, 8, 1047, -18, {
		capas: [
			capa(100, p2("baja-stat-capa-2", 300, 6, 784, -15)),
			capa(200, p1("baja-stat-capa-3", 250, 6, 659, -12)),
			capa(300, p2("baja-stat-capa-4", 150, 5, 523, -8)),
		],
	}),

	// --- expedición -------------------------------------------------------------
	n("paso", 90, 6, 600, -10, {
		capas: [capa(0, p1("paso-cuerpo", 60, 3, 150, 0))],
	}),
	p1("cofre-abrir", 700, 8, 440, 12, {
		capas: [
			capa(200, p2("cofre-abrir-capa-2", 400, 6, 554, 10)),
			capa(350, p1("cofre-abrir-capa-3", 300, 6, 659, 8)),
			capa(500, p2("cofre-abrir-capa-4", 200, 5, 880, 5)),
			capa(0, n("cofre-abrir-madera", 250, 3, 2000, 0)),
		],
	}),
	p1("evento", 400, 7, 880, 6, {
		vibrato: vib(8, 1),
		capas: [
			capa(120, p2("evento-capa-2", 250, 5, 1047, 6)),
			capa(240, p1("evento-capa-3", 160, 4, 1319, 4)),
		],
	}),
	n("alfa-aparece", 700, 12, 180, 10, {
		capas: [
			capa(0, p1("alfa-aparece-rugido", 650, 9, 110, 5)),
			capa(300, p2("alfa-aparece-capa", 350, 7, 165, 8)),
		],
	}),
	p1("sombrio-aparece", 700, 9, 90, -5, {
		vibrato: vib(3, 3),
		capas: [
			capa(0, p2("sombrio-aparece-capa", 650, 7, 95, -4)),
			capa(0, n("sombrio-aparece-aire", 500, 5, 150, 0)),
		],
	}),
	n("jefe-aparece", 900, 14, 120, 8, {
		capas: [
			capa(0, p1("jefe-aparece-retumbo", 850, 10, 80, 4)),
			capa(200, p1("jefe-aparece-capa-2", 600, 7, 110, 3)),
			capa(400, p2("jefe-aparece-capa-3", 450, 6, 130, 2)),
		],
	}),
	p1("runa-obtenida", 700, 8, 1047, 10, {
		capas: [
			capa(100, p2("runa-obtenida-capa-2", 500, 7, 1319, 8)),
			capa(220, p1("runa-obtenida-capa-3", 450, 6, 1568, 8)),
			capa(360, p2("runa-obtenida-capa-4", 300, 5, 2093, 6)),
			capa(500, p1("runa-obtenida-capa-5", 200, 4, 2637, 5)),
		],
	}),
	p1("objeto-obtenido", 500, 8, 784, 12, {
		capas: [
			capa(120, p2("objeto-obtenido-capa-2", 300, 6, 1047, 10)),
			capa(240, p1("objeto-obtenido-capa-3", 250, 5, 1568, 6)),
		],
	}),
];

const destino = fileURLToPath(
	new URL("../datos/efectos.json", import.meta.url),
);
const raiz = fileURLToPath(new URL("../../../", import.meta.url));
writeFileSync(destino, `${JSON.stringify(EFECTOS, null, "\t")}\n`);
execFileSync("pnpm", ["exec", "biome", "check", "--write", destino], {
	cwd: raiz,
	stdio: "ignore",
});
console.log(`efectos: ${EFECTOS.length} escritos en ${destino}`);
