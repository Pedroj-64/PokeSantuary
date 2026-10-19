import { describe, expect, it } from "vitest";
import { SantuarioBalanceSchema } from "./santuario.js";
import { NATURALEZAS } from "./set.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

/** JSON real del pack, tal cual está en el repositorio. */
const LEIDO: unknown = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/santuario.json", import.meta.url),
		"utf8",
	),
);

/** Forma suelta del JSON para romper una regla a la vez. */
interface EdificioCrudo {
	id: string;
	tamano: { w: number; h: number };
	kit: Record<string, number>;
	obra: number;
	nivelMax: number;
	requiereArbol: number;
	plazas: number[];
	trabajo?: string;
	especialidadesAfines: string[];
	produce?: { recurso: string; base: number };
	[k: string]: unknown;
}

interface DecoracionCruda {
	id: string;
	puntos: number;
	coste: Record<string, number>;
	[k: string]: unknown;
}

interface Crudo {
	isla: { ancho: number; alto: number; zona: number; [k: string]: unknown };
	recursosIniciales: Record<string, number>;
	comida: {
		umbral: number;
		caidaPorJornada: number;
		neutra: { hambre: number; animo: number };
		favorita: { hambre: number; animo: number };
		noGusta: { hambre: number; animo: number };
		sabores: Record<string, { favorito: string; noGusta: string }>;
		[k: string]: unknown;
	};
	animo: Record<string, number>;
	confort: { puntosPorNivel: number; min: number; max: number };
	armonia: Record<string, number>;
	inquietud: Record<string, number>;
	produccion: {
		multNivel: number[];
		tiposMineral: string[];
		[k: string]: unknown;
	};
	capacidadArbol: number[];
	capacidadAlmacen: number[];
	edificios: EdificioCrudo[];
	decoraciones: DecoracionCruda[];
	camino: { costePiedra: number; [k: string]: unknown };
	[k: string]: unknown;
}

/** Copia independiente del pack. */
const base = (): Crudo => structuredClone(LEIDO) as Crudo;

/** Valida una copia del pack con una mutación aplicada. */
const roto = (romper: (crudo: Crudo) => void): boolean => {
	const crudo = base();
	romper(crudo);
	return SantuarioBalanceSchema.safeParse(crudo).success;
};

/** Edificio del pack; falla la prueba si no existe. */
const edificio = (crudo: Crudo, id: string): EdificioCrudo => {
	const encontrado = crudo.edificios.find((e) => e.id === id);
	if (!encontrado) throw new Error(`el pack no trae el edificio ${id}`);
	return encontrado;
};

/** Decoración del pack; falla la prueba si no existe. */
const decoracion = (crudo: Crudo, id: string): DecoracionCruda => {
	const encontrada = crudo.decoraciones.find((d) => d.id === id);
	if (!encontrada) throw new Error(`el pack no trae la decoración ${id}`);
	return encontrada;
};

/** Preferencia de sabor de una naturaleza; falla la prueba si no existe. */
const sabor = (
	crudo: Crudo,
	naturaleza: string,
): { favorito: string; noGusta: string } => {
	const encontrado = crudo.comida.sabores[naturaleza];
	if (!encontrado)
		throw new Error(`el pack no trae la naturaleza ${naturaleza}`);
	return encontrado;
};

