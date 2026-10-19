import { describe, expect, it } from "vitest";
import { crearRng } from "../rng.js";
import {
	crearSantuario,
	type EstadoSantuario,
	esAreaUtil,
	type Loseta,
	type Residente,
	type SantuarioBalance,
} from "./estado.js";
import {
	accionesPosibles,
	colocarCamino,
	colocarDecoracion,
	desmarcarAccion,
	enIsla,
	loseta,
	marcarAccion,
	pasoTerreno,
	plantarBrote,
	terrenoInicial,
} from "./terreno.js";

const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};
const BALANCE = JSON.parse(
	readFileSync(
		new URL("../../../../packs/kanto/santuario.json", import.meta.url),
		"utf8",
	),
) as SantuarioBalance;
const balance = (): SantuarioBalance => structuredClone(BALANCE);
const rng = () => crearRng("prueba:terreno");

function congelar<T>(valor: T): T {
	if (valor === null || typeof valor !== "object") return valor;
	Object.freeze(valor);
	for (const hijo of Object.values(valor as Record<string, unknown>))
		congelar(hijo);
	return valor;
}

function residente(uid: string, opciones: Partial<Residente> = {}): Residente {
	return {
		uid,
		especie: "bulbasaur",
		naturaleza: "Hardy",
		nivel: 5,
		tipos: ["grass"],
		preferidos: [],
		especialidades: {},
		usosEspecialidad: {},
		hambre: 100,
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

/** Isla pequeña y controlada: todo yerma salvo lo que ponga cada prueba. */
function sandbox(ancho = 6, alto = 6): EstadoSantuario {
	const e = crearSantuario("s1", balance());
	return {
		...e,
		terreno: {
			ancho,
			alto,
			losetas: Array.from({ length: ancho * alto }, () => ({
				tipo: "yerma" as const,
				edad: 0,
				humedad: false,
				encendido: false,
			})),
		},
	};
}

/** Copia el estado con la loseta indicada cambiada. */
function poner(
	e: EstadoSantuario,
	x: number,
	y: number,
	cambios: Partial<Loseta>,
): EstadoSantuario {
	const i = y * e.terreno.ancho + x;
	return {
		...e,
		terreno: {
			...e.terreno,
			losetas: e.terreno.losetas.map((l, j) =>
				j === i ? { ...l, ...cambios } : l,
			),
		},
	};
}

function conResidente(e: EstadoSantuario, r: Residente): EstadoSantuario {
	return { ...e, residentes: [...e.residentes, r] };
}

/** Marca una acción con un residente nuevo y resuelve el Atardecer. */
function ejecutar(
	e: EstadoSantuario,
	accion: string,
	x: number,
	y: number,
	nivel = 1,
) {
	const residenteDe = residente("r1", {
		especialidades: { [accion]: nivel },
	});
	const marcado = marcarAccion(
		conResidente(e, residenteDe),
		"r1",
		accion,
		x,
		y,
		balance(),
	);
	return pasoTerreno(marcado, balance(), rng());
}

describe("terrenoInicial", () => {
	it("es determinista por semilla y no comparte losetas", () => {
		const b = balance();
		const uno = terrenoInicial("s1", b);
		const otro = terrenoInicial("s1", b);
		expect(uno).toEqual(otro);
		expect(uno.losetas).not.toBe(otro.losetas);
		expect(uno.losetas[0]).not.toBe(otro.losetas[0]);
		expect(terrenoInicial("s2", b)).not.toEqual(uno);
	});

	it("no muta el balance congelado", () => {
		const b = congelar(balance());
		const antes = structuredClone(b);
		expect(() => terrenoInicial("s1", b)).not.toThrow();
		expect(b).toEqual(antes);
	});

	it("trae un claro de 7 x 7 de tierra alrededor del centro, sin roca ni agua", () => {
		const b = balance();
		const t = terrenoInicial("s1", b);
		const centroX = Math.floor(t.ancho / 2);
		const centroY = Math.floor(t.alto / 2);
		for (let y = centroY - 3; y <= centroY + 3; y++) {
			for (let x = centroX - 3; x <= centroX + 3; x++) {
				const l = loseta(t, x, y);
				expect(l.tipo).not.toBe("roca");
				expect(l.tipo).not.toBe("agua");
				expect(l.tipo === "tierra" || l.tipo === "camino").toBe(true);
			}
		}
	});

	it("deja al menos 60 losetas de área útil y usa todos los materiales", () => {
		const t = terrenoInicial("s1", balance());
		expect(t.losetas).toHaveLength(t.ancho * t.alto);
		expect(t.losetas.filter(esAreaUtil).length).toBeGreaterThanOrEqual(60);
		const tipos = new Set(t.losetas.map((l) => l.tipo));
		for (const tipo of [
			"yerma",
			"roca",
			"hierba-alta",
			"agua",
			"arena",
			"tierra",
			"camino",
		]) {
			expect(tipos).toContain(tipo);
		}
		expect(t.losetas.every((l) => l.objeto === undefined)).toBe(true);
	});

	it("llega al Santuario de crearSantuario", () => {
		const b = balance();
		expect(crearSantuario("s1", b).terreno).toEqual(terrenoInicial("s1", b));
	});
});

describe("loseta, enIsla y accionesPosibles", () => {
	const losetaDe = (cambios: Partial<Loseta>): Loseta => ({
		tipo: "yerma",
		edad: 0,
		humedad: false,
		encendido: false,
		...cambios,
	});

	it("enIsla y loseta respetan los bordes", () => {
		const t = { ancho: 3, alto: 2, losetas: [] as Loseta[] };
		expect(enIsla(t, 0, 0)).toBe(true);
		expect(enIsla(t, 2, 1)).toBe(true);
		expect(enIsla(t, 3, 0)).toBe(false);
		expect(enIsla(t, 0, 2)).toBe(false);
		expect(enIsla(t, -1, 0)).toBe(false);
		expect(() => loseta(t, 3, 0)).toThrow(RangeError);
		expect(loseta({ ...t, losetas: [losetaDe({})] }, 0, 0)).toMatchObject({
			tipo: "yerma",
		});
	});

	it("ofrece solo las acciones que hacen algo en esa loseta", () => {
		expect(accionesPosibles(losetaDe({}), [])).toEqual(["crecer"]);
		expect(accionesPosibles(losetaDe({ tipo: "tierra" }), [])).toEqual([
			"crecer",
			"regar",
		]);
		expect(
			accionesPosibles(losetaDe({ tipo: "tierra", humedad: true }), ["tierra"]),
		).toEqual(["crecer"]);
		expect(
			accionesPosibles(losetaDe({ tipo: "tierra", humedad: true }), [
				"agua",
				"agua",
			]),
		).toEqual(["crecer", "regar"]);
		expect(accionesPosibles(losetaDe({ tipo: "pradera" }), [])).toEqual([
			"crecer",
			"regar",
		]);
		expect(
			accionesPosibles(losetaDe({ tipo: "pradera", humedad: true }), []),
		).toEqual(["crecer"]);
		expect(accionesPosibles(losetaDe({ tipo: "roca" }), [])).toEqual([
			"romper",
		]);
		expect(accionesPosibles(losetaDe({ tipo: "hierba-alta" }), [])).toEqual([
			"cortar",
		]);
		expect(accionesPosibles(losetaDe({ objeto: "arbol" }), [])).toEqual([
			"cortar",
		]);
		expect(accionesPosibles(losetaDe({ objeto: "brote" }), [])).toEqual([
			"crecer",
		]);
		expect(accionesPosibles(losetaDe({ objeto: "farol" }), [])).toEqual([
			"encender",
		]);
		expect(accionesPosibles(losetaDe({ tipo: "agua" }), [])).toEqual([]);
		expect(accionesPosibles(losetaDe({ tipo: "arena" }), [])).toEqual([]);
	});
});

describe("transiciones de la tabla", () => {
	it("crecer: yerma a tierra", () => {
		const r = ejecutar(sandbox(), "crecer", 1, 1);
		expect(loseta(r.estado.terreno, 1, 1).tipo).toBe("tierra");
		expect(r.eventos).toContainEqual({
			tipo: "terrenoCambiado",
			x: 1,
			y: 1,
			de: "yerma",
			a: "tierra",
		});
	});

	it("crecer: tierra a pradera, y a hierba alta si se regó antes", () => {
		const seca = poner(sandbox(), 1, 1, { tipo: "tierra" });
		expect(
			loseta(ejecutar(seca, "crecer", 1, 1).estado.terreno, 1, 1).tipo,
		).toBe("pradera");
		const conDos = conResidente(
			conResidente(seca, residente("r1", { especialidades: { regar: 1 } })),
			residente("r2", { especialidades: { crecer: 1 } }),
		);
		const marcado = marcarAccion(
			marcarAccion(conDos, "r2", "crecer", 1, 1, balance()),
			"r1",
			"regar",
			1,
			1,
			balance(),
		);
		expect(
			loseta(pasoTerreno(marcado, balance(), rng()).estado.terreno, 1, 1).tipo,
		).toBe("hierba-alta");
	});

	it("crecer: pradera a hierba alta", () => {
		const e = poner(sandbox(), 1, 1, { tipo: "pradera" });
		expect(loseta(ejecutar(e, "crecer", 1, 1).estado.terreno, 1, 1).tipo).toBe(
			"hierba-alta",
		);
	});

	it("crecer: brote a árbol joven y árbol a las dos jornadas", () => {
		const e = poner(sandbox(), 1, 1, { tipo: "tierra", objeto: "brote" });
		const crecido = ejecutar(e, "crecer", 1, 1);
		expect(loseta(crecido.estado.terreno, 1, 1)).toMatchObject({
			tipo: "tierra",
			objeto: "arbol-joven",
			edad: 0,
		});
		const uno = pasoTerreno(crecido.estado, balance(), rng());
		expect(loseta(uno.estado.terreno, 1, 1).objeto).toBe("arbol-joven");
		const dos = pasoTerreno(uno.estado, balance(), rng());
		expect(loseta(dos.estado.terreno, 1, 1)).toMatchObject({
			objeto: "arbol",
			edad: 0,
		});
	});

	it("regar: tierra húmeda una jornada", () => {
		const e = poner(sandbox(), 1, 1, { tipo: "tierra" });
		const r = ejecutar(e, "regar", 1, 1);
		expect(loseta(r.estado.terreno, 1, 1).humedad).toBe(true);
		const siguiente = pasoTerreno(r.estado, balance(), rng());
		expect(loseta(siguiente.estado.terreno, 1, 1).humedad).toBe(false);
	});

	it("regar: tierra con dos vecinas de agua se vuelve agua", () => {
		let e = poner(sandbox(), 1, 1, { tipo: "tierra" });
		e = poner(e, 1, 0, { tipo: "agua" });
		e = poner(e, 0, 1, { tipo: "agua" });
		expect(loseta(ejecutar(e, "regar", 1, 1).estado.terreno, 1, 1).tipo).toBe(
			"agua",
		);
	});

	it("regar y crecer la misma jornada: pradera con flor", () => {
		const e = poner(sandbox(), 1, 1, { tipo: "pradera" });
		const conAgua = conResidente(
			e,
			residente("r1", { especialidades: { regar: 1 } }),
		);
		const conDos = conResidente(
			conAgua,
			residente("r2", { especialidades: { crecer: 1 } }),
		);
		const marcado = marcarAccion(
			marcarAccion(conDos, "r2", "crecer", 1, 1, balance()),
			"r1",
			"regar",
			1,
			1,
			balance(),
		);
		const r = pasoTerreno(marcado, balance(), rng());
		expect(loseta(r.estado.terreno, 1, 1)).toMatchObject({
			tipo: "pradera",
			objeto: "flor",
		});
	});

	it("romper: roca a tierra con 2 de piedra", () => {
		const e = poner(sandbox(), 1, 1, { tipo: "roca" });
		const r = ejecutar({ ...e, recursos: {} }, "romper", 1, 1);
		expect(loseta(r.estado.terreno, 1, 1).tipo).toBe("tierra");
		expect(r.estado.recursos.piedra).toBe(2);
	});

	it("romper: junto al agua deja arena", () => {
		let e = poner(sandbox(), 1, 1, { tipo: "roca" });
		e = poner(e, 2, 1, { tipo: "agua" });
		expect(loseta(ejecutar(e, "romper", 1, 1).estado.terreno, 1, 1).tipo).toBe(
			"arena",
		);
	});

	it("cortar: árbol a tierra con tocón y 3 de madera", () => {
		const e = poner(sandbox(), 1, 1, { tipo: "tierra", objeto: "arbol" });
		const r = ejecutar({ ...e, recursos: {} }, "cortar", 1, 1);
		expect(loseta(r.estado.terreno, 1, 1)).toMatchObject({
			tipo: "tierra",
			objeto: "tocon",
		});
		expect(r.estado.recursos.madera).toBe(3);
	});

	it("cortar: hierba alta a pradera", () => {
		const e = poner({ ...sandbox(), recursos: {} }, 1, 1, {
			tipo: "hierba-alta",
		});
		const r = ejecutar(e, "cortar", 1, 1);
		expect(loseta(r.estado.terreno, 1, 1).tipo).toBe("pradera");
		expect(r.estado.recursos.madera).toBeUndefined();
	});

	it("encender: farol encendido una jornada", () => {
		const e = poner(sandbox(), 1, 1, { tipo: "tierra", objeto: "farol" });
		const r = ejecutar(e, "encender", 1, 1);
		expect(loseta(r.estado.terreno, 1, 1).encendido).toBe(true);
		const siguiente = pasoTerreno(r.estado, balance(), rng());
		expect(loseta(siguiente.estado.terreno, 1, 1).encendido).toBe(false);
	});

	it("plantarBrote pone un brote sobre tierra o pradera sin coste", () => {
		const e = plantarBrote(poner(sandbox(), 2, 2, { tipo: "pradera" }), 2, 2);
		expect(loseta(e.terreno, 2, 2)).toMatchObject({
			objeto: "brote",
			edad: 0,
		});
		expect(() => plantarBrote(e, 2, 2)).toThrow(RangeError);
		const yerma = sandbox();
		expect(() => plantarBrote(yerma, 0, 0)).toThrow(RangeError);
	});
});

describe("marcarAccion", () => {
	const trabajo = { tipo: "trabajo", edificio: "ed1" } as const;

	it("rechaza sin Especialidad, agotado, no aplicable, fuera de isla o con otra tarea", () => {
		const e = sandbox();
		const antes = structuredClone(e);
		const sinEspecialidad = conResidente(e, residente("r1"));
		expect(() =>
			marcarAccion(sinEspecialidad, "r1", "crecer", 0, 0, balance()),
		).toThrow(RangeError);
		const agotado = conResidente(
			e,
			residente("r1", { estado: "agotado", especialidades: { crecer: 1 } }),
		);
		expect(() =>
			marcarAccion(agotado, "r1", "crecer", 0, 0, balance()),
		).toThrow(RangeError);
		const ocupado = conResidente(
			e,
			residente("r1", { tarea: trabajo, especialidades: { crecer: 1 } }),
		);
		expect(() =>
			marcarAccion(ocupado, "r1", "crecer", 0, 0, balance()),
		).toThrow(RangeError);
		const conCrecer = conResidente(
			e,
			residente("r1", { especialidades: { crecer: 1 } }),
		);
		expect(() =>
			marcarAccion(conCrecer, "r1", "crecer", 9, 9, balance()),
		).toThrow(RangeError);
		const roca = poner(sandbox(), 0, 0, { tipo: "roca" });
		const sobreRoca = conResidente(
			roca,
			residente("r1", { especialidades: { crecer: 1 } }),
		);
		expect(() =>
			marcarAccion(sobreRoca, "r1", "crecer", 0, 0, balance()),
		).toThrow(RangeError);
		expect(e).toEqual(antes);
	});

	it("marca, ocupa la tarea y desmarcar la libera", () => {
		const e = conResidente(
			sandbox(),
			residente("r1", { especialidades: { crecer: 1 } }),
		);
		const marcado = marcarAccion(e, "r1", "crecer", 2, 3, balance());
		expect(marcado.residentes[0]?.tarea).toEqual({
			tipo: "especialidad",
			accion: "crecer",
			x: 2,
			y: 3,
		});
		expect(marcado.accionesMarcadas).toEqual([
			{ uid: "r1", accion: "crecer", x: 2, y: 3, orden: 2 },
		]);
		expect(marcado.siguienteUid).toBe(3);
		const libre = desmarcarAccion(marcado, "r1");
		expect(libre.residentes[0]?.tarea).toEqual({ tipo: "nada" });
		expect(libre.accionesMarcadas).toEqual([]);
		expect(() => desmarcarAccion(e, "nadie")).toThrow(RangeError);
	});

	it("nivel 2 marca 2 x 2 y nivel 3 marca 3 x 3", () => {
		const dos = ejecutar(sandbox(8, 8), "crecer", 1, 1, 2);
		for (let y = 1; y <= 2; y++)
			for (let x = 1; x <= 2; x++)
				expect(loseta(dos.estado.terreno, x, y).tipo).toBe("tierra");

		const tres = ejecutar(sandbox(8, 8), "crecer", 1, 1, 3);
		for (let y = 1; y <= 3; y++)
			for (let x = 1; x <= 3; x++)
				expect(loseta(tres.estado.terreno, x, y).tipo).toBe("tierra");
	});

	it("ignora las losetas del área que no admiten la acción", () => {
		let e = poner(sandbox(8, 8), 2, 2, { tipo: "roca" });
		e = poner(e, 1, 1, { tipo: "yerma" });
		const r = ejecutar(e, "crecer", 1, 1, 2);
		expect(loseta(r.estado.terreno, 1, 1).tipo).toBe("tierra");
		expect(loseta(r.estado.terreno, 1, 2).tipo).toBe("tierra");
		expect(loseta(r.estado.terreno, 2, 1).tipo).toBe("tierra");
		expect(loseta(r.estado.terreno, 2, 2).tipo).toBe("roca");
	});
});

describe("usos y niveles", () => {
	it("sube a nivel 2 con 10 usos y a nivel 3 con 30", () => {
		const conNueve = conResidente(
			sandbox(),
			residente("r1", {
				especialidades: { crecer: 1 },
				usosEspecialidad: { crecer: 9 },
			}),
		);
		const marcado = marcarAccion(conNueve, "r1", "crecer", 1, 1, balance());
		const r = pasoTerreno(marcado, balance(), rng());
		expect(r.estado.residentes[0]?.usosEspecialidad.crecer).toBe(10);
		expect(r.estado.residentes[0]?.especialidades.crecer).toBe(2);
		expect(r.estado.residentes[0]?.tarea).toEqual({ tipo: "nada" });

		const conVeintinueve = conResidente(
			sandbox(),
			residente("r1", {
				especialidades: { crecer: 2 },
				usosEspecialidad: { crecer: 29 },
			}),
		);
		const otro = pasoTerreno(
			marcarAccion(conVeintinueve, "r1", "crecer", 1, 1, balance()),
			balance(),
			rng(),
		);
		expect(otro.estado.residentes[0]?.especialidades.crecer).toBe(3);
	});
});

describe("orden y determinismo", () => {
	it("regar se aplica antes que crecer aunque se marquen al revés", () => {
		const preparar = (primero: "regar" | "crecer") => {
			const e = conResidente(
				conResidente(
					poner(sandbox(), 1, 1, { tipo: "pradera" }),
					residente("r1", { especialidades: { regar: 1 } }),
				),
				residente("r2", { especialidades: { crecer: 1 } }),
			);
			const orden = primero === "regar" ? ["r1", "r2"] : ["r2", "r1"];
			let s = e;
			for (const uid of orden)
				s = marcarAccion(
					s,
					uid,
					uid === "r1" ? "regar" : "crecer",
					1,
					1,
					balance(),
				);
			return pasoTerreno(s, balance(), rng()).estado;
		};
		const uno = preparar("regar");
		const otro = preparar("crecer");
		expect(loseta(uno.terreno, 1, 1)).toEqual(loseta(otro.terreno, 1, 1));
		expect(loseta(uno.terreno, 1, 1).objeto).toBe("flor");
	});

	it("dos acciones contradictorias en la misma loseta: gana regar y crecer se descarta", () => {
		// La tierra con dos vecinas de agua se vuelve agua al regar; el crecer
		// marcado después ya no es aplicable y se ignora. Cada marca se
		// recalcula sobre el terreno que deja la anterior.
		let e = poner(sandbox(), 1, 1, { tipo: "tierra" });
		e = poner(e, 1, 0, { tipo: "agua" });
		e = poner(e, 0, 1, { tipo: "agua" });
		const conGente = conResidente(
			conResidente(e, residente("r1", { especialidades: { regar: 1 } })),
			residente("r2", { especialidades: { crecer: 1 } }),
		);
		const marcado = marcarAccion(
			marcarAccion(conGente, "r2", "crecer", 1, 1, balance()),
			"r1",
			"regar",
			1,
			1,
			balance(),
		);
		const r = pasoTerreno(marcado, balance(), rng());
		expect(loseta(r.estado.terreno, 1, 1).tipo).toBe("agua");
		expect(
			r.estado.residentes.find((x) => x.uid === "r2")?.usosEspecialidad.crecer,
		).toBeUndefined();
	});

	it("vacía las marcas y no muta el estado congelado", () => {
		const e = congelar(
			conResidente(
				sandbox(),
				residente("r1", { especialidades: { crecer: 1 } }),
			),
		);
		const marcado = marcarAccion(e, "r1", "crecer", 1, 1, congelar(balance()));
		const r = pasoTerreno(marcado, congelar(balance()), rng());
		expect(r.estado.accionesMarcadas).toEqual([]);
		expect(loseta(r.estado.terreno, 1, 1).tipo).toBe("tierra");
	});
});

describe("colocarCamino y colocarDecoracion", () => {
	it("colocarCamino cuesta 1 de piedra y solo vale sobre tierra o pradera", () => {
		const e = {
			...poner(sandbox(), 1, 1, { tipo: "tierra" }),
			recursos: { piedra: 3 },
		};
		const r = colocarCamino(e, 1, 1, balance());
		expect(r.recursos.piedra).toBe(2);
		expect(loseta(r.terreno, 1, 1).tipo).toBe("camino");
		expect(e.recursos.piedra).toBe(3);
		expect(() => colocarCamino(e, 0, 0, balance())).toThrow(RangeError);
		expect(() =>
			colocarCamino({ ...e, recursos: { piedra: 0 } }, 1, 1, balance()),
		).toThrow(RangeError);
		const ocupada = poner(e, 2, 2, { tipo: "tierra", objeto: "farol" });
		expect(() => colocarCamino(ocupada, 2, 2, balance())).toThrow(RangeError);
	});

	it("colocarDecoracion descuenta el coste y deja el objeto", () => {
		const e = {
			...poner(sandbox(), 1, 1, { tipo: "tierra" }),
			recursos: { madera: 5, piedra: 5 },
		};
		const r = colocarDecoracion(e, "banco", 1, 1, balance());
		expect(r.recursos).toEqual({ madera: 3, piedra: 5 });
		expect(loseta(r.terreno, 1, 1)).toMatchObject({
			objeto: "decoracion:banco",
			edad: 0,
		});
		expect(() => colocarDecoracion(r, "banco", 1, 1, balance())).toThrow(
			RangeError,
		);
		expect(() => colocarDecoracion(e, "no-existe", 1, 1, balance())).toThrow(
			RangeError,
		);
		expect(() =>
			colocarDecoracion({ ...e, recursos: {} }, "banco", 1, 1, balance()),
		).toThrow(RangeError);
		const yerma = sandbox();
		expect(() => colocarDecoracion(yerma, "banco", 1, 1, balance())).toThrow(
			RangeError,
		);
	});
});
