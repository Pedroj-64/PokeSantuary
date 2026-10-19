import { describe, expect, it } from "vitest";
import { crearRng } from "../rng.js";
import {
	crearSantuario,
	type EstadoSantuario,
	type Residente,
	type SantuarioBalance,
} from "./estado.js";
import {
	amanecer,
	calcularArmonia,
	confortDeZona,
	inquietos,
	PASOS_ALBA,
	PASOS_ATARDECER,
	puntosDecoracion,
	resolverAtardecer,
	zonaDe,
} from "./jornada.js";

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

/** Residente de prueba con valores neutros; cada prueba cambia lo que necesita. */
function residente(uid: string, opciones: Partial<Residente> = {}): Residente {
	return {
		uid,
		especie: "pikachu",
		naturaleza: "Hardy",
		nivel: 5,
		tipos: ["electric"],
		preferidos: ["cultivar"],
		especialidades: {},
		usosEspecialidad: {},
		hambre: 80,
		animo: 60,
		amistad: 1,
		estado: "descansado",
		tarea: { tipo: "nada" },
		zona: 0,
		origen: "captura",
		diasInquieto: 0,
		trabajoHoy: "ninguno",
		habloHoy: false,
		peticionCumplidaHoy: false,
		...opciones,
	};
}

/** Santuario mínimo con los residentes y opciones indicados. */
function estado(
	residentes: Residente[] = [],
	opciones: Partial<EstadoSantuario> = {},
): EstadoSantuario {
	return {
		...crearSantuario("s1", balance()),
		residentes,
		...opciones,
	};
}

/** Un único residente con lecho, Hambre 50 y Ánimo 50. */
function estadoUnResidente(opciones: Partial<Residente> = {}): EstadoSantuario {
	return estado([
		residente("r1", {
			lecho: "lecho-1",
			hambre: 50,
			animo: 50,
			...opciones,
		}),
	]);
}

/** Coloca una decoración sobre una loseta del estado de prueba. */
function ponerDecoracion(
	e: EstadoSantuario,
	x: number,
	y: number,
	id: string,
): void {
	const loseta = e.terreno.losetas[y * e.terreno.ancho + x];
	if (!loseta) throw new Error(`no hay loseta en ${x}, ${y}`);
	loseta.objeto = `decoracion:${id}`;
}

/** Reparte `puntos` decoraciones de 1 punto por la zona indicada. */
function decorarZona(e: EstadoSantuario, zona: number, puntos: number): void {
	const b = balance();
	const lado = b.isla.zona;
	const columnas = b.isla.ancho / lado;
	const x0 = (zona % columnas) * lado;
	const y0 = Math.floor(zona / columnas) * lado;
	for (let i = 0; i < puntos; i++) {
		ponerDecoracion(e, x0 + (i % lado), y0 + Math.floor(i / lado), "banco");
	}
}

/** Paso del Atardecer por id; falla la prueba si no existe. */
function pasoDe(id: string) {
	const encontrado = PASOS_ATARDECER.find((p) => p.id === id);
	if (!encontrado) throw new Error(`no hay paso "${id}"`);
	return encontrado.paso;
}

/** Ejecuta un paso suelto con un rng de prueba. */
function ejecutar(id: string, e: EstadoSantuario) {
	return pasoDe(id)(e, balance(), crearRng("prueba"));
}

describe("PASOS", () => {
	it("el Atardecer resuelve obra, producción, comida, ánimo, confort-armonía, inquietud y cierre, en ese orden", () => {
		expect(PASOS_ATARDECER.map((p) => p.id)).toEqual([
			"obra",
			"produccion",
			"comida",
			"animo",
			"confort-armonia",
			"inquietud",
			"cierre",
		]);
	});

	it("el Alba todavía no tiene pasos propios", () => {
		expect(PASOS_ALBA).toEqual([]);
	});
});

