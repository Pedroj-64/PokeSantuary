import { describe, expect, it } from "vitest";
import type { EstadoExpedicion } from "../expedicion.js";
import { crearRng, type Rng } from "../rng.js";
import {
	crearSantuario,
	type EstadoSantuario,
	type OrigenResidente,
	type Residente,
	type SantuarioBalance,
} from "./estado.js";
import {
	equipoDeExpedicion,
	iniciarDesdeSantuario,
	liquidarEnSantuario,
} from "./expedicion.js";

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
		preferidos: [],
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

const santuario = (rs: Residente[]): EstadoSantuario => ({
	...crearSantuario("s1", balance()),
	residentes: rs,
	// los residentes de prueba se llaman r0..r9: el contador va por delante para no chocar
	siguienteUid: 100,
});

/** Fábrica de la app: aquí solo devuelve un residente con lo que recibe. */
const fabricar = (p: {
	especie: string;
	uid: string;
	origen: OrigenResidente;
	rng: Rng;
}): Residente =>
	residente(p.uid, {
		especie: p.especie,
		origen: p.origen,
		// el rng sirve para elegir la naturaleza; se anota para probar el determinismo
		naturaleza: p.rng.entero(0, 1000).toString(),
	});

const terminada = (
	x: EstadoExpedicion,
	estado: "victoria" | "derrota",
	dinero: number,
): EstadoExpedicion => ({ ...x, estado, dinero });

describe("equipoDeExpedicion", () => {
	const e = santuario([
		residente("r1", { especie: "abra" }),
		residente("r2", { especie: "geodude" }),
		residente("r3", { estado: "agotado" }),
		residente("r4", { estado: "sombrio", sombrio: 100 }),
		residente("r5", { estado: "visitante" }),
	]);

	it("devuelve las especies en el orden pedido", () => {
		expect(equipoDeExpedicion(e, ["r2", "r1"])).toEqual([
			{ uid: "r2", especie: "geodude" },
			{ uid: "r1", especie: "abra" },
		]);
	});

	it("exige de 1 a 6 residentes", () => {
		expect(() => equipoDeExpedicion(e, [])).toThrow(RangeError);
		const siete = santuario(
			Array.from({ length: 7 }, (_, i) => residente(`r${i}`)),
		);
		expect(() =>
			equipoDeExpedicion(
				siete,
				siete.residentes.map((r) => r.uid),
			),
		).toThrow(RangeError);
	});

	it("rechaza uid repetido, desconocido, agotado, sombrío o visitante", () => {
		for (const uids of [["r1", "r1"], ["nadie"], ["r3"], ["r4"], ["r5"]])
			expect(() => equipoDeExpedicion(e, uids)).toThrow(RangeError);
	});
});

describe("iniciarDesdeSantuario", () => {
	it("crea la expedición con los uid en cada miembro, a PS completos", () => {
		const e = santuario([residente("r1", { especie: "abra" })]);
		const x = iniciarDesdeSantuario(e, ["r1"], "sx");
		expect(x.equipo).toEqual([{ uid: "r1", especie: "abra", psPct: 100 }]);
		expect(x.estado).toBe("en-curso");
	});
});