describe("SantuarioBalanceSchema", () => {
	it("acepta el JSON real del pack", () => {
		const resultado = SantuarioBalanceSchema.safeParse(LEIDO);
		expect(resultado.success ? [] : resultado.error.issues).toEqual([]);
	});

	it("el pack trae la isla, los recursos y las capacidades de diseño", () => {
		const datos = SantuarioBalanceSchema.parse(LEIDO);
		expect(datos.isla).toEqual({ ancho: 40, alto: 30, zona: 10 });
		expect(datos.recursosIniciales).toEqual({
			pokedolares: 0,
			madera: 10,
			piedra: 6,
			mineral: 0,
			fragmentos: 0,
			recuerdos: 0,
			"baya:neutro": 20,
		});
		expect(datos.capacidadArbol).toEqual([6, 10, 15, 22, 30]);
		expect(datos.capacidadAlmacen).toEqual([50, 100, 200]);
		expect(datos.camino).toEqual({ costePiedra: 1 });
	});

	it("el pack trae la comida y los 25 sabores de naturaleza", () => {
		const datos = SantuarioBalanceSchema.parse(LEIDO);
		expect(datos.comida.umbral).toBe(70);
		expect(datos.comida.caidaPorJornada).toBe(25);
		expect(datos.comida.neutra).toEqual({ hambre: 25, animo: 0 });
		expect(datos.comida.favorita).toEqual({ hambre: 35, animo: 5 });
		expect(datos.comida.noGusta).toEqual({ hambre: 15, animo: -5 });
		expect(Object.keys(datos.comida.sabores)).toHaveLength(25);
		expect(datos.comida.sabores.Hardy).toEqual({
			favorito: "neutro",
			noGusta: "neutro",
		});
		expect(datos.comida.sabores.Adamant).toEqual({
			favorito: "picante",
			noGusta: "seco",
		});
		expect(datos.comida.sabores.Calm).toEqual({
			favorito: "amargo",
			noGusta: "picante",
		});
	});

	it("el pack trae los siete edificios del GDD con sus cifras", () => {
		const datos = SantuarioBalanceSchema.parse(LEIDO);
		expect(datos.edificios.map((e) => e.id)).toEqual([
			"arbol-cenit",
			"lecho-hojas",
			"lecho-paja",
			"huerto-bayas",
			"almacen",
			"aserradero",
			"cantera",
		]);

		const arbol = datos.edificios.find((e) => e.id === "arbol-cenit");
		expect(arbol).toMatchObject({
			tamano: { w: 3, h: 3 },
			kit: {},
			obra: 0,
			nivelMax: 5,
			requiereArbol: 0,
			plazas: [],
		});

		expect(datos.edificios.find((e) => e.id === "lecho-hojas")).toMatchObject({
			tamano: { w: 1, h: 1 },
			kit: { madera: 2 },
			obra: 2,
			nivelMax: 1,
			requiereArbol: 1,
		});
		expect(datos.edificios.find((e) => e.id === "lecho-paja")).toMatchObject({
			tamano: { w: 1, h: 1 },
			kit: { madera: 2, piedra: 1 },
			obra: 3,
			nivelMax: 1,
			requiereArbol: 2,
		});

		expect(datos.edificios.find((e) => e.id === "huerto-bayas")).toMatchObject({
			tamano: { w: 2, h: 2 },
			kit: { madera: 6, piedra: 4 },
			obra: 6,
			nivelMax: 3,
			requiereArbol: 1,
			plazas: [2, 3, 4],
			trabajo: "cultivar",
			especialidadesAfines: ["crecer", "regar"],
			produce: { recurso: "baya", base: 3 },
		});
		expect(datos.edificios.find((e) => e.id === "aserradero")).toMatchObject({
			tamano: { w: 2, h: 2 },
			kit: { madera: 4, piedra: 6 },
			obra: 6,
			nivelMax: 3,
			plazas: [2, 3, 3],
			trabajo: "aserrar",
			especialidadesAfines: ["cortar"],
			produce: { recurso: "madera", base: 2 },
		});
		expect(datos.edificios.find((e) => e.id === "cantera")).toMatchObject({
			tamano: { w: 2, h: 2 },
			kit: { madera: 8, piedra: 2 },
			obra: 6,
			nivelMax: 3,
			plazas: [2, 3, 3],
			trabajo: "minar",
			especialidadesAfines: ["romper"],
			produce: { recurso: "piedra", base: 2 },
		});
		expect(datos.edificios.find((e) => e.id === "almacen")).toMatchObject({
			tamano: { w: 2, h: 2 },
			kit: { madera: 8, piedra: 6 },
			obra: 6,
			nivelMax: 3,
			requiereArbol: 1,
			plazas: [],
		});
	});

	it("el pack trae las ocho decoraciones con puntos y costes de 1 a 10", () => {
		const datos = SantuarioBalanceSchema.parse(LEIDO);
		expect(datos.decoraciones).toEqual([
			{ id: "banco", puntos: 1, coste: { madera: 2 } },
			{ id: "macetero", puntos: 1, coste: { piedra: 2 } },
			{ id: "valla-de-madera", puntos: 1, coste: { madera: 1 } },
			{ id: "cartel", puntos: 1, coste: { madera: 1 } },
			{ id: "farol", puntos: 1, coste: { madera: 1, piedra: 1 } },
			{ id: "fogata", puntos: 2, coste: { madera: 3, piedra: 1 } },
			{ id: "estatua-unown", puntos: 3, coste: { piedra: 6 } },
			{ id: "piedra-luna", puntos: 3, coste: { piedra: 8 } },
		]);
		for (const d of datos.decoraciones) {
			for (const cantidad of Object.values(d.coste)) {
				expect(cantidad).toBeGreaterThanOrEqual(1);
				expect(cantidad).toBeLessThanOrEqual(10);
			}
		}
	});

	it("el pack trae los pesos de Ánimo, Armonía, Inquietud y Producción", () => {
		const datos = SantuarioBalanceSchema.parse(LEIDO);
		expect(datos.animo).toEqual({
			inicial: 60,
			preferido: 10,
			noPreferido: -5,
			confortBase: 2,
			confortFactor: 5,
			hambreBaja: -15,
			hambreBajaUmbral: 30,
			peticion: 20,
			temaAnimo: 10,
			sinLecho: -10,
			agotado: -5,
			sombrioSuelto: -5,
			hablo: 3,
			animar: 5,
		});
		expect(datos.armonia).toEqual({
			pesoAnimo: 0.6,
			pesoConfort: 0.4,
			factorConfort: 20,
			umbralAlto: 70,
			umbralMuyAlto: 90,
			umbralBajo: 30,
			multProduccionAlta: 1.2,
		});
		expect(datos.inquietud).toEqual({
			animoUmbral: 25,
			jornadasAviso: 3,
			jornadasSalida: 4,
			multProduccion: 0.5,
		});
		expect(datos.produccion).toEqual({
			multNivel: [1, 1.5, 2],
			multPreferido: 1.5,
			animoBase: 0.5,
			multEspecialidad: 1.25,
			multCharlaTrabajo: 1.25,
			obraBasePorConstructor: 2,
			obraPorNivelEspecialidad: 1,
			obraCharlaRaices: 2,
			mineralProbabilidad: 0.2,
			tiposMineral: ["rock", "ground", "steel"],
		});
		expect(datos.confort).toEqual({ puntosPorNivel: 4, min: 1, max: 5 });
	});

	it("rechaza un id de edificio repetido", () => {
		expect(
			roto((crudo) => {
				const cantera = edificio(crudo, "cantera");
				cantera.id = "aserradero";
			}),
		).toBe(false);
	});

	it("rechaza una capacidad que no crece estrictamente", () => {
		expect(
			roto((crudo) => {
				crudo.capacidadArbol = [6, 10, 10, 22, 30];
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.capacidadAlmacen = [100, 50, 200];
			}),
		).toBe(false);
	});

	it("rechaza una capacidad con menos entradas que niveles del edificio", () => {
		expect(
			roto((crudo) => {
				crudo.capacidadArbol = [6, 10, 15, 22];
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.capacidadAlmacen = [50, 100];
			}),
		).toBe(false);
	});

	it("rechaza un número negativo donde no tiene sentido", () => {
		expect(
			roto((crudo) => {
				crudo.recursosIniciales.madera = -1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				edificio(crudo, "aserradero").obra = -1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				decoracion(crudo, "banco").coste.madera = -1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.camino.costePiedra = 0;
			}),
		).toBe(false);
	});

	it("rechaza una clave desconocida en cualquier nivel", () => {
		expect(
			roto((crudo) => {
				crudo.inventario = {};
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.isla.profundidad = 3;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				edificio(crudo, "cantera").extra = 1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				decoracion(crudo, "banco").extra = 1;
			}),
		).toBe(false);
	});

	it("rechaza que falte una naturaleza o que sobre una inventada", () => {
		expect(
			roto((crudo) => {
				delete crudo.comida.sabores.Adamant;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				delete crudo.comida.sabores.Quirky;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.comida.sabores.Legendaria = {
					favorito: "neutro",
					noGusta: "neutro",
				};
			}),
		).toBe(false);
	});

	it("rechaza un sabor que no existe", () => {
		expect(
			roto((crudo) => {
				sabor(crudo, "Hardy").favorito = "umami";
			}),
		).toBe(false);
	});

	it("rechaza más plazas que niveles o un multiplicador de nivel corto", () => {
		expect(
			roto((crudo) => {
				edificio(crudo, "lecho-hojas").plazas = [1, 1];
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.produccion.multNivel = [1, 1.5];
			}),
		).toBe(false);
	});

	it("rechaza una decoración con puntos fuera de 1 a 3 o coste fuera de 1 a 10", () => {
		expect(
			roto((crudo) => {
				decoracion(crudo, "banco").puntos = 4;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				decoracion(crudo, "banco").coste.madera = 0;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				decoracion(crudo, "banco").coste.madera = 11;
			}),
		).toBe(false);
	});

	it("rechaza dos decoraciones con el mismo id", () => {
		expect(
			roto((crudo) => {
				decoracion(crudo, "cartel").id = "banco";
			}),
		).toBe(false);
	});

	it("rechaza una isla que no se reparte en 12 zonas de 10 x 10", () => {
		expect(
			roto((crudo) => {
				crudo.isla.ancho = 30;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.isla.zona = 0;
			}),
		).toBe(false);
	});

	it("exporta las 25 naturalezas con las cinco neutras", () => {
		expect(NATURALEZAS).toHaveLength(25);
		expect(new Set(NATURALEZAS).size).toBe(25);
		for (const neutra of ["Hardy", "Docile", "Serious", "Bashful", "Quirky"])
			expect(NATURALEZAS).toContain(neutra);
	});
});
