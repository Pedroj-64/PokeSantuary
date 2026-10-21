import { describe, expect, it } from "vitest";
import {
	ESPECIALIDADES,
	EspecialidadesSchema,
	HabitatsSchema,
	SantuarioBalanceSchema,
} from "./santuario.js";
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

/** Catálogo de Especialidades por especie, tal cual está en el repositorio. */
const ESPECIALIDADES_LEIDAS: unknown = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/especialidades.json", import.meta.url),
		"utf8",
	),
);

/** Ids de las especies del pack, en orden. */
const ESPECIES: string[] = (
	JSON.parse(
		readFileSync(
			new URL("../../../packs/kanto/especies.json", import.meta.url),
			"utf8",
		),
	) as { id: string }[]
).map((e) => e.id);

/** Catálogo de hábitats del pack, tal cual está en el repositorio. */
const HABITATS: unknown = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/habitats.json", import.meta.url),
		"utf8",
	),
);

/** Forma suelta de un hábitat crudo para romper una regla a la vez. */
interface HabitatCrudo {
	id: string;
	nombre: string;
	pista: string;
	receta: {
		loseta?: Record<string, number>;
		objetos?: Record<string, number>;
		edificios?: string[];
		[k: string]: unknown;
	};
	momento: string;
	especies: string[];
	raro?: number;
	[k: string]: unknown;
}

/** Copia independiente del catálogo de hábitats. */
const habitatsBase = (): HabitatCrudo[] =>
	structuredClone(HABITATS) as HabitatCrudo[];

/** Valida una copia del catálogo con una mutación aplicada. */
const habitatsRoto = (romper: (crudo: HabitatCrudo[]) => void): boolean => {
	const crudo = habitatsBase();
	romper(crudo);
	return HabitatsSchema.safeParse(crudo).success;
};

