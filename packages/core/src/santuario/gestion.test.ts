import { describe, expect, it } from "vitest";
import {
	crearSantuario,
	type Edificio,
	type EstadoSantuario,
	type Residente,
	type SantuarioBalance,
	type Tarea,
} from "./estado.js";
import {
	admitir,
	asignarLecho,
	asignarTarea,
	capacidadResidentes,
	colocarKit,
	mejorarEdificio,
} from "./gestion.js";

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
		especie: "pikachu",
		naturaleza: "Hardy",
		nivel: 5,
		tipos: ["electric"],
		preferidos: ["aserrar"],
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

function estado(
	residentes: Residente[] = [],
	opciones: Partial<EstadoSantuario> = {},
): EstadoSantuario {
	return { ...crearSantuario("s1", balance()), residentes, ...opciones };
}

function prepararTerreno(
	e: EstadoSantuario,
	x: number,
	y: number,
	ancho: number,
	alto: number,
): void {
	for (let j = 0; j < alto; j++) {
		for (let i = 0; i < ancho; i++) {
			const loseta = e.terreno.losetas[(y + j) * e.terreno.ancho + x + i];
			if (!loseta) throw new Error("fuera del terreno");
			loseta.tipo = "tierra";
			loseta.objeto = undefined;
		}
	}
}

function conArbolNivel(e: EstadoSantuario, nivel: number): EstadoSantuario {
	return {
		...e,
		edificios: e.edificios.map((ed) =>
			ed.tipo === "arbol-cenit" ? { ...ed, nivel } : ed,
		),
	};
}

function conEdificio(
	e: EstadoSantuario,
	tipo: string,
	uid: string,
	x = 0,
	y = 0,
	nivel = 1,
	obraRestante = 0,
	resto: Record<string, number> = {},
): EstadoSantuario {
	const edificio: Edificio = { uid, tipo, x, y, nivel, obraRestante, resto };
	return { ...e, edificios: [...e.edificios, edificio] };
}

describe("capacidadResidentes", () => {
	it("sale del nivel del Árbol Cenit", () => {
		expect(capacidadResidentes(estado(), balance())).toBe(6);
		expect(capacidadResidentes(conArbolNivel(estado(), 3), balance())).toBe(15);
		expect(capacidadResidentes(conArbolNivel(estado(), 5), balance())).toBe(30);
	});

	it("es 0 si no hay Árbol Cenit", () => {
		const e = estado();
		e.edificios = e.edificios.filter((ed) => ed.tipo !== "arbol-cenit");
		expect(capacidadResidentes(e, balance())).toBe(0);
	});
});

describe("admitir", () => {
	it("añade al residente con la zona del Árbol Cenit", () => {
		const e = estado();
		const r = admitir(e, residente("r1", { zona: 0 }), balance());
		expect(r.residentes).toHaveLength(1);
		expect(r.residentes[0]).toMatchObject({ uid: "r1", zona: 5 });
		expect(e.residentes).toHaveLength(0);
	});

	it("rechaza un uid repetido, una zona inválida y pasarse de capacidad", () => {
		const e = estado([residente("r1")]);
		expect(() => admitir(e, residente("r1"), balance())).toThrow(RangeError);
		expect(() => admitir(e, residente("r2", { zona: 12 }), balance())).toThrow(
			RangeError,
		);
		expect(() => admitir(e, residente("r2", { zona: -1 }), balance())).toThrow(
			RangeError,
		);
		expect(() => admitir(e, residente("r2", { zona: 1.5 }), balance())).toThrow(
			RangeError,
		);
		const lleno = estado(
			Array.from({ length: 6 }, (_, i) => residente(`r${i}`)),
		);
		expect(() => admitir(lleno, residente("r7"), balance())).toThrow(
			RangeError,
		);
	});

	it("no muta el estado ni el balance congelados", () => {
		const e = congelar(estado());
		expect(() =>
			admitir(e, residente("r1"), congelar(balance())),
		).not.toThrow();
	});
});

