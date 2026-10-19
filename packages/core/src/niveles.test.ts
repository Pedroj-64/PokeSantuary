import { describe, expect, it } from "vitest";
import {
	alcanzaEvolucion,
	nivelBaseGimnasio,
	nivelInicial,
	nivelRival,
	subirNiveles,
	type TablaNiveles,
	type TablaSubida,
} from "./niveles.js";
import { crearRng } from "./rng.js";

const TABLA_NIVELES: TablaNiveles = {
	basePorPiso: [8, 18, 28, 38],
	desplazamiento: {
		salvaje: 0,
		ecoComun: 1,
		ecoNombrado: 2,
		sombrio: 3,
		rival: 3,
		alfa: 5,
		jefe: 4,
		heraldo: 8,
	},
	desplazamientoAs: { ecoComun: 3, ecoNombrado: 4, jefe: 6, heraldo: 8 },
	emboscada: 2,
	salvajeExtra: 2,
	porRangoFurioso: 2,
};

const TABLA_SUBIDA: TablaSubida = {
	porRival: {
		salvaje: [1, 0],
		ecoComun: [2, 1],
		ecoNombrado: [2, 1],
		sombrio: [2, 1],
		rival: [2, 1],
		alfa: [3, 1],
		jefe: [4, 2],
	},
	umbralPonerseAlDia: 4,
	extraPonerseAlDia: 1,
	margenTope: 2,
};

function congelarProfundamente(valor: unknown): unknown {
	if (Array.isArray(valor)) {
		return Object.freeze(valor.map(congelarProfundamente));
	}
	if (valor !== null && typeof valor === "object") {
		const copia: Record<string, unknown> = {};
		for (const clave of Object.keys(valor as object)) {
			copia[clave] = congelarProfundamente(
				(valor as Record<string, unknown>)[clave],
			);
		}
		return Object.freeze(copia);
	}
	return valor;
}

describe("nivelBaseGimnasio", () => {
	it("devuelve 8, 10, 12, 14, 16, 18 para gimnasio 0..5", () => {
		expect(nivelBaseGimnasio(0)).toBe(8);
		expect(nivelBaseGimnasio(1)).toBe(10);
		expect(nivelBaseGimnasio(2)).toBe(12);
		expect(nivelBaseGimnasio(3)).toBe(14);
		expect(nivelBaseGimnasio(4)).toBe(16);
		expect(nivelBaseGimnasio(5)).toBe(18);
	});

	it("lanza fuera de rango y para no enteros", () => {
		for (const malo of [-1, 6, 1.5, "0", Number.NaN]) {
			expect(() => nivelBaseGimnasio(malo as number)).toThrow(RangeError);
		}
	});

	it("no muta nada (no recibe objetos)", () => {
		const antes = nivelBaseGimnasio(3);
		expect(antes).toBe(14);
		expect(nivelBaseGimnasio(3)).toBe(antes);
	});
});

describe("nivelInicial", () => {
	it("nivelInicial(0, 16) = 14 (Charmeleon, Gimnasio 0)", () => {
		expect(nivelInicial(0, 16)).toBe(14);
	});
	it("nivelInicial(0, 0) = 8 (forma base)", () => {
		expect(nivelInicial(0, 0)).toBe(8);
	});
	it("nivelInicial(0, 36) = 14 (tope NB+6)", () => {
		expect(nivelInicial(0, 36)).toBe(14);
	});
	it("nivelInicial(3, 0) = 14", () => {
		expect(nivelInicial(3, 0)).toBe(14);
	});

	it("lanza para nivelEtapa invalido", () => {
		for (const malo of [-1, 1.5, Number.NaN]) {
			expect(() => nivelInicial(0, malo)).toThrow(RangeError);
		}
	});
	it("lanza para nivelGimnasio invalido", () => {
		expect(() => nivelInicial(6, 0)).toThrow(RangeError);
		expect(() => nivelInicial(0.5, 0)).toThrow(RangeError);
	});
});