/** Hábitat del catálogo crudo; falla la prueba si no existe. */
const habitat = (crudo: HabitatCrudo[], id: string): HabitatCrudo => {
	const encontrado = crudo.find((h) => h.id === id);
	if (!encontrado) throw new Error(`el pack no trae el hábitat ${id}`);
	return encontrado;
};

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

	it("el pack trae los edificios del GDD con sus cifras", () => {
		const datos = SantuarioBalanceSchema.parse(LEIDO);
		expect(datos.edificios.map((e) => e.id)).toEqual([
			"arbol-cenit",
			"lecho-hojas",
			"lecho-paja",
			"huerto-bayas",
			"almacen",
			"aserradero",
			"cantera",
			"gimnasio",
			"altar",
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

	it("exporta las 11 Especialidades activas del Pack 1", () => {
		expect(ESPECIALIDADES).toEqual([
			"cortar",
			"romper",
			"regar",
			"crecer",
			"encender",
			"generar",
			"construir",
			"iluminar",
			"recolectar",
			"animar",
			"volar",
		]);
	});
});

describe("EspecialidadesSchema", () => {
	it("acepta el catálogo real del pack y cubre las diez especies", () => {
		const datos = EspecialidadesSchema.parse(ESPECIALIDADES_LEIDAS);
		expect(Object.keys(datos)).toEqual(ESPECIES);
		for (const lista of Object.values(datos)) {
			expect(lista.length).toBeGreaterThanOrEqual(1);
			expect(lista.length).toBeLessThanOrEqual(2);
		}
	});

	it("rechaza una Especialidad desconocida, tres, ninguna o una repetida", () => {
		const valido = EspecialidadesSchema.parse(ESPECIALIDADES_LEIDAS);
		expect(
			EspecialidadesSchema.safeParse({
				...valido,
				eevee: ["volar", "teletransportar"],
			}).success,
		).toBe(false);
		expect(
			EspecialidadesSchema.safeParse({
				...valido,
				evee: ["volar", "cortar", "regar"],
			}).success,
		).toBe(false);
		expect(
			EspecialidadesSchema.safeParse({ ...valido, eevee: [] }).success,
		).toBe(false);
		expect(
			EspecialidadesSchema.safeParse({ ...valido, eevee: ["volar", "volar"] })
				.success,
		).toBe(false);
	});

	it.todo(
		"cada Especialidad la tienen al menos 3 especies de 2 líneas evolutivas (al llegar a las 63 especies)",
	);
});

describe("HabitatsSchema", () => {
	it("acepta el catálogo real del pack", () => {
		const resultado = HabitatsSchema.safeParse(HABITATS);
		expect(resultado.success ? [] : resultado.error.issues).toEqual([]);
	});

	it("el pack trae los 16 hábitats del GDD §11.7 en orden", () => {
		const datos = HabitatsSchema.parse(HABITATS);
		expect(datos.map((h) => h.id)).toEqual([
			"pradera-alta",
			"orilla",
			"rincon-oscuro",
			"bosquecillo",
			"cantera-viva",
			"pista-de-entrenamiento",
			"claro-lunar",
			"refugio-de-piedra",
			"laboratorio-en-ruinas",
			"matorral-seco",
			"jardin-de-flores",
			"hoguera",
			"rincon-acogedor",
			"rincon-psiquico",
			"estanque-profundo",
			"playa-fria",
		]);
	});

	it("solo Estanque profundo y Playa fría son raros (0,25 por Alba)", () => {
		const datos = HabitatsSchema.parse(HABITATS);
		for (const h of datos) {
			if (h.id === "estanque-profundo" || h.id === "playa-fria") {
				expect(h.raro).toBe(0.25);
			} else {
				expect(h.raro).toBeUndefined();
			}
		}
	});

	it("cada receta cabe en una ventana de 3 x 3 y pide algo", () => {
		const datos = HabitatsSchema.parse(HABITATS);
		for (const h of datos) {
			const losetas = Object.values(h.receta.loseta ?? {}).reduce(
				(a, n) => a + n,
				0,
			);
			const objetos = Object.values(h.receta.objetos ?? {}).reduce(
				(a, n) => a + n,
				0,
			);
			const edificios = (h.receta.edificios ?? []).length;
			expect(losetas + objetos).toBeLessThanOrEqual(9);
			expect(losetas + objetos + edificios).toBeGreaterThan(0);
		}
	});

	it("mapea el Lecho de paja como edificio y las claves de objeto del estado", () => {
		const datos = HabitatsSchema.parse(HABITATS);
		const acogedor = datos.find((h) => h.id === "rincon-acogedor");
		expect(acogedor?.receta.edificios).toEqual(["lecho-paja"]);
		const oscuro = datos.find((h) => h.id === "rincon-oscuro");
		expect(oscuro?.receta.objetos).toEqual({ "farol-apagado": 1 });
	});

	it("no exige que las especies existan en el pack (Oddish y Pidgey)", () => {
		const datos = HabitatsSchema.parse(HABITATS);
		const pradera = datos.find((h) => h.id === "pradera-alta");
		expect(pradera?.especies).toEqual(["oddish", "pidgey"]);
		for (const h of datos) {
			expect(h.especies.length).toBeGreaterThanOrEqual(1);
		}
	});

	it("rechaza un id repetido", () => {
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").id = "pradera-alta";
			}),
		).toBe(false);
	});

	it("rechaza una clave desconocida en cualquier nivel", () => {
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").extra = 1;
			}),
		).toBe(false);
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").receta.extra = 1;
			}),
		).toBe(false);
	});

	it("rechaza un tipo de loseta, un objeto o un momento que no existen", () => {
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").receta.loseta = { lava: 1 };
			}),
		).toBe(false);
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").receta.objetos = { "flor-marchita": 1 };
			}),
		).toBe(false);
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").momento = "tarde";
			}),
		).toBe(false);
	});

	it("rechaza una cantidad cero, un raro fuera de 0..1 o una receta vacía", () => {
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").receta.loseta = { arena: 0 };
			}),
		).toBe(false);
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").raro = 2;
			}),
		).toBe(false);
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").receta = {};
			}),
		).toBe(false);
	});

	it("rechaza una receta que no cabría en 3 x 3", () => {
		expect(
			habitatsRoto((crudo) => {
				habitat(crudo, "orilla").receta = { loseta: { agua: 10 } };
			}),
		).toBe(false);
	});
});