describe("colocarKit", () => {
	it("descuenta el kit exacto y crea el edificio con uid y obra", () => {
		const e = estado([], { recursos: { madera: 10, piedra: 6 } });
		prepararTerreno(e, 0, 0, 2, 2);
		const antes = structuredClone(e);
		const r = colocarKit(e, "huerto-bayas", 0, 0, balance());
		expect(r.recursos).toEqual({ madera: 4, piedra: 2 });
		expect(r.siguienteUid).toBe(3);
		expect(r.edificios).toHaveLength(2);
		expect(r.edificios[1]).toEqual({
			uid: "ed2",
			tipo: "huerto-bayas",
			x: 0,
			y: 0,
			nivel: 1,
			obraRestante: 6,
			resto: {},
		});
		expect(e).toEqual(antes);
	});

	it("lanza sin recursos, sobre yerma, con solape, fuera de la isla o sobre un objeto", () => {
		const sinRecursos = estado([], { recursos: {} });
		prepararTerreno(sinRecursos, 0, 0, 1, 1);
		const antes = structuredClone(sinRecursos);
		expect(() =>
			colocarKit(sinRecursos, "lecho-hojas", 0, 0, balance()),
		).toThrow(RangeError);
		expect(sinRecursos).toEqual(antes);

		const yerma = estado();
		expect(() => colocarKit(yerma, "lecho-hojas", 0, 0, balance())).toThrow(
			RangeError,
		);

		const solape = estado([], { recursos: { madera: 100, piedra: 100 } });
		prepararTerreno(solape, 0, 0, 3, 3);
		const conUno = colocarKit(solape, "lecho-hojas", 0, 0, balance());
		expect(() => colocarKit(conUno, "lecho-hojas", 0, 0, balance())).toThrow(
			RangeError,
		);

		const fuera = estado([], { recursos: { madera: 100, piedra: 100 } });
		expect(() => colocarKit(fuera, "huerto-bayas", 39, 0, balance())).toThrow(
			RangeError,
		);
		expect(() => colocarKit(fuera, "huerto-bayas", 0, 29, balance())).toThrow(
			RangeError,
		);
		expect(() => colocarKit(fuera, "lecho-hojas", -1, 0, balance())).toThrow(
			RangeError,
		);

		const objeto = estado([], { recursos: { madera: 100, piedra: 100 } });
		prepararTerreno(objeto, 0, 0, 1, 1);
		const loseta = objeto.terreno.losetas[0];
		if (!loseta) throw new Error("falta la loseta");
		loseta.objeto = "decoracion:banco";
		expect(() => colocarKit(objeto, "lecho-hojas", 0, 0, balance())).toThrow(
			RangeError,
		);
	});

	it("exige el nivel del Árbol y no deja colocar el propio Árbol", () => {
		const e = estado([], { recursos: { madera: 100, piedra: 100 } });
		prepararTerreno(e, 0, 0, 1, 1);
		expect(() => colocarKit(e, "lecho-paja", 0, 0, balance())).toThrow(
			RangeError,
		);
		expect(() =>
			colocarKit(conArbolNivel(e, 2), "lecho-paja", 0, 0, balance()),
		).not.toThrow();
		expect(() => colocarKit(e, "arbol-cenit", 0, 0, balance())).toThrow(
			RangeError,
		);
		expect(() => colocarKit(e, "no-existe", 0, 0, balance())).toThrow(
			RangeError,
		);
	});

	it("considera el Árbol Cenit como edificio ocupado", () => {
		const e = estado([], { recursos: { madera: 100, piedra: 100 } });
		prepararTerreno(e, 18, 13, 1, 1);
		expect(() => colocarKit(e, "lecho-hojas", 18, 13, balance())).toThrow(
			RangeError,
		);
	});
});

describe("mejorarEdificio", () => {
	it("sube un nivel, cobra el doble del kit y vuelve a poner la obra", () => {
		const e = conEdificio(
			estado([], { recursos: { madera: 100, piedra: 100 } }),
			"aserradero",
			"ed2",
			0,
			0,
			1,
			0,
			{ madera: 0.5 },
		);
		const r = mejorarEdificio(e, "ed2", balance());
		const ed = r.edificios.find((x) => x.uid === "ed2");
		expect(ed).toMatchObject({
			nivel: 2,
			obraRestante: 6,
			resto: { madera: 0.5 },
		});
		expect(r.recursos).toEqual({ madera: 92, piedra: 88 });
	});

	it("rechaza el Árbol, el máximo, un uid inexistente y recursos insuficientes", () => {
		expect(() => mejorarEdificio(estado(), "ed1", balance())).toThrow(
			RangeError,
		);
		const maximo = conEdificio(estado(), "aserradero", "ed2", 0, 0, 3, 0);
		expect(() => mejorarEdificio(maximo, "ed2", balance())).toThrow(RangeError);
		expect(() => mejorarEdificio(estado(), "ed99", balance())).toThrow(
			RangeError,
		);
		const pobre = conEdificio(
			estado([], { recursos: {} }),
			"aserradero",
			"ed2",
		);
		const antes = structuredClone(pobre);
		expect(() => mejorarEdificio(pobre, "ed2", balance())).toThrow(RangeError);
		expect(pobre).toEqual(antes);
		const unico = conEdificio(estado(), "lecho-hojas", "ed2");
		expect(() => mejorarEdificio(unico, "ed2", balance())).toThrow(RangeError);
	});

	it("no muta el estado congelado", () => {
		const e = congelar(
			conEdificio(
				estado([], { recursos: { madera: 100, piedra: 100 } }),
				"aserradero",
				"ed2",
			),
		);
		expect(() => mejorarEdificio(e, "ed2", congelar(balance()))).not.toThrow();
	});
});