describe("comida", () => {
	it("baja el Hambre de todos y la deja entre 0 y 100", () => {
		const e = estado(
			[residente("r1", { hambre: 100 }), residente("r2", { hambre: 3 })],
			{ recursos: {} },
		);
		const r = ejecutar("comida", e);
		expect(r.estado.residentes[0]?.hambre).toBe(75);
		expect(r.estado.residentes[1]?.hambre).toBe(0);
		expect(r.eventos).toEqual([{ tipo: "sinBayas", uid: "r2" }]);
	});

	it("come primero la baya de su sabor favorito aunque haya otro sabor antes", () => {
		// Modest prefiere seco y no le gusta picante: picante va antes en el orden
		// canónico, así que elegirla probaría que NO se respeta el favorito.
		const e = estado(
			[residente("r1", { naturaleza: "Modest", hambre: 50, animo: 60 })],
			{
				recursos: {
					"baya:picante": 1,
					"baya:seco": 1,
					"baya:dulce": 1,
					"baya:neutro": 1,
				},
			},
		);
		const r = ejecutar("comida", e);
		expect(r.estado.residentes[0]).toMatchObject({ hambre: 60, animo: 65 });
		expect(r.estado.recursos).toEqual({
			"baya:picante": 1,
			"baya:seco": 0,
			"baya:dulce": 1,
			"baya:neutro": 1,
		});
		expect(r.eventos).toEqual([{ tipo: "comio", uid: "r1", sabor: "seco" }]);
	});

	it("si no hay favorita, evita el sabor que no le gusta", () => {
		const e = estado(
			[residente("r1", { naturaleza: "Adamant", hambre: 50, animo: 60 })],
			{
				recursos: {
					"baya:seco": 1,
					"baya:dulce": 1,
					"baya:neutro": 1,
				},
			},
		);
		const r = ejecutar("comida", e);
		expect(r.estado.residentes[0]).toMatchObject({ hambre: 50, animo: 60 });
		expect(r.estado.recursos).toEqual({
			"baya:seco": 1,
			"baya:dulce": 0,
			"baya:neutro": 1,
		});
		expect(r.eventos).toEqual([{ tipo: "comio", uid: "r1", sabor: "dulce" }]);
	});

	it("si solo queda el sabor que no le gusta, se lo come", () => {
		const e = estado(
			[residente("r1", { naturaleza: "Adamant", hambre: 50, animo: 60 })],
			{ recursos: { "baya:seco": 1 } },
		);
		const r = ejecutar("comida", e);
		expect(r.estado.residentes[0]).toMatchObject({ hambre: 40, animo: 55 });
		expect(r.estado.recursos).toEqual({ "baya:seco": 0 });
		expect(r.eventos).toEqual([{ tipo: "comio", uid: "r1", sabor: "seco" }]);
	});

	it("la baya neutra usa el efecto neutro, también para naturalezas neutras", () => {
		const conNeutra = estado(
			[residente("r1", { naturaleza: "Adamant", hambre: 50, animo: 60 })],
			{ recursos: { "baya:neutro": 1 } },
		);
		const r1 = ejecutar("comida", conNeutra);
		expect(r1.estado.residentes[0]).toMatchObject({ hambre: 50, animo: 60 });
		expect(r1.eventos).toEqual([{ tipo: "comio", uid: "r1", sabor: "neutro" }]);

		const naturalezaNeutra = estado(
			[residente("r1", { naturaleza: "Hardy", hambre: 50, animo: 60 })],
			{ recursos: { "baya:picante": 1 } },
		);
		const r2 = ejecutar("comida", naturalezaNeutra);
		expect(r2.estado.residentes[0]).toMatchObject({ hambre: 50, animo: 60 });
		expect(r2.eventos).toEqual([
			{ tipo: "comio", uid: "r1", sabor: "picante" },
		]);
	});

	it("sin bayas emite sinBayas y no toca las existencias", () => {
		const e = estado([residente("r1", { naturaleza: "Adamant", hambre: 50 })], {
			recursos: { madera: 7 },
		});
		const r = ejecutar("comida", e);
		expect(r.estado.residentes[0]?.hambre).toBe(25);
		expect(r.estado.recursos).toEqual({ madera: 7 });
		expect(r.eventos).toEqual([{ tipo: "sinBayas", uid: "r1" }]);
	});

	it("procesa por uid ascendente y los visitantes también comen", () => {
		const e = estado(
			[
				residente("b", { hambre: 50, estado: "visitante" }),
				residente("a", { hambre: 50 }),
			],
			{ recursos: { "baya:neutro": 2 } },
		);
		const r = ejecutar("comida", e);
		expect(r.eventos).toEqual([
			{ tipo: "comio", uid: "a", sabor: "neutro" },
			{ tipo: "comio", uid: "b", sabor: "neutro" },
		]);
		expect(r.estado.recursos["baya:neutro"]).toBe(0);
		expect(r.estado.residentes.map((x) => x.uid)).toEqual(["b", "a"]);
	});

	it("acota el Hambre a 100 al comer", () => {
		const e = estado([residente("r1", { naturaleza: "Adamant", hambre: 91 })], {
			recursos: { "baya:picante": 1 },
		});
		const r = ejecutar("comida", e);
		expect(r.estado.residentes[0]?.hambre).toBe(100);
	});

	it("con Hambre 70 o más no come y no gasta bayas", () => {
		const e = estado([residente("r1", { naturaleza: "Adamant", hambre: 95 })], {
			recursos: { "baya:picante": 1 },
		});
		const r = ejecutar("comida", e);
		expect(r.estado.residentes[0]?.hambre).toBe(70);
		expect(r.estado.recursos["baya:picante"]).toBe(1);
		expect(r.eventos).toEqual([]);
	});

	it("lanza si un residente con hambre tiene una naturaleza que no está en el balance", () => {
		const e = estado(
			[residente("r1", { naturaleza: "Misteriosa", hambre: 50 })],
			{ recursos: { "baya:neutro": 1 } },
		);
		expect(() => ejecutar("comida", e)).toThrow(RangeError);
	});
});