describe("ceremonias del Altar", () => {
	const pack = SantuarioBalanceSchema.parse(LEIDO).ceremonias;

	it("el pack trae las cifras del GDD §11.10", () => {
		expect(pack["festin-bayas"]).toEqual({
			armoniaMin: 30,
			coste: { bayas: 20 },
			espera: 3,
		});
		expect(pack["fogata-ascuas"]).toMatchObject({
			armoniaMin: 40,
			coste: { madera: 10 },
			soloDeNoche: true,
			requiereEspecialidad: "encender",
		});
		expect(pack["bendicion-viajero"].coste).toEqual({
			bayas: 30,
			recuerdos: 1,
		});
		expect(pack.purificacion.coste).toEqual({ fragmentos: 2 });
		for (const c of Object.values(pack)) expect(c.espera).toBe(3);
	});

	it("rechaza una ceremonia con coste cero o sin las cuatro", () => {
		type Crudo = { ceremonias: Record<string, { coste: unknown }> };
		const roto = (cambio: (c: Crudo["ceremonias"]) => void) => {
			const crudo = structuredClone(LEIDO) as Crudo;
			cambio(crudo.ceremonias);
			return SantuarioBalanceSchema.safeParse(crudo).success;
		};
		expect(
			roto((c) => {
				c["festin-bayas"] = { coste: { bayas: 0 } };
			}),
		).toBe(false);
		expect(
			roto((c) => {
				delete c.purificacion;
			}),
		).toBe(false);
	});
});

describe("Gimnasio", () => {
	const pack = SantuarioBalanceSchema.parse(LEIDO).gimnasio;

	it("el pack trae las cifras del GDD §11.5 y de Sable", () => {
		expect(pack).toEqual({
			fragmentos: [2, 3, 4, 5, 6],
			pokedolares: 100,
			maximoSinSable: 3,
			descuentoSable: 0.25,
		});
	});

	it("rechaza un descuento fuera de 0 a 1 o un nivel sin coste", () => {
		const roto = (cambio: (g: Record<string, unknown>) => void) => {
			const crudo = structuredClone(LEIDO) as {
				gimnasio: Record<string, unknown>;
			};
			cambio(crudo.gimnasio);
			return SantuarioBalanceSchema.safeParse(crudo).success;
		};
		expect(
			roto((g) => {
				g.descuentoSable = 1.5;
			}),
		).toBe(false);
		expect(
			roto((g) => {
				g.fragmentos = [2, 0];
			}),
		).toBe(false);
	});
});

describe("Gimnasio y Altar como edificios", () => {
	const edificios = SantuarioBalanceSchema.parse(LEIDO).edificios;

	it("traen las cifras de la tabla de edificios del GDD §11.5", () => {
		expect(edificios.find((e) => e.id === "gimnasio")).toMatchObject({
			kit: { madera: 10, piedra: 15, pokedolares: 150 },
			obra: 12,
			requiereArbol: 2,
		});
		expect(edificios.find((e) => e.id === "altar")).toMatchObject({
			kit: { madera: 15, piedra: 15, fragmentos: 5 },
			obra: 15,
			nivelMax: 3,
			requiereArbol: 3,
		});
	});
});

describe("efectos de las Ramas del Árbol", () => {
	const pack = SantuarioBalanceSchema.parse(LEIDO);

	it("el pack trae un efecto por cada rango de cada rama y las cifras del GDD §12.2", () => {
		for (const [rama, costes] of Object.entries(pack.ramas))
			expect(pack.efectosRamas[rama]).toHaveLength(costes.length);
		expect(pack.efectosRamas.farol?.map((e) => e.llamas)).toEqual([2, 3]);
		expect(
			pack.efectosRamas["equipo-expedicion"]?.map((e) => e.equipoMax),
		).toEqual([4, 5, 6]);
		expect(pack.efectosRamas["ojo-del-coro"]?.[0]?.opcionesRuna).toBe(4);
	});

	it("rechaza una rama sin efectos o con un rango de más o de menos", () => {
		const roto = (
			cambio: (c: { efectosRamas: Record<string, unknown[]> }) => void,
		) => {
			const crudo = structuredClone(LEIDO) as {
				efectosRamas: Record<string, unknown[]>;
			};
			cambio(crudo);
			return SantuarioBalanceSchema.safeParse(crudo).success;
		};
		expect(
			roto((c) => {
				delete c.efectosRamas.farol;
			}),
		).toBe(false);
		expect(
			roto((c) => {
				c.efectosRamas.farol?.push({ llamas: 4 });
			}),
		).toBe(false);
	});
});