describe("asignarTarea", () => {
	const trabajo: Tarea = { tipo: "trabajo", edificio: "ed2" };
	const construir: Tarea = { tipo: "construir", edificio: "ed2" };

	it("asigna trabajo y respeta las plazas del nivel", () => {
		const e = conEdificio(
			estado([residente("r1"), residente("r2"), residente("r3")]),
			"aserradero",
			"ed2",
		);
		const uno = asignarTarea(e, "r1", trabajo, balance());
		expect(uno.residentes[0]?.tarea).toEqual(trabajo);
		const dos = asignarTarea(uno, "r2", trabajo, balance());
		expect(() => asignarTarea(dos, "r3", trabajo, balance())).toThrow(
			RangeError,
		);
		expect(() => asignarTarea(dos, "r1", trabajo, balance())).not.toThrow();

		const nivel2 = conEdificio(
			estado([
				residente("r1"),
				residente("r2"),
				residente("r3"),
				residente("r4"),
			]),
			"aserradero",
			"ed2",
			0,
			0,
			2,
		);
		let s = nivel2;
		for (const uid of ["r1", "r2", "r3"])
			s = asignarTarea(s, uid, trabajo, balance());
		expect(() => asignarTarea(s, "r4", trabajo, balance())).toThrow(RangeError);
	});

	it("rechaza trabajo en obra, sin trabajo, con edificio inexistente y a un agotado", () => {
		const obra = conEdificio(
			estado([residente("r1")]),
			"aserradero",
			"ed2",
			0,
			0,
			1,
			6,
		);
		expect(() => asignarTarea(obra, "r1", trabajo, balance())).toThrow(
			RangeError,
		);
		const almacen = conEdificio(estado([residente("r1")]), "almacen", "ed2");
		expect(() => asignarTarea(almacen, "r1", trabajo, balance())).toThrow(
			RangeError,
		);
		const sinEdificio = estado([residente("r1")]);
		expect(() => asignarTarea(sinEdificio, "r1", trabajo, balance())).toThrow(
			RangeError,
		);
		const agotado = conEdificio(
			estado([residente("r1", { estado: "agotado" })]),
			"aserradero",
			"ed2",
		);
		expect(() => asignarTarea(agotado, "r1", trabajo, balance())).toThrow(
			RangeError,
		);
		expect(() =>
			asignarTarea(estado([residente("r1")]), "nadie", trabajo, balance()),
		).toThrow(RangeError);
	});

	it("asigna construir solo en obra y delega especialidad en terreno.ts", () => {
		const obra = conEdificio(
			estado([residente("r1")]),
			"aserradero",
			"ed2",
			0,
			0,
			1,
			6,
		);
		expect(
			asignarTarea(obra, "r1", construir, balance()).residentes[0]?.tarea,
		).toEqual(construir);
		const hecha = conEdificio(estado([residente("r1")]), "aserradero", "ed2");
		expect(() => asignarTarea(hecha, "r1", construir, balance())).toThrow(
			RangeError,
		);
		expect(() =>
			asignarTarea(
				estado([residente("r1")]),
				"r1",
				{ tipo: "especialidad", accion: "regar", x: 0, y: 0 },
				balance(),
			),
		).toThrow(/terreno\.ts/);
	});

	it("acepta nada siempre y cuidador sin validarlo aquí", () => {
		const e = estado([residente("r1", { estado: "agotado" })]);
		expect(
			asignarTarea(e, "r1", { tipo: "nada" }, balance()).residentes[0]?.tarea,
		).toEqual({ tipo: "nada" });
		expect(
			asignarTarea(e, "r1", { tipo: "cuidador" }, balance()).residentes[0]
				?.tarea,
		).toEqual({ tipo: "cuidador" });
	});
});

describe("asignarLecho", () => {
	it("asigna, rechaza una cama ocupada y libera con undefined", () => {
		const e = conEdificio(
			estado([residente("r1"), residente("r2")]),
			"lecho-hojas",
			"ed2",
		);
		const uno = asignarLecho(e, "r1", "ed2", balance());
		expect(uno.residentes[0]?.lecho).toBe("ed2");
		expect(() => asignarLecho(uno, "r2", "ed2", balance())).toThrow(RangeError);
		expect(() => asignarLecho(uno, "r1", "ed2", balance())).not.toThrow();
		const libre = asignarLecho(uno, "r1", undefined, balance());
		expect(libre.residentes[0]?.lecho).toBeUndefined();
		expect(() => asignarLecho(libre, "r2", "ed2", balance())).not.toThrow();
	});

	it("rechaza una cama en obra, un edificio que no es lecho y uids desconocidos", () => {
		const obra = conEdificio(
			estado([residente("r1")]),
			"lecho-hojas",
			"ed2",
			0,
			0,
			1,
			2,
		);
		expect(() => asignarLecho(obra, "r1", "ed2", balance())).toThrow(
			RangeError,
		);
		const otro = conEdificio(estado([residente("r1")]), "aserradero", "ed2");
		expect(() => asignarLecho(otro, "r1", "ed2", balance())).toThrow(
			RangeError,
		);
		expect(() => asignarLecho(otro, "r1", "nadie", balance())).toThrow(
			RangeError,
		);
		expect(() => asignarLecho(otro, "nadie", undefined, balance())).toThrow(
			RangeError,
		);
	});
});