describe("animo", () => {
	it("suma el trabajo preferido", () => {
		const e = estadoUnResidente({ trabajoHoy: "preferido" });
		decorarZona(e, 0, 4);
		expect(ejecutar("animo", e).estado.residentes[0]?.animo).toBe(60);
	});

	it("resta el trabajo no preferido", () => {
		const e = estadoUnResidente({ trabajoHoy: "no-preferido" });
		decorarZona(e, 0, 4);
		expect(ejecutar("animo", e).estado.residentes[0]?.animo).toBe(45);
	});

	it("suma el Confort por encima de 2 y resta por debajo", () => {
		const confortBajo = estadoUnResidente();
		expect(ejecutar("animo", confortBajo).estado.residentes[0]?.animo).toBe(45);

		const confortNeutro = estadoUnResidente();
		decorarZona(confortNeutro, 0, 4);
		expect(ejecutar("animo", confortNeutro).estado.residentes[0]?.animo).toBe(
			50,
		);

		const confortAlto = estadoUnResidente();
		decorarZona(confortAlto, 0, 8);
		expect(ejecutar("animo", confortAlto).estado.residentes[0]?.animo).toBe(55);
	});

	it("resta por Hambre baja, justo por debajo del umbral", () => {
		const conHambre = estadoUnResidente({ hambre: 29 });
		decorarZona(conHambre, 0, 4);
		expect(ejecutar("animo", conHambre).estado.residentes[0]?.animo).toBe(35);

		const enElUmbral = estadoUnResidente({ hambre: 30 });
		decorarZona(enElUmbral, 0, 4);
		expect(ejecutar("animo", enElUmbral).estado.residentes[0]?.animo).toBe(50);
	});

	it("suma la petición cumplida", () => {
		const e = estadoUnResidente({ peticionCumplidaHoy: true });
		decorarZona(e, 0, 4);
		expect(ejecutar("animo", e).estado.residentes[0]?.animo).toBe(70);
	});

	it("suma el tema Ánimo de la Charla", () => {
		const e = estadoUnResidente();
		e.temaCharla = "animo";
		decorarZona(e, 0, 4);
		expect(ejecutar("animo", e).estado.residentes[0]?.animo).toBe(60);
	});

	it("resta si duerme sin lecho", () => {
		const e = estadoUnResidente({ lecho: undefined });
		decorarZona(e, 0, 4);
		expect(ejecutar("animo", e).estado.residentes[0]?.animo).toBe(40);
	});

	it("resta si está agotado", () => {
		const e = estadoUnResidente({ estado: "agotado" });
		decorarZona(e, 0, 4);
		expect(ejecutar("animo", e).estado.residentes[0]?.animo).toBe(45);
	});

	it("resta si es Sombrío aunque tenga tarea de cuidador (aún no hay Purificador)", () => {
		const e = estadoUnResidente({
			sombrio: 40,
			tarea: { tipo: "cuidador" },
		});
		// 8 puntos dejan el Confort en 3, y el propio Sombrío lo baja a 2: así
		// el único cambio de esta prueba es el −5 de "sombrioSuelto".
		decorarZona(e, 0, 8);
		expect(ejecutar("animo", e).estado.residentes[0]?.animo).toBe(45);
	});

	it("suma si habló con el Guardián", () => {
		const e = estadoUnResidente({ habloHoy: true });
		decorarZona(e, 0, 4);
		expect(ejecutar("animo", e).estado.residentes[0]?.animo).toBe(53);
	});

	it("aplica Animar una sola vez por zona aunque haya dos animadores", () => {
		const e = estado([
			residente("r1", {
				lecho: "l",
				animo: 50,
				zona: 0,
				tarea: { tipo: "especialidad", accion: "animar", x: 0, y: 0 },
			}),
			residente("r2", {
				lecho: "l",
				animo: 50,
				zona: 0,
				tarea: { tipo: "especialidad", accion: "animar", x: 0, y: 0 },
			}),
			residente("r3", { lecho: "l", animo: 50, zona: 0 }),
			residente("r4", { lecho: "l", animo: 50, zona: 1 }),
		]);
		decorarZona(e, 0, 4);
		decorarZona(e, 1, 4);
		const r = ejecutar("animo", e);
		expect(r.estado.residentes.map((x) => x.animo)).toEqual([55, 55, 55, 50]);
	});

	it("acota el Ánimo entre 0 y 100 tras sumar todos los cambios", () => {
		const alto = estadoUnResidente({ animo: 98, trabajoHoy: "preferido" });
		decorarZona(alto, 0, 4);
		expect(ejecutar("animo", alto).estado.residentes[0]?.animo).toBe(100);

		const bajo = estadoUnResidente({ animo: 3, trabajoHoy: "no-preferido" });
		decorarZona(bajo, 0, 4);
		expect(ejecutar("animo", bajo).estado.residentes[0]?.animo).toBe(0);
	});
});