describe("nivelRival", () => {
	it("salvaje piso 1 con rng fijo esta entre 8 y 10 y es determinista", () => {
		const rng = crearRng("x");
		const uno = nivelRival(TABLA_NIVELES, { tipo: "salvaje", piso: 1 }, rng);
		const dos = nivelRival(
			TABLA_NIVELES,
			{ tipo: "salvaje", piso: 1 },
			crearRng("x"),
		);
		expect(uno).toBeGreaterThanOrEqual(8);
		expect(uno).toBeLessThanOrEqual(10);
		expect(dos).toBe(uno);
	});

	it("eco comun piso 2 = 19, su as = 21", () => {
		expect(
			nivelRival(TABLA_NIVELES, { tipo: "ecoComun", piso: 2 }, crearRng("x")),
		).toBe(19);
		expect(
			nivelRival(
				TABLA_NIVELES,
				{ tipo: "ecoComun", piso: 2, as: true },
				crearRng("x"),
			),
		).toBe(21);
	});

	it("sombrio piso 3 = 31", () => {
		expect(
			nivelRival(TABLA_NIVELES, { tipo: "sombrio", piso: 3 }, crearRng("x")),
		).toBe(31);
	});

	it("alfa piso 1 = 13", () => {
		expect(
			nivelRival(TABLA_NIVELES, { tipo: "alfa", piso: 1 }, crearRng("x")),
		).toBe(13);
	});

	it("jefe piso 1 = 12, as del jefe = 14", () => {
		expect(
			nivelRival(TABLA_NIVELES, { tipo: "jefe", piso: 1 }, crearRng("x")),
		).toBe(12);
		expect(
			nivelRival(
				TABLA_NIVELES,
				{ tipo: "jefe", piso: 1, as: true },
				crearRng("x"),
			),
		).toBe(14);
	});

	it("emboscada suma 2", () => {
		expect(
			nivelRival(
				TABLA_NIVELES,
				{ tipo: "ecoComun", piso: 2, emboscada: true },
				crearRng("x"),
			),
		).toBe(21);
	});

	it("rangoFurioso 2 suma 4", () => {
		expect(
			nivelRival(
				TABLA_NIVELES,
				{ tipo: "ecoComun", piso: 2, rangoFurioso: 2 },
				crearRng("x"),
			),
		).toBe(23);
	});

	it("piso 5 lanza", () => {
		expect(() =>
			nivelRival(TABLA_NIVELES, { tipo: "ecoComun", piso: 5 }, crearRng("x")),
		).toThrow(RangeError);
	});

	it("un tipo que no es salvaje NO consume el rng", () => {
		const base = crearRng("x");
		const comparador = crearRng("x");
		nivelRival(TABLA_NIVELES, { tipo: "ecoComun", piso: 2 }, base);
		expect(base.siguiente()).toBe(comparador.siguiente());
	});

	it("as para un tipo sin desplazamientoAs lanza", () => {
		expect(() =>
			nivelRival(
				TABLA_NIVELES,
				{ tipo: "salvaje", piso: 1, as: true },
				crearRng("x"),
			),
		).toThrow(RangeError);
		expect(() =>
			nivelRival(
				TABLA_NIVELES,
				{ tipo: "alfa", piso: 1, as: true },
				crearRng("x"),
			),
		).toThrow(RangeError);
	});

	it("lanza para piso no entero y rangoFurioso no entero", () => {
		expect(() =>
			nivelRival(TABLA_NIVELES, { tipo: "ecoComun", piso: 1.5 }, crearRng("x")),
		).toThrow(RangeError);
		expect(() =>
			nivelRival(
				TABLA_NIVELES,
				{ tipo: "ecoComun", piso: 2, rangoFurioso: 1.5 },
				crearRng("x"),
			),
		).toThrow(RangeError);
	});
});