describe("liquidarEnSantuario", () => {
	const base = santuario([
		residente("r1", { especie: "abra", tarea: { tipo: "nada" } }),
		residente("r2", { especie: "geodude" }),
	]);
	const ini = () => iniciarDesdeSantuario(base, ["r1", "r2"], "sx");

	it("una expedición en curso no se puede liquidar", () => {
		expect(() => liquidarEnSantuario(base, ini(), balance(), fabricar)).toThrow(
			RangeError,
		);
	});

	it("la victoria suma todo el dinero y la derrota la mitad", () => {
		const v = liquidarEnSantuario(
			base,
			terminada(ini(), "victoria", 101),
			balance(),
			fabricar,
		);
		expect(v.estado.recursos.pokedolares).toBe(101);
		const d = liquidarEnSantuario(
			base,
			terminada(ini(), "derrota", 101),
			balance(),
			fabricar,
		);
		expect(d.estado.recursos.pokedolares).toBe(50);
	});

	it("el miembro que volvió a 0 PS queda agotado; el sano, descansado", () => {
		const x = terminada(ini(), "derrota", 0);
		const r = liquidarEnSantuario(
			base,
			{
				...x,
				equipo: [
					{ uid: "r1", especie: "abra", psPct: 0 },
					{ uid: "r2", especie: "geodude", psPct: 40 },
				],
			},
			balance(),
			fabricar,
		);
		expect(r.estado.residentes.find((q) => q.uid === "r1")?.estado).toBe(
			"agotado",
		);
		expect(r.estado.residentes.find((q) => q.uid === "r2")?.estado).toBe(
			"descansado",
		);
	});

	it("un capturado se vuelve residente nuevo con origen captura", () => {
		const x = terminada(ini(), "victoria", 0);
		const r = liquidarEnSantuario(
			base,
			{ ...x, equipo: [...x.equipo, { especie: "zubat", psPct: 50 }] },
			balance(),
			fabricar,
		);
		const nuevo = r.estado.residentes.find((q) => q.especie === "zubat");
		expect(nuevo?.origen).toBe("captura");
		expect(nuevo?.uid).toBe(`r${base.siguienteUid}`);
		expect(r.estado.siguienteUid).toBe(base.siguienteUid + 1);
		expect(r.sinSitio).toEqual([]);
	});

	it("un Sombrío pendiente entra con Medidor 100, estado sombrío y origen rescate", () => {
		const x = terminada(ini(), "victoria", 0);
		const r = liquidarEnSantuario(
			base,
			{ ...x, pendientesPurificar: ["gastly"] },
			balance(),
			fabricar,
		);
		const s = r.estado.residentes.find((q) => q.especie === "gastly");
		expect(s).toMatchObject({
			estado: "sombrio",
			sombrio: 100,
			origen: "rescate",
		});
	});

	it("con el Santuario lleno el sobrante va a sinSitio y no se pierde en silencio", () => {
		const lleno = santuario(
			Array.from({ length: 6 }, (_, i) => residente(`r${i}`)),
		);
		const x = terminada(
			iniciarDesdeSantuario(lleno, ["r0"], "sx"),
			"victoria",
			0,
		);
		const r = liquidarEnSantuario(
			lleno,
			{ ...x, equipo: [...x.equipo, { especie: "zubat", psPct: 90 }] },
			balance(),
			fabricar,
		);
		expect(r.estado.residentes).toHaveLength(6);
		expect(r.sinSitio).toEqual(["zubat"]);
		expect(r.eventos).toContainEqual({ tipo: "sinSitio", especie: "zubat" });
	});

	it("la fábrica recibe el rng derivado de la semilla y el uid (determinista)", () => {
		const x = terminada(ini(), "victoria", 0);
		const entrada = {
			...x,
			equipo: [...x.equipo, { especie: "zubat", psPct: 50 }],
		};
		const a = liquidarEnSantuario(base, entrada, balance(), fabricar);
		const b = liquidarEnSantuario(base, entrada, balance(), fabricar);
		expect(a).toEqual(b);
		const uid = `r${base.siguienteUid}`;
		const esperado = crearRng(`${base.semilla}:residente:${uid}`)
			.entero(0, 1000)
			.toString();
		expect(a.estado.residentes.find((q) => q.uid === uid)?.naturaleza).toBe(
			esperado,
		);
	});

	it("no muta sus entradas", () => {
		const e = congelar(santuario([residente("r1")]));
		const x = congelar(
			terminada(iniciarDesdeSantuario(e, ["r1"], "sx"), "victoria", 5),
		);
		expect(() =>
			liquidarEnSantuario(e, x, congelar(balance()), fabricar),
		).not.toThrow();
	});
});
