import { describe, expect, it } from "vitest";
import {
	crearSantuario,
	type Loseta,
	type SantuarioBalance,
	type TipoLoseta,
} from "./estado.js";
import { esAreaUtil, terrenoInicial } from "./terreno.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

/** Balance real del pack; la prueba de datos comprueba que cumple el esquema. */
const BALANCE = JSON.parse(
	readFileSync(
		new URL("../../../../packs/kanto/santuario.json", import.meta.url),
		"utf8",
	),
) as SantuarioBalance;

/** Balance nuevo e independiente para cada prueba. */
const balance = (): SantuarioBalance => structuredClone(BALANCE);

/** Congela en profundidad para detectar mutaciones. */
function congelar<T>(valor: T): T {
	if (valor === null || typeof valor !== "object") return valor;
	Object.freeze(valor);
	for (const hijo of Object.values(valor as Record<string, unknown>)) {
		congelar(hijo);
	}
	return valor;
}

/** Loseta mínima para las pruebas de área útil. */
const loseta = (tipo: TipoLoseta): Loseta => ({
	tipo,
	edad: 0,
	humedad: false,
	encendido: false,
});

describe("crearSantuario", () => {
	it("es determinista: la misma semilla da el mismo estado", () => {
		expect(crearSantuario("s1", balance())).toEqual(
			crearSantuario("s1", balance()),
		);
	});

	it("arranca en la jornada 1, al alba, con Armonía 50 y sin residentes", () => {
		const e = crearSantuario("s1", balance());
		expect(e.semilla).toBe("s1");
		expect(e.jornada).toBe(1);
		expect(e.momento).toBe("alba");
		expect(e.armonia).toBe(50);
		expect(e.residentes).toEqual([]);
		expect(e.temaCharla).toBeUndefined();
		expect(e.accionesMarcadas).toEqual([]);
		expect(e.habitatsCompletos).toEqual([]);
		expect(e.habitatsDescubiertos).toEqual([]);
		expect(e.habitatsPendientes).toEqual([]);
	});

	it("copia los recursos iniciales del balance", () => {
		const e = crearSantuario("s1", balance());
		expect(e.recursos).toEqual(BALANCE.recursosIniciales);
	});

	it("coloca el Árbol Cenit terminado en el centro de la isla", () => {
		const e = crearSantuario("s1", balance());
		const arbol = BALANCE.edificios.find((ed) => ed.id === "arbol-cenit");
		if (!arbol) throw new Error("el pack no trae el Árbol Cenit");
		expect(e.edificios).toHaveLength(1);
		const unico = e.edificios[0];
		if (!unico) throw new Error("no se creó ningún edificio");
		expect(unico).toMatchObject({
			uid: "ed1",
			tipo: "arbol-cenit",
			nivel: 1,
			obraRestante: 0,
			resto: {},
		});
		expect(unico.variedad).toBeUndefined();
		// Márgenes izquierdo/derecho y superior/inferior a lo sumo a una loseta.
		expect(
			Math.abs(unico.x - (BALANCE.isla.ancho - arbol.tamano.w - unico.x)),
		).toBeLessThanOrEqual(1);
		expect(
			Math.abs(unico.y - (BALANCE.isla.alto - arbol.tamano.h - unico.y)),
		).toBeLessThanOrEqual(1);
		expect(e.siguienteUid).toBe(2);
	});

	it("crea la isla rota de terrenoInicial", () => {
		const b = balance();
		const e = crearSantuario("s1", b);
		const total = BALANCE.isla.ancho * BALANCE.isla.alto;
		expect(e.terreno).toMatchObject({
			ancho: BALANCE.isla.ancho,
			alto: BALANCE.isla.alto,
		});
		expect(e.terreno.losetas).toHaveLength(total);
		expect(e.terreno).toEqual(terrenoInicial("s1", b));
		for (const l of e.terreno.losetas) {
			expect(l.objeto).toBeUndefined();
			expect(l.humedad).toBe(false);
			expect(l.encendido).toBe(false);
		}
	});

	it("no comparte losetas entre sí", () => {
		const e = crearSantuario("s1", balance());
		const primera = e.terreno.losetas[0];
		const segunda = e.terreno.losetas[1];
		if (!primera || !segunda) throw new Error("faltan losetas");
		expect(primera).not.toBe(segunda);
		const antes = segunda.tipo;
		primera.tipo = "arena";
		expect(segunda.tipo).toBe(antes);
	});

	it("se puede congelar la entrada y el resultado sin lanzar", () => {
		const congelado = congelar(balance());
		const e = congelar(crearSantuario("s1", congelado));
		expect(e.edificios).toHaveLength(1);
	});

	it("no comparte referencias con el balance", () => {
		const original = balance();
		const e = crearSantuario("s1", original);
		e.recursos.madera = 999;
		e.edificios.length = 0;
		expect(original.recursosIniciales.madera).toBe(10);
		expect(original.edificios).toHaveLength(9);
	});

	it("lanza si el balance no trae el Árbol Cenit", () => {
		const sinArbol = balance();
		sinArbol.edificios = sinArbol.edificios.filter(
			(ed) => ed.id !== "arbol-cenit",
		);
		expect(() => crearSantuario("s1", sinArbol)).toThrow(RangeError);
	});
});

describe("esAreaUtil", () => {
	it("solo descarta yerma y roca", () => {
		const utiles: TipoLoseta[] = [
			"tierra",
			"pradera",
			"hierba-alta",
			"agua",
			"arena",
			"camino",
		];
		for (const tipo of utiles) expect(esAreaUtil(loseta(tipo))).toBe(true);
		expect(esAreaUtil(loseta("yerma"))).toBe(false);
		expect(esAreaUtil(loseta("roca"))).toBe(false);
	});
});
