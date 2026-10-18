import { describe, expect, it } from "vitest";
import { ExpedicionBalanceSchema, RangoDineroSchema } from "./expedicion.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

/** JSON real del pack, tal cual está en el repositorio. */
const LEIDO: unknown = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/expedicion.json", import.meta.url),
		"utf8",
	),
);

/** Forma suelta del JSON para romper una regla a la vez. */
interface Crudo {
	dineroInicial: number;
	bolasIniciales: number;
	tasaCapturaPorDefecto: number;
	recompensa: Record<string, Array<Record<string, unknown>>>;
	catalogoTienda: Array<Record<string, unknown>>;
	multBola: Record<string, number>;
	tasaCaptura: Record<string, number>;
	[k: string]: unknown;
}

const TIPOS = ["salvaje", "entrenador", "alfa", "sombrio", "jefe"] as const;

/** Copia independiente del pack. */
const base = (): Crudo => structuredClone(LEIDO) as Crudo;

/** Valida una copia del pack con una mutación aplicada. */
const roto = (romper: (crudo: Crudo) => void): boolean => {
	const crudo = base();
	romper(crudo);
	return ExpedicionBalanceSchema.safeParse(crudo).success;
};

/** Rangos de un tipo de nodo; falla la prueba si el pack no los trae. */
const rangos = (crudo: Crudo, tipo: string): Array<Record<string, unknown>> => {
	const lista = crudo.recompensa[tipo];
	if (!lista) throw new Error(`el pack no trae rangos de ${tipo}`);
	return lista;
};

/** Rango concreto, ya como números. */
const rango = (
	crudo: Crudo,
	tipo: string,
	piso: number,
): { min: number; max: number } => {
	const fila = rangos(crudo, tipo)[piso - 1];
	if (!fila) throw new Error(`el pack no trae ${tipo} en el piso ${piso}`);
	const { min, max } = fila;
	if (typeof min !== "number" || typeof max !== "number") {
		throw new Error(`el rango de ${tipo} del piso ${piso} no es numérico`);
	}
	return { min, max };
};

/** Artículo del catálogo; falla la prueba si el pack no lo trae. */
const articulo = (crudo: Crudo, indice: number): Record<string, unknown> => {
	const elegido = crudo.catalogoTienda[indice];
	if (!elegido) throw new Error(`el pack no trae el artículo ${indice}`);
	return elegido;
};