describe("zonaDe", () => {
	it("reparte la isla de 40 x 30 en 12 zonas de 10 x 10", () => {
		const b = balance();
		expect(zonaDe(0, 0, b)).toBe(0);
		expect(zonaDe(9, 9, b)).toBe(0);
		expect(zonaDe(10, 0, b)).toBe(1);
		expect(zonaDe(0, 10, b)).toBe(4);
		expect(zonaDe(39, 29, b)).toBe(11);
	});
});

describe("puntosDecoracion", () => {
	it("suma solo los puntos de las decoraciones de la zona pedida", () => {
		const e = estado();
		const b = balance();
		ponerDecoracion(e, 0, 0, "banco");
		ponerDecoracion(e, 1, 0, "fogata");
		ponerDecoracion(e, 2, 0, "estatua-unown");
		ponerDecoracion(e, 10, 0, "piedra-luna");
		expect(puntosDecoracion(e, 0, b)).toBe(6);
		expect(puntosDecoracion(e, 1, b)).toBe(3);
		expect(puntosDecoracion(e, 2, b)).toBe(0);
	});

	it("ignora un objeto de decoración que no está en el balance", () => {
		const e = estado();
		ponerDecoracion(e, 0, 0, "no-existe");
		expect(puntosDecoracion(e, 0, balance())).toBe(0);
	});
});