describe("subirNiveles", () => {
	it("salvaje: participantes +1, banquillo +0", () => {
		const niveles = [10, 12];
		const nuevo = subirNiveles(TABLA_SUBIDA, {
			niveles,
			participantes: [0],
			conscientes: [true, true],
			rival: "salvaje",
			techo: 12,
		});
		expect(nuevo).toEqual([11, 12]);
		expect(niveles).toEqual([10, 12]);
	});

	it("jefe: participantes +4, banquillo consciente +2", () => {
		const nuevo = subirNiveles(TABLA_SUBIDA, {
			niveles: [10, 12],
			participantes: [0],
			conscientes: [true, true],
			rival: "jefe",
			techo: 12,
		});
		expect(nuevo).toEqual([14, 14]);
	});

	it("el inconsciente del banquillo no gana", () => {
		const nuevo = subirNiveles(TABLA_SUBIDA, {
			niveles: [10, 12],
			participantes: [0],
			conscientes: [true, false],
			rival: "ecoComun",
			techo: 12,
		});
		expect(nuevo).toEqual([12, 12]);
	});

	it("ponerse al dia: equipo [20, 15], participa solo el de 20 en victoria de Eco", () => {
		const nuevo = subirNiveles(TABLA_SUBIDA, {
			niveles: [20, 15],
			participantes: [0],
			conscientes: [true, true],
			rival: "ecoComun",
			techo: 22,
		});
		expect(nuevo).toEqual([22, 17]);
	});

	it("sin ganancia no hay extra de ponerse al dia", () => {
		const nuevo = subirNiveles(TABLA_SUBIDA, {
			niveles: [20, 15],
			participantes: [],
			conscientes: [true, true],
			rival: "salvaje",
			techo: 22,
		});
		expect(nuevo).toEqual([20, 15]);
	});

	it("ponerse al dia aplica al que no es el mas alto y gano algo", () => {
		const nuevo = subirNiveles(TABLA_SUBIDA, {
			niveles: [20, 15],
			participantes: [0, 1],
			conscientes: [true, true],
			rival: "ecoComun",
			techo: 22,
		});
		expect(nuevo).toEqual([22, 18]);
	});

	it("tope: techo 14, margen 2 => nadie pasa de 16; un miembro a 18 se queda en 18", () => {
		const nuevo = subirNiveles(TABLA_SUBIDA, {
			niveles: [14, 18, 10],
			participantes: [0, 1, 2],
			conscientes: [true, true, true],
			rival: "jefe",
			techo: 14,
		});
		expect(nuevo).toEqual([16, 18, 15]);
	});

	it("no muta la entrada congelada", () => {
		const entrada = congelarProfundamente({
			niveles: [10, 12],
			participantes: [0],
			conscientes: [true, true],
			rival: "ecoComun",
			techo: 12,
		});
		expect(() =>
			subirNiveles(TABLA_SUBIDA, entrada as Parameters<typeof subirNiveles>[1]),
		).not.toThrow();
	});

	it("entradas invalidas lanzan", () => {
		const base: Parameters<typeof subirNiveles>[1] = {
			niveles: [10, 12],
			participantes: [0],
			conscientes: [true, true],
			rival: "ecoComun",
			techo: 12,
		};
		const mutar = (cambio: Partial<Parameters<typeof subirNiveles>[1]>) =>
			expect(() =>
				subirNiveles(TABLA_SUBIDA, { ...base, ...cambio } as Parameters<
					typeof subirNiveles
				>[1]),
			).toThrow(RangeError);

		mutar({ participantes: [0, 0] }); // repetidos
		mutar({ participantes: [2] }); // fuera de rango
		mutar({ niveles: [10], conscientes: [true, true] }); // longitudes distintas
		mutar({ niveles: [10, 12.5] }); // no entero
		mutar({ niveles: [0, 12] }); // menor a 1
		mutar({ rival: "heraldo" }); // no en tabla
		mutar({
			niveles: [10, 12],
			conscientes: [true, "x" as unknown as boolean],
		}); // no booleano
		mutar({ techo: 0 }); // techo invalido
	});
});

describe("alcanzaEvolucion", () => {
	it("15 vs 16 falso", () => {
		expect(alcanzaEvolucion(15, 16)).toBe(false);
	});
	it("16 vs 16 verdadero", () => {
		expect(alcanzaEvolucion(16, 16)).toBe(true);
	});
	it("undefined falso", () => {
		expect(alcanzaEvolucion(100, undefined)).toBe(false);
	});

	it("lanza para nivel invalido y nivelEvolucion invalido", () => {
		expect(() => alcanzaEvolucion(0, 10)).toThrow(RangeError);
		expect(() => alcanzaEvolucion(10, 0)).toThrow(RangeError);
		expect(() => alcanzaEvolucion(10, 1.5)).toThrow(RangeError);
	});
});