describe("ExpedicionBalanceSchema", () => {
	it("acepta el JSON real del pack", () => {
		const resultado = ExpedicionBalanceSchema.safeParse(LEIDO);
		expect(resultado.success ? [] : resultado.error.issues).toEqual([]);
	});

	it("el pack trae los valores de diseño pedidos", () => {
		const datos = ExpedicionBalanceSchema.parse(LEIDO);
		expect(datos.dineroInicial).toBe(30);
		expect(datos.bolasIniciales).toBe(5);
		expect(datos.tasaCapturaPorDefecto).toBe(120);
		expect(datos.catalogoTienda).toEqual([
			{ id: "poke-ball", tipo: "ball", precio: 20 },
			{ id: "super-ball", tipo: "ball", precio: 45 },
			{ id: "baya-aranja", tipo: "baya", precio: 15 },
			{ id: "baya-zidra", tipo: "baya", precio: 30 },
			{ id: "mt-rayo", tipo: "mt", precio: 60 },
			{ id: "mt-terremoto", tipo: "mt", precio: 80 },
			{ id: "banda-focus", tipo: "objeto", precio: 70 },
			{ id: "restos", tipo: "objeto", precio: 90 },
		]);
		expect(new Set(datos.catalogoTienda.map((a) => a.id)).size).toBe(8);
		expect(datos.catalogoTienda.filter((a) => a.tipo === "ball")).toHaveLength(
			2,
		);
		expect(datos.multBola).toEqual({ "poke-ball": 1, "super-ball": 1.5 });
		expect(datos.tasaCaptura).toEqual({
			bulbasaur: 45,
			charmander: 45,
			squirtle: 45,
			pikachu: 190,
			zubat: 255,
			abra: 200,
			machop: 180,
			geodude: 255,
			gastly: 190,
			eevee: 45,
		});
		expect(datos.recompensa).toEqual({
			salvaje: [
				{ min: 5, max: 10 },
				{ min: 8, max: 14 },
				{ min: 12, max: 20 },
			],
			entrenador: [
				{ min: 12, max: 20 },
				{ min: 18, max: 28 },
				{ min: 25, max: 40 },
			],
			alfa: [
				{ min: 20, max: 30 },
				{ min: 30, max: 45 },
				{ min: 40, max: 60 },
			],
			sombrio: [
				{ min: 15, max: 25 },
				{ min: 25, max: 35 },
				{ min: 35, max: 50 },
			],
			jefe: [
				{ min: 40, max: 60 },
				{ min: 60, max: 90 },
				{ min: 100, max: 150 },
			],
		});
	});

	it("el pack sube la media de recompensa con el piso", () => {
		const crudo = base();
		for (const tipo of TIPOS) {
			const medios = [1, 2, 3].map((piso) => {
				const r = rango(crudo, tipo, piso);
				expect(r.max).toBeGreaterThanOrEqual(r.min);
				return (r.min + r.max) / 2;
			});
			expect(medios[1]).toBeGreaterThan(medios[0] ?? 0);
			expect(medios[2]).toBeGreaterThan(medios[1] ?? 0);
		}
	});

	it("rechaza un rango con el máximo por debajo del mínimo", () => {
		expect(
			roto((crudo) => {
				rangos(crudo, "salvaje")[0] = { min: 9, max: 4 };
			}),
		).toBe(false);
	});

	it("rechaza un rango negativo o no entero", () => {
		expect(
			roto((crudo) => {
				rangos(crudo, "alfa")[1] = { min: -1, max: 5 };
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				rangos(crudo, "alfa")[1] = { min: 1, max: 5.5 };
			}),
		).toBe(false);
	});

	it("rechaza una clave extra", () => {
		expect(
			roto((crudo) => {
				crudo.campeon = { min: 1, max: 2 };
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.recompensa.campeon = [
					{ min: 1, max: 2 },
					{ min: 1, max: 2 },
					{ min: 1, max: 2 },
				];
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				rangos(crudo, "jefe")[0] = { min: 40, max: 60, extra: 1 };
			}),
		).toBe(false);
	});

	it("rechaza que falte un tipo de nodo en recompensa", () => {
		expect(
			roto((crudo) => {
				const { jefe: _jefe, ...resto } = crudo.recompensa;
				crudo.recompensa = resto;
			}),
		).toBe(false);
	});

	it("rechaza una tupla que no tenga 3 pisos", () => {
		expect(
			roto((crudo) => {
				crudo.recompensa.sombrio = rangos(crudo, "sombrio").slice(0, 2);
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				rangos(crudo, "sombrio").push({ min: 1, max: 2 });
			}),
		).toBe(false);
	});

	it("rechaza un id de artículo repetido", () => {
		// Se repite un id que no es ball: así el único motivo para invalidarlo
		// es el catálogo en sí, sin tocar la lista de multiplicadores.
		expect(
			roto((crudo) => {
				crudo.catalogoTienda[3] = { ...articulo(crudo, 3), id: "baya-aranja" };
			}),
		).toBe(false);
	});

	it("rechaza un catálogo de menos de 6 artículos", () => {
		expect(
			roto((crudo) => {
				crudo.catalogoTienda = crudo.catalogoTienda.slice(0, 5);
			}),
		).toBe(false);
	});

	it("rechaza un catálogo sin ninguna ball", () => {
		expect(
			roto((crudo) => {
				for (const a of crudo.catalogoTienda) a.tipo = "baya";
			}),
		).toBe(false);
	});

	it("rechaza un multBola de un id que no está en el catálogo", () => {
		expect(
			roto((crudo) => {
				crudo.multBola["master-ball"] = 3;
			}),
		).toBe(false);
	});

	it("rechaza un multBola de un artículo que no es ball", () => {
		expect(
			roto((crudo) => {
				crudo.multBola["baya-aranja"] = 2;
			}),
		).toBe(false);
	});

	it("rechaza una ball del catálogo sin su multBola", () => {
		expect(
			roto((crudo) => {
				const { "super-ball": _super, ...resto } = crudo.multBola;
				crudo.multBola = resto;
			}),
		).toBe(false);
	});

	it("rechaza un multBola que no sea mayor que 0", () => {
		expect(
			roto((crudo) => {
				crudo.multBola["poke-ball"] = 0;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.multBola["poke-ball"] = -1;
			}),
		).toBe(false);
	});

	it("rechaza una tasa de captura fuera de 0..255", () => {
		expect(
			roto((crudo) => {
				crudo.tasaCaptura.pikachu = 256;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.tasaCaptura.pikachu = -1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.tasaCapturaPorDefecto = 256;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.tasaCapturaPorDefecto = 45.5;
			}),
		).toBe(false);
	});

	it("rechaza un precio de 0 o un tipo de artículo desconocido", () => {
		expect(
			roto((crudo) => {
				crudo.catalogoTienda[2] = { ...articulo(crudo, 2), precio: 0 };
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.catalogoTienda[2] = { ...articulo(crudo, 2), tipo: "caramelo" };
			}),
		).toBe(false);
	});

	it("rechaza un slug de artículo inválido", () => {
		expect(
			roto((crudo) => {
				crudo.catalogoTienda[0] = { ...articulo(crudo, 0), id: "Poke Ball" };
			}),
		).toBe(false);
	});

	it("rechaza dinero negativo o no entero", () => {
		expect(
			roto((crudo) => {
				crudo.dineroInicial = -1;
			}),
		).toBe(false);
		expect(
			roto((crudo) => {
				crudo.bolasIniciales = 2.5;
			}),
		).toBe(false);
	});
});

describe("RangoDineroSchema", () => {
	it("exige enteros mayores o iguales que 0 con max >= min", () => {
		expect(RangoDineroSchema.safeParse({ min: 5, max: 10 }).success).toBe(true);
		expect(RangoDineroSchema.safeParse({ min: 5, max: 5 }).success).toBe(true);
		expect(RangoDineroSchema.safeParse({ min: 10, max: 5 }).success).toBe(
			false,
		);
		expect(RangoDineroSchema.safeParse({ min: -1, max: 5 }).success).toBe(
			false,
		);
		expect(RangoDineroSchema.safeParse({ min: 1.5, max: 5 }).success).toBe(
			false,
		);
		expect(
			RangoDineroSchema.safeParse({ min: 1, max: 5, extra: 1 }).success,
		).toBe(false);
		expect(RangoDineroSchema.safeParse({ min: 1 }).success).toBe(false);
	});
});