describe("confortDeZona", () => {
	it("empieza en 1 y sube un punto por cada 4 de decoración", () => {
		const vacia = estado();
		expect(confortDeZona(vacia, 0, balance())).toBe(1);

		const tres = estado();
		decorarZona(tres, 0, 3);
		expect(confortDeZona(tres, 0, balance())).toBe(1);

		const cuatro = estado();
		decorarZona(cuatro, 0, 4);
		expect(confortDeZona(cuatro, 0, balance())).toBe(2);
	});

	it("suma un punto por un hábitat completo en la zona", () => {
		const e = estado();
		decorarZona(e, 0, 4);
		e.habitatsCompletos = [{ id: "pradera-alta", x: 1, y: 1 }];
		expect(confortDeZona(e, 0, balance())).toBe(3);
	});

	it("suma un punto con 3 o más especies distintas en la zona", () => {
		const e = estado([
			residente("r1", { especie: "pikachu", zona: 0 }),
			residente("r2", { especie: "eevee", zona: 0 }),
			residente("r3", { especie: "bulbasaur", zona: 0 }),
		]);
		expect(confortDeZona(e, 0, balance())).toBe(2);
	});

	it("resta un punto si hay un Sombrío en la zona", () => {
		const e = estado([residente("r1", { zona: 0, sombrio: 10 })]);
		decorarZona(e, 0, 4);
		expect(confortDeZona(e, 0, balance())).toBe(1);
	});

	it("acota el resultado entre el mínimo y el máximo del balance", () => {
		const e = estado([
			residente("r1", { especie: "pikachu", zona: 0 }),
			residente("r2", { especie: "eevee", zona: 0 }),
			residente("r3", { especie: "bulbasaur", zona: 0 }),
		]);
		e.habitatsCompletos = [{ id: "pradera-alta", x: 1, y: 1 }];
		decorarZona(e, 0, 20);
		expect(confortDeZona(e, 0, balance())).toBe(5);

		const sombria = estado([residente("r1", { zona: 0, sombrio: 10 })]);
		expect(confortDeZona(sombria, 0, balance())).toBe(1);
	});
});

describe("calcularArmonia", () => {
	it("devuelve 50 cuando no hay residentes", () => {
		const e = estado();
		e.armonia = 99;
		expect(calcularArmonia(e, balance())).toBe(50);
	});

	it("aplica 0,6 por Ánimo medio y 0,4 por 20 veces el Confort medio", () => {
		const e = estado([residente("r1", { animo: 60, zona: 0 })]);
		decorarZona(e, 0, 4);
		expect(calcularArmonia(e, balance())).toBe(52);
	});

	it("redondea al entero más cercano", () => {
		const e = estado([residente("r1", { animo: 61, zona: 0 })]);
		decorarZona(e, 0, 4);
		expect(calcularArmonia(e, balance())).toBe(53);
	});

	it("promedia el Confort por zona, no por residente", () => {
		const e = estado([
			residente("r1", { animo: 60, zona: 0 }),
			residente("r2", { animo: 80, zona: 0 }),
			residente("r3", { animo: 70, zona: 1 }),
		]);
		// Confort 2 en la zona 0 y 3 en la 1: la media por zona es 2,5 (Armonía
		// 62) y por residente sería 2,33 (61).
		decorarZona(e, 0, 4);
		decorarZona(e, 1, 8);
		expect(calcularArmonia(e, balance())).toBe(62);
	});

	it("promedia zonas distintas con residentes", () => {
		const e = estado([
			residente("r1", { animo: 60, zona: 0 }),
			residente("r2", { animo: 80, zona: 1 }),
		]);
		decorarZona(e, 0, 4);
		decorarZona(e, 1, 8);
		expect(calcularArmonia(e, balance())).toBe(62);
	});
});

