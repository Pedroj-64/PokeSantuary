import { describe, expect, it } from "vitest";
import { NivelesSchema } from "./niveles.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

/** JSON real del pack, tal cual está en el repositorio. */
const LEIDO: unknown = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/niveles.json", import.meta.url),
		"utf8",
	),
);

/** Forma suelta del JSON para romper una regla a la vez. */
interface Crudo {
	nivel: {
		basePorPiso: number[];
		desplazamiento: Record<string, number>;
		desplazamientoAs: Record<string, number>;
		emboscada: number;
		salvajeExtra: number;
		porRangoFurioso: number;
		[k: string]: unknown;
	};
	subida: {
		porRival: Record<string, number[]>;
		umbralPonerseAlDia: number;
		extraPonerseAlDia: number;
		margenTope: number;
		[k: string]: unknown;
	};
	gimnasio: {
		base: number;
		porNivel: number;
		maximo: number;
		margenInicial: number;
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

/** Copia independiente del JSON del pack. */
const base = (): Crudo => structuredClone(LEIDO) as Crudo;

/** Valida una copia del JSON con una mutación aplicada. */
const roto = (romper: (crudo: Crudo) => void): boolean => {
	const crudo = base();
	romper(crudo);
	return NivelesSchema.safeParse(crudo).success;
};

describe("NivelesSchema", () => {
	it("acepta el JSON real de packs/kanto/niveles.json", () => {
		const resultado = NivelesSchema.safeParse(LEIDO);
		expect(resultado.success ? [] : resultado.error.issues).toEqual([]);
	});

	it("fija los valores del GDD §7.2", () => {
		const niveles = NivelesSchema.parse(LEIDO);
		expect(
			(niveles.nivel.basePorPiso[0] ?? 0) + niveles.nivel.desplazamiento.alfa,
		).toBe(13);
		expect(
			(niveles.nivel.basePorPiso[1] ?? 0) +
				(niveles.nivel.desplazamientoAs.ecoComun ?? 0),
		).toBe(21);
		expect(niveles.gimnasio.base + niveles.gimnasio.porNivel * 5).toBe(18);
	});

	it("rechaza una clave desconocida en cualquier nivel del objeto", () => {
		expect(roto((c) => (c.extra = 1))).toBe(false);
		expect(roto((c) => (c.nivel.extra = 1))).toBe(false);
		expect(roto((c) => (c.subida.extra = 1))).toBe(false);
		expect(roto((c) => (c.gimnasio.extra = 1))).toBe(false);
		expect(roto((c) => (c.nivel.desplazamiento.extra = 1))).toBe(false);
		expect(roto((c) => (c.subida.porRival.extra = [1, 0]))).toBe(false);
	});

	it("rechaza basePorPiso no creciente o con longitud distinta de 4", () => {
		expect(roto((c) => (c.nivel.basePorPiso = [8, 18, 28, 28]))).toBe(false);
		expect(roto((c) => (c.nivel.basePorPiso = [18, 8, 28, 38]))).toBe(false);
		expect(roto((c) => (c.nivel.basePorPiso = [8, 18, 28]))).toBe(false);
		expect(roto((c) => (c.nivel.basePorPiso = [8, 18, 28, 38, 48]))).toBe(
			false,
		);
	});

	it("rechaza que falte un tipo de rival en desplazamiento", () => {
		expect(roto((c) => delete c.nivel.desplazamiento.heraldo)).toBe(false);
		expect(roto((c) => delete c.nivel.desplazamiento.salvaje)).toBe(false);
	});

	it("rechaza un tipo inventado en porRival y admite heraldo opcional", () => {
		expect(roto((c) => (c.subida.porRival.inventado = [1, 0]))).toBe(false);
		expect(roto((c) => (c.subida.porRival.heraldo = [5, 2]))).toBe(true);
		expect(roto((c) => delete c.subida.porRival.heraldo)).toBe(true);
	});

	it("rechaza desplazamientoAs menor que el desplazamiento normal", () => {
		expect(roto((c) => (c.nivel.desplazamientoAs.ecoComun = 0))).toBe(false);
		expect(roto((c) => (c.nivel.desplazamientoAs.heraldo = 7))).toBe(false);
		expect(roto((c) => (c.nivel.desplazamientoAs.salvaje = 0))).toBe(true);
	});

	it("rechaza banquillo mayor que participantes y tuplas de longitud distinta de 2", () => {
		expect(roto((c) => (c.subida.porRival.alfa = [1, 2]))).toBe(false);
		expect(roto((c) => (c.subida.porRival.alfa = [3]))).toBe(false);
		expect(roto((c) => (c.subida.porRival.alfa = [3, 1, 0]))).toBe(false);
	});

	it("rechaza números negativos o no enteros", () => {
		expect(roto((c) => (c.nivel.emboscada = -1))).toBe(false);
		expect(roto((c) => (c.nivel.desplazamiento.alfa = 5.5))).toBe(false);
		expect(roto((c) => (c.gimnasio.base = 8.5))).toBe(false);
		expect(roto((c) => (c.subida.umbralPonerseAlDia = 0))).toBe(false);
		expect(roto((c) => (c.gimnasio.maximo = 0))).toBe(false);
	});
});
