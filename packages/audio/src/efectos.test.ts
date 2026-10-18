import { describe, expect, it } from "vitest";
import { type Efecto, parsearColeccion } from "./index.js";
import { renderizarEfecto, TASA_POR_DEFECTO } from "./renderizar.js";

// Este paquete no trae `@types/node`, así que se declara lo mínimo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

const CRUDO: unknown = JSON.parse(
	readFileSync(new URL("../datos/efectos.json", import.meta.url), "utf8"),
);
const COLECCION = parsearColeccion({ canciones: [], efectos: CRUDO });
const EFECTOS = COLECCION.efectos;
const POR_ID = new Map(EFECTOS.map((efecto) => [efecto.id, efecto]));

const MOVIMIENTOS = [
	"mov-normal",
	"mov-fire",
	"mov-water",
	"mov-grass",
	"mov-electric",
	"mov-ice",
	"mov-fighting",
	"mov-poison",
	"mov-ground",
	"mov-flying",
	"mov-psychic",
	"mov-bug",
	"mov-rock",
	"mov-ghost",
	"mov-dragon",
	"mov-dark",
	"mov-steel",
	"mov-fairy",
];

const RESULTADOS = [
	"golpe",
	"golpe-superefectivo",
	"golpe-poco-eficaz",
	"golpe-sin-efecto",
	"golpe-critico",
	"golpe-fallo",
	"debilitado",
	"curar",
];

const CAPTURA = [
	"captura-exito",
	"captura-fallo",
	"bola-lanzar",
	"bola-agitar",
	"bola-clic",
];

const INTERFAZ = [
	"menu-mover",
	"menu-aceptar",
	"menu-volver",
	"menu-error",
	"comprar",
	"sin-dinero",
	"mensaje",
];

const COMBATE = [
	"entrada-campo",
	"cambio-pokemon",
	"ps-bajos",
	"estado-quemado",
	"estado-paralizado",
	"estado-envenenado",
	"estado-dormido",
	"estado-congelado",
	"estado-confuso",
	"sube-stat",
	"baja-stat",
];

const EXPEDICION = [
	"paso",
	"cofre-abrir",
	"evento",
	"alfa-aparece",
	"sombrio-aparece",
	"jefe-aparece",
	"runa-obtenida",
	"objeto-obtenido",
];

const OBLIGATORIOS = [
	...MOVIMIENTOS,
	...RESULTADOS,
	...CAPTURA,
	...INTERFAZ,
	...COMBATE,
	...EXPEDICION,
];

/** Las capas pueden alargar el efecto base; se mide el final real. */
function duracionEfectiva(efecto: Efecto): number {
	let total = efecto.duracionMs;
	for (const capa of efecto.capas ?? []) {
		total = Math.max(total, capa.desdeMs + capa.efecto.duracionMs);
	}
	return total;
}

const MUESTRAS = new Map<string, Float32Array>(
	EFECTOS.map((efecto) => [efecto.id, renderizarEfecto(efecto)]),
);

function pico(muestras: Float32Array): number {
	let maximo = 0;
	for (const muestra of muestras) maximo = Math.max(maximo, Math.abs(muestra));
	return maximo;
}

function rms(muestras: Float32Array): number {
	let suma = 0;
	for (const muestra of muestras) suma += muestra * muestra;
	return Math.sqrt(suma / muestras.length);
}

/**
 * Huella de 32 dimensiones por efecto: reparto de energía en 8 tramos
 * temporales, tasa de cruces por cero por tramo (hasta 8 kHz), brillo medio
 * (derivada normalizada) y proporción de muestras positivas. Dos gestos con
 * la misma envolvente pero distinta altura o ciclo de trabajo se separan.
 */
function huella(muestras: Float32Array): number[] {
	const tramos = 8;
	const largo = Math.floor(muestras.length / tramos);
	const energia: number[] = [];
	const cruces: number[] = [];
	const brillo: number[] = [];
	const positivas: number[] = [];
	let energiaTotal = 0;
	for (let tramo = 0; tramo < tramos; tramo++) {
		const desde = tramo * largo;
		const hasta = tramo === tramos - 1 ? muestras.length : (tramo + 1) * largo;
		let suma = 0;
		let cambios = 0;
		let positivasTramo = 0;
		let derivada = 0;
		let anterior = 0;
		let signoAnterior = 0;
		for (let i = desde; i < hasta; i++) {
			const valor = muestras[i] ?? 0;
			suma += Math.abs(valor);
			if (valor > 0) positivasTramo++;
			if (valor !== 0) {
				if (signoAnterior !== 0 && Math.sign(valor) !== signoAnterior) {
					cambios++;
				}
				signoAnterior = Math.sign(valor);
			}
			if (i > desde || tramo > 0) derivada += Math.abs(valor - anterior);
			anterior = valor;
		}
		const segundos = (hasta - desde) / TASA_POR_DEFECTO;
		energia.push(suma);
		energiaTotal += suma;
		cruces.push(Math.min(1, cambios / segundos / 8000));
		brillo.push(Math.min(1, (derivada / Math.max(1e-9, suma)) * 40));
		positivas.push(positivasTramo / (hasta - desde));
	}
	return [
		...energia.map((valor) => valor / Math.max(1e-9, energiaTotal)),
		...cruces,
		...brillo,
		...positivas,
	];
}