describe("inquietos", () => {
	it("devuelve solo a quienes tienen Armonía baja y Ánimo bajo", () => {
		const e = estado(
			[
				residente("r1", { animo: 24 }),
				residente("r2", { animo: 25 }),
				residente("r3", { animo: 10 }),
			],
			{ armonia: 29 },
		);
		expect(inquietos(e, balance())).toEqual(["r1", "r3"]);
	});

	it("con Armonía en el umbral no devuelve a nadie", () => {
		const e = estado([residente("r1", { animo: 10 })], { armonia: 30 });
		expect(inquietos(e, balance())).toEqual([]);
	});
});

describe("inquietud", () => {
	/** Estado con un residente en riesgo de Inquietud. */
	const enRiesgo = (dias: number, animo = 20, armonia = 29): EstadoSantuario =>
		estado([residente("r1", { animo, diasInquieto: dias, lecho: "l" })], {
			armonia,
		});

	it("avisa a la tercera jornada seguida y se va en la cuarta", () => {
		let e = enRiesgo(0);
		const avisos: unknown[] = [];
		const salidas: unknown[] = [];
		for (let dia = 1; dia <= 4; dia++) {
			const r = ejecutar("inquietud", e);
			e = r.estado;
			avisos.push(...r.eventos.filter((ev) => ev.tipo === "avisoInquietud"));
			salidas.push(...r.eventos.filter((ev) => ev.tipo === "seVa"));
			if (dia < 3) expect(r.eventos).toEqual([]);
			if (dia === 3)
				expect(r.eventos).toEqual([{ tipo: "avisoInquietud", uid: "r1" }]);
			if (dia === 4) {
				expect(r.eventos).toEqual([{ tipo: "seVa", uid: "r1" }]);
				expect(r.estado.residentes).toEqual([]);
			}
		}
		expect(avisos).toEqual([{ tipo: "avisoInquietud", uid: "r1" }]);
		expect(salidas).toEqual([{ tipo: "seVa", uid: "r1" }]);
	});

	it("reinicia los días si el Ánimo sube a 25 o más", () => {
		const e = enRiesgo(2, 25);
		const r = ejecutar("inquietud", e);
		expect(r.estado.residentes[0]?.diasInquieto).toBe(0);
		expect(r.eventos).toEqual([]);
	});

	it("reinicia los días si la Armonía deja de estar baja", () => {
		const e = enRiesgo(2, 20, 30);
		const r = ejecutar("inquietud", e);
		expect(r.estado.residentes[0]?.diasInquieto).toBe(0);
		expect(r.eventos).toEqual([]);
	});

	it("no se lleva a nadie si la Armonía es alta aunque el Ánimo sea bajo", () => {
		let e = enRiesgo(0, 10, 30);
		for (let dia = 1; dia <= 5; dia++) {
			const r = ejecutar("inquietud", e);
			e = r.estado;
			expect(r.eventos).toEqual([]);
			expect(e.residentes[0]?.diasInquieto).toBe(0);
		}
		expect(e.residentes).toHaveLength(1);
	});
});

describe("cierre", () => {
	it("descansa a los agotados y pasa el momento a noche", () => {
		const e = estado([
			residente("r1", { estado: "agotado" }),
			residente("r2", { estado: "sombrio" }),
			residente("r3", { estado: "visitante" }),
			residente("r4", { estado: "descansado" }),
		]);
		const r = ejecutar("cierre", e);
		expect(r.estado.momento).toBe("noche");
		expect(r.estado.residentes.map((x) => x.estado)).toEqual([
			"descansado",
			"sombrio",
			"visitante",
			"descansado",
		]);
		expect(r.eventos).toEqual([]);
	});
});

describe("amanecer", () => {
	it("sube la jornada, vuelve al alba y reinicia las banderas diarias", () => {
		const acciones = [{ uid: "r1", accion: "regar", x: 1, y: 2, orden: 7 }];
		const e = estado(
			[
				residente("r1", {
					habloHoy: true,
					peticionCumplidaHoy: true,
					trabajoHoy: "preferido",
				}),
			],
			{
				momento: "noche",
				jornada: 3,
				temaCharla: "animo",
				accionesMarcadas: acciones,
			},
		);
		const r = amanecer(e, balance());
		expect(r.estado.jornada).toBe(4);
		expect(r.estado.momento).toBe("alba");
		expect(r.estado.temaCharla).toBeUndefined();
		expect(r.estado.residentes[0]).toMatchObject({
			habloHoy: false,
			peticionCumplidaHoy: false,
			trabajoHoy: "ninguno",
		});
		expect(r.estado.accionesMarcadas).toEqual(acciones);
		expect(r.eventos).toEqual([]);
	});

	it("lanza si no es de noche", () => {
		expect(() => amanecer(estado([], { momento: "alba" }), balance())).toThrow(
			/noche/,
		);
	});
});

describe("resolverAtardecer", () => {
	it("lanza si no es el atardecer", () => {
		expect(() =>
			resolverAtardecer(estado([], { momento: "dia" }), balance()),
		).toThrow(/atardecer/);
	});

	it("no muta el estado ni el balance congelados y es determinista", () => {
		const e = estado(
			[
				residente("r1", {
					naturaleza: "Adamant",
					hambre: 50,
					animo: 60,
					lecho: "l",
				}),
			],
			{ momento: "atardecer", temaCharla: "animo", recursos: {} },
		);
		decorarZona(e, 0, 4);
		const congelado = congelar(e);
		const b = congelar(balance());
		const r1 = resolverAtardecer(congelado, b);
		const r2 = resolverAtardecer(congelado, b);
		expect(r1).toEqual(r2);
	});

	it("amanecer(resolverAtardecer(e)) es igual ejecutado dos veces", () => {
		const e = estado(
			[
				residente("r1", {
					naturaleza: "Adamant",
					hambre: 50,
					animo: 60,
					lecho: "lecho-1",
				}),
			],
			{
				momento: "atardecer",
				temaCharla: "animo",
				recursos: { "baya:picante": 1 },
			},
		);
		decorarZona(e, 0, 4);
		const una = amanecer(resolverAtardecer(e, balance()).estado, balance());
		const otra = amanecer(resolverAtardecer(e, balance()).estado, balance());
		expect(una).toEqual(otra);
	});

	it("resuelve una jornada completa y el Alba siguiente la reinicia", () => {
		const e = estado(
			[
				residente("r1", {
					naturaleza: "Adamant",
					hambre: 50,
					animo: 60,
					lecho: "lecho-1",
				}),
			],
			{
				momento: "atardecer",
				temaCharla: "animo",
				recursos: { "baya:picante": 1 },
			},
		);
		decorarZona(e, 0, 4);
		const r = resolverAtardecer(e, balance());
		expect(r.eventos).toEqual([{ tipo: "comio", uid: "r1", sabor: "picante" }]);
		expect(r.estado.residentes[0]).toMatchObject({ hambre: 60, animo: 75 });
		expect(r.estado.armonia).toBe(61);
		expect(r.estado.momento).toBe("noche");
		expect(r.estado.recursos["baya:picante"]).toBe(0);

		const a = amanecer(r.estado, balance());
		expect(a.estado.jornada).toBe(2);
		expect(a.estado.momento).toBe("alba");
		expect(a.estado.temaCharla).toBeUndefined();
		expect(a.estado.residentes[0]?.habloHoy).toBe(false);
		expect(a.estado.residentes[0]?.trabajoHoy).toBe("ninguno");
	});

	it("el Alba no muta el estado congelado", () => {
		const e = congelar(
			estado([residente("r1", { habloHoy: true })], {
				momento: "noche",
				jornada: 3,
			}),
		);
		expect(() => amanecer(e, congelar(balance()))).not.toThrow();
	});
});