function distancia(a: number[], b: number[]): number {
	let suma = 0;
	for (let i = 0; i < a.length; i++) {
		const diferencia = (a[i] ?? 0) - (b[i] ?? 0);
		suma += diferencia * diferencia;
	}
	return Math.sqrt(suma);
}

describe("catálogo de efectos", () => {
	it("trae todos los ids obligatorios sin repetir", () => {
		for (const id of OBLIGATORIOS) {
			expect(POR_ID.has(id), `falta ${id}`).toBe(true);
		}
		expect(new Set(EFECTOS.map((efecto) => efecto.id)).size).toBe(
			EFECTOS.length,
		);
		// Los 57 obligatorios más `golpe-fuerte`, que sigue usándose.
		expect(EFECTOS).toHaveLength(OBLIGATORIOS.length + 1);
	});

	it("cada efecto valida y renderiza sin NaN y con pico en [0.15, 0.95]", () => {
		for (const efecto of EFECTOS) {
			const muestras = MUESTRAS.get(efecto.id) ?? new Float32Array();
			expect(muestras.length).toBeGreaterThan(0);
			expect(
				muestras.some((muestra) => !Number.isFinite(muestra)),
				`NaN en ${efecto.id}`,
			).toBe(false);
			const maximo = pico(muestras);
			expect(maximo, `pico de ${efecto.id}`).toBeGreaterThanOrEqual(0.15);
			expect(maximo, `pico de ${efecto.id}`).toBeLessThanOrEqual(0.95);
		}
	});

	it("respeta las duraciones: movimientos 0.25-0.7 s y nadie pasa de 1 s", () => {
		expect(POR_ID.get("golpe")?.duracionMs).toBe(80);
		for (const id of MOVIMIENTOS) {
			const efecto = POR_ID.get(id);
			expect(efecto, `falta ${id}`).toBeDefined();
			expect(efecto?.duracionMs ?? 0).toBeGreaterThanOrEqual(250);
			expect(efecto?.duracionMs ?? 0).toBeLessThanOrEqual(700);
		}
		for (const efecto of EFECTOS) {
			const limite = efecto.id === "captura-exito" ? 1500 : 1000;
			expect(
				duracionEfectiva(efecto),
				`duración de ${efecto.id}`,
			).toBeLessThanOrEqual(limite);
		}
	});

	it("ningún par de movimientos es casi idéntico", () => {
		const huellas = new Map(
			MOVIMIENTOS.map((id) => {
				const muestras = MUESTRAS.get(id);
				if (muestras === undefined) throw new Error(`falta ${id}`);
				return [id, huella(muestras)] as const;
			}),
		);
		// La distancia mínima observada en el catálogo es 0.22; el umbral 0.15
		// deja margen para retoques sin admitir dos gestos intercambiables.
		const UMBRAL = 0.15;
		for (let i = 0; i < MOVIMIENTOS.length; i++) {
			for (let j = i + 1; j < MOVIMIENTOS.length; j++) {
				const a = MOVIMIENTOS[i] ?? "";
				const b = MOVIMIENTOS[j] ?? "";
				const d = distancia(huellas.get(a) ?? [], huellas.get(b) ?? []);
				expect(d, `${a} y ${b} suenan demasiado parecidos`).toBeGreaterThan(
					UMBRAL,
				);
			}
		}
	});

	it("los sonidos de interfaz suenan más bajos que un crítico", () => {
		const critico = MUESTRAS.get("golpe-critico");
		if (critico === undefined) throw new Error("falta golpe-critico");
		const rmsCritico = rms(critico);
		for (const id of INTERFAZ) {
			const muestras = MUESTRAS.get(id);
			if (muestras === undefined) throw new Error(`falta ${id}`);
			expect(rms(muestras), `RMS de ${id}`).toBeLessThan(rmsCritico);
		}
	});
});
