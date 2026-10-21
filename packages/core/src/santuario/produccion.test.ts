import { describe, expect, it } from "vitest";
import { crearRng } from "../rng.js";
import {
	crearSantuario,
	type Edificio,
	type EstadoSantuario,
	type Residente,
	type SantuarioBalance,
	type Tarea,
} from "./estado.js";
import { amanecer, type Resultado, resolverAtardecer } from "./jornada.js";
import { pasoProduccion } from "./produccion.js";

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
const rng = () => crearRng("prueba:produccion");

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

function estado(
	residentes: Residente[] = [],
	opciones: Partial<EstadoSantuario> = {},
): EstadoSantuario {
	return { ...crearSantuario("s1", balance()), residentes, ...opciones };
}

function conEdificio(
	e: EstadoSantuario,
	tipo: string,
	uid: string,
	opciones: Partial<Edificio> = {},
): EstadoSantuario {
	const edificio: Edificio = {
		uid,
		tipo,
		x: 0,
		y: 0,
		nivel: 1,
		obraRestante: 0,
		resto: {},
		...opciones,
	};
	return { ...e, edificios: [...e.edificios, edificio] };
}

const trabajo = (edificio: string): Tarea => ({ tipo: "trabajo", edificio });
const construir = (edificio: string): Tarea => ({
	tipo: "construir",
	edificio,
});

function resolver(e: EstadoSantuario, b: SantuarioBalance): Resultado {
	return resolverAtardecer({ ...e, momento: "atardecer" }, b);
}

function edificioDe(e: EstadoSantuario, uid: string): Edificio {
	const ed = e.edificios.find((x) => x.uid === uid);
	if (ed === undefined) throw new Error(`falta el edificio ${uid}`);
	return ed;
}

describe("pasoProduccion", () => {
	it("produce más quien prefiere el trabajo, según la fórmula del balance", () => {
		const b = balance();
		// 3 (base) x 1 (nivel 1) x 1,5 (preferido) x (0,5 + 60/100) = 4,95.
		const prefiere = conEdificio(
			estado([
				residente("r1", { preferidos: ["cultivar"], tarea: trabajo("ed2") }),
			]),
			"huerto-bayas",
			"ed2",
		);
		const prefiereR = resolver(prefiere, b);
		expect(prefiereR.estado.recursos["baya:neutro"]).toBe(24);
		expect(
			edificioDe(prefiereR.estado, "ed2").resto["baya:neutro"],
		).toBeCloseTo(0.95, 10);

		// 3 x 1 x 1 x (0,5 + 0,6) = 3,3.
		const noPrefiere = conEdificio(
			estado([residente("r1", { tarea: trabajo("ed2") })]),
			"huerto-bayas",
			"ed2",
		);
		const noPrefiereR = resolver(noPrefiere, b);
		expect(noPrefiereR.estado.recursos["baya:neutro"]).toBe(23);
		expect(
			edificioDe(noPrefiereR.estado, "ed2").resto["baya:neutro"],
		).toBeCloseTo(0.3, 10);

		expect(noPrefiereR.estado.recursos["baya:neutro"]).toBeLessThan(
			prefiereR.estado.recursos["baya:neutro"] ?? 0,
		);
	});

	it("aplica nivel, Especialidad afín, Armonía alta, Inquietud y Charla", () => {
		const base = conEdificio(
			estado([residente("r1", { tarea: trabajo("ed2"), animo: 100 })], {
				recursos: {},
				armonia: 80,
			}),
			"huerto-bayas",
			"ed2",
			{ nivel: 2 },
		);
		// 3 x 1,5 (nivel 2) x 1 x (0,5 + 1) x 1,2 (Armonía alta) = 8,1.
		const sinAfin = resolver(base, balance());
		expect(sinAfin.estado.recursos["baya:neutro"]).toBe(8);
		expect(edificioDe(sinAfin.estado, "ed2").resto["baya:neutro"]).toBeCloseTo(
			0.1,
			10,
		);

		const afinDeVerdad = resolver(
			{
				...base,
				residentes: base.residentes.map((r) => ({
					...r,
					especialidades: { regar: 1 },
				})),
			},
			balance(),
		);
		// 3 x 1,5 x 1,5 x 1,25 x 1,2 = 10,125.
		expect(afinDeVerdad.estado.recursos["baya:neutro"]).toBe(10);
		expect(
			edificioDe(afinDeVerdad.estado, "ed2").resto["baya:neutro"],
		).toBeCloseTo(0.125, 10);

		const inquieto = resolver(
			{
				...base,
				residentes: base.residentes.map((r) => ({
					...r,
					especialidades: { regar: 1 },
					diasInquieto: 2,
				})),
			},
			balance(),
		);
		// 10,125 x 0,5 (Inquietud).
		expect(inquieto.estado.recursos["baya:neutro"]).toBe(5);

		const charla = resolver({ ...base, temaCharla: "trabajo" }, balance());
		// 3 x 1,5 x 1,5 x 1,2 x 1,25 = 10,125.
		expect(charla.estado.recursos["baya:neutro"]).toBe(10);
	});

	it("no produce un agotado, un edificio en obra ni un edificio inexistente", () => {
		const b = balance();
		const agotado = resolver(
			conEdificio(
				estado([residente("r1", { estado: "agotado", tarea: trabajo("ed2") })]),
				"huerto-bayas",
				"ed2",
			),
			b,
		);
		expect(agotado.estado.recursos["baya:neutro"]).toBe(20);
		expect(agotado.estado.residentes[0]?.trabajoHoy).toBe("ninguno");

		const obra = resolver(
			conEdificio(
				estado([residente("r1", { tarea: trabajo("ed2") })]),
				"huerto-bayas",
				"ed2",
				{ obraRestante: 2 },
			),
			b,
		);
		expect(obra.estado.recursos["baya:neutro"]).toBe(20);
		expect(obra.estado.residentes[0]?.trabajoHoy).toBe("ninguno");

		const fantasma = resolver(
			estado([residente("r1", { tarea: trabajo("ed99") })]),
			b,
		);
		expect(fantasma.estado.recursos["baya:neutro"]).toBe(20);
		expect(fantasma.estado.residentes[0]?.trabajoHoy).toBe("ninguno");
	});

	it("acumula los restos decimales sin perder unidades", () => {
		const b = balance();
		const aserradero = b.edificios.find((d) => d.id === "aserradero");
		if (aserradero?.produce === undefined)
			throw new Error("falta el aserradero");
		aserradero.produce.base = 0.6;
		// 0,6 x 1 x 1 x (0,5 + 0/100) = 0,3 por jornada.
		let e = conEdificio(
			estado([residente("r1", { animo: 0, tarea: trabajo("ed2") })], {
				recursos: {},
			}),
			"aserradero",
			"ed2",
		);
		for (let i = 0; i < 100; i++) {
			e = pasoProduccion(e, b, rng()).estado;
		}
		expect(e.recursos.madera).toBeCloseTo(30, 0);
		expect(edificioDe(e, "ed2").resto.madera).toBeGreaterThanOrEqual(0);
		expect(edificioDe(e, "ed2").resto.madera).toBeLessThan(1);
	});

	it("respeta el tope del Almacén, avisa de lo perdido y sube con el nivel 2", () => {
		const b = balance();
		const bayas = conEdificio(
			estado(
				[residente("r1", { preferidos: ["cultivar"], tarea: trabajo("ed2") })],
				{
					recursos: { "baya:neutro": 49 },
				},
			),
			"huerto-bayas",
			"ed2",
		);
		const sinAlmacen = resolver(bayas, b);
		expect(sinAlmacen.estado.recursos["baya:neutro"]).toBe(50);
		expect(sinAlmacen.eventos).toContainEqual({
			tipo: "recursoPerdido",
			recurso: "baya:neutro",
			cantidad: 3,
		});

		const conAlmacen = resolver(
			conEdificio(bayas, "almacen", "ed3", { nivel: 2 }),
			b,
		);
		expect(conAlmacen.estado.recursos["baya:neutro"]).toBe(53);
		expect(conAlmacen.eventos.some((x) => x.tipo === "recursoPerdido")).toBe(
			false,
		);

		const madera = resolver(
			conEdificio(
				estado(
					[residente("r1", { preferidos: ["aserrar"], tarea: trabajo("ed2") })],
					{ recursos: { madera: 49 } },
				),
				"aserradero",
				"ed2",
			),
			b,
		);
		expect(madera.estado.recursos.madera).toBe(50);
		expect(madera.eventos).toContainEqual({
			tipo: "recursoPerdido",
			recurso: "madera",
			cantidad: 2,
		});
	});

	it("reparte el recorte de bayas empezando por el sabor con más existencias", () => {
		const b = balance();
		const r = resolver(
			estado([], {
				recursos: {
					"baya:dulce": 6,
					"baya:acido": 4,
					"baya:seco": 30,
					"baya:neutro": 20,
				},
			}),
			b,
		);
		expect(r.estado.recursos["baya:seco"]).toBe(20);
		expect(r.estado.recursos["baya:neutro"]).toBe(20);
		expect(r.eventos).toContainEqual({
			tipo: "recursoPerdido",
			recurso: "baya:seco",
			cantidad: 10,
		});
	});

	it("suma el mineral esperado de la Cantera, sin azar", () => {
		const b = balance();
		const cantera = conEdificio(
			estado(
				[
					residente("r1", {
						tipos: ["rock"],
						preferidos: ["minar"],
						animo: 0,
						tarea: trabajo("ed2"),
					}),
				],
				{ recursos: {} },
			),
			"cantera",
			"ed2",
		);
		let e = cantera;
		for (let i = 0; i < 5; i++) {
			e = pasoProduccion(e, b, rng()).estado;
		}
		// 0,2 por trabajador y jornada, sin tirada de azar.
		expect(e.recursos.mineral).toBe(1);

		const agua = pasoProduccion(
			conEdificio(
				estado(
					[
						residente("r1", {
							tipos: ["water"],
							animo: 0,
							tarea: trabajo("ed2"),
						}),
					],
					{ recursos: {} },
				),
				"cantera",
				"ed2",
			),
			b,
			rng(),
		);
		expect(agua.estado.recursos.mineral).toBeUndefined();
	});

	it("marca trabajoHoy en cada residente", () => {
		const b = balance();
		const r = resolver(
			conEdificio(
				conEdificio(
					estado([
						residente("r1", {
							preferidos: ["cultivar"],
							tarea: trabajo("ed2"),
						}),
						residente("r2", { tarea: trabajo("ed2") }),
						residente("r3", {
							especialidades: { construir: 1 },
							tarea: construir("ed3"),
						}),
						residente("r4", { tarea: construir("ed3") }),
					]),
					"huerto-bayas",
					"ed2",
				),
				"almacen",
				"ed3",
				{ obraRestante: 4 },
			),
			b,
		);
		const marcas = r.estado.residentes.map((x) => [x.uid, x.trabajoHoy]);
		expect(marcas).toEqual([
			["r1", "preferido"],
			["r2", "no-preferido"],
			["r3", "preferido"],
			["r4", "no-preferido"],
		]);
	});

	it("no muta el estado congelado y es determinista", () => {
		const b = congelar(balance());
		const e = congelar(
			conEdificio(
				estado([residente("r1", { tarea: trabajo("ed2") })]),
				"huerto-bayas",
				"ed2",
			),
		);
		const uno = resolver(e, b);
		const dos = resolver(e, b);
		expect(uno).toEqual(dos);
		expect(uno.estado.recursos["baya:neutro"]).toBe(23);
	});
});

describe("pasoObra", () => {
	it("termina en ceil(obra / obraDiaria) con uno y con dos constructores", () => {
		const b = balance();
		let e = conEdificio(
			estado([residente("r1", { tarea: construir("ed2") })], { recursos: {} }),
			"huerto-bayas",
			"ed2",
			{ obraRestante: 6 },
		);
		let eventos: string[] = [];
		let jornadas = 0;
		while (edificioDe(e, "ed2").obraRestante > 0) {
			const r = resolver(e, b);
			e = amanecer(r.estado, b).estado;
			eventos = r.eventos.map((x) => x.tipo);
			jornadas++;
			if (jornadas > 10) throw new Error("la obra no termina");
		}
		expect(jornadas).toBe(3);
		expect(eventos).toContain("obraTerminada");
		expect(edificioDe(e, "ed2").obraRestante).toBe(0);

		let dos = conEdificio(
			estado(
				[
					residente("r1", { tarea: construir("ed2") }),
					residente("r2", { tarea: construir("ed2") }),
				],
				{ recursos: {} },
			),
			"huerto-bayas",
			"ed2",
			{ obraRestante: 6 },
		);
		jornadas = 0;
		while (edificioDe(dos, "ed2").obraRestante > 0) {
			const r = resolver(dos, b);
			dos = amanecer(r.estado, b).estado;
			eventos = r.eventos.map((x) => x.tipo);
			jornadas++;
			if (jornadas > 10) throw new Error("la obra no termina");
		}
		expect(jornadas).toBe(2);
		expect(eventos).toContain("obraTerminada");
	});

	it("acelera la obra con Especialidad y con la Charla de raíces", () => {
		const b = balance();
		const dos = conEdificio(
			estado(
				[
					residente("r1", {
						especialidades: { construir: 1 },
						tarea: construir("ed2"),
					}),
					residente("r2", { tarea: construir("ed2") }),
				],
				{ recursos: {}, temaCharla: "raices" },
			),
			"huerto-bayas",
			"ed2",
			{ obraRestante: 6 },
		);
		// (2 + 1 + 2) + (2 + 0 + 2) = 9: termina el primer Atardecer.
		const r = resolver(dos, b);
		expect(edificioDe(r.estado, "ed2").obraRestante).toBe(0);
		expect(r.eventos).toContainEqual({
			tipo: "obraTerminada",
			uid: "ed2",
			edificio: "huerto-bayas",
		});
	});

	it("ignora constructores apuntando a un edificio inexistente", () => {
		const b = balance();
		const r = resolver(
			estado([residente("r1", { tarea: construir("ed99") })], {
				recursos: {},
			}),
			b,
		);
		expect(r.eventos.some((x) => x.tipo === "obraTerminada")).toBe(false);
	});
});

describe("obra y producción en la misma jornada", () => {
	it("el edificio terminado hoy no produce hasta la jornada siguiente", () => {
		const b = balance();
		const e = conEdificio(
			estado(
				[
					residente("r1", { preferidos: ["cultivar"], tarea: trabajo("ed2") }),
					residente("r2", { tarea: construir("ed2") }),
				],
				{ recursos: {} },
			),
			"huerto-bayas",
			"ed2",
			{ obraRestante: 2 },
		);
		const hoy = resolver(e, b);
		expect(edificioDe(hoy.estado, "ed2").obraRestante).toBe(0);
		expect(hoy.eventos).toContainEqual({
			tipo: "obraTerminada",
			uid: "ed2",
			edificio: "huerto-bayas",
		});
		expect(hoy.estado.recursos["baya:neutro"]).toBeUndefined();

		const manana = resolver(amanecer(hoy.estado, b).estado, b);
		expect(manana.estado.recursos["baya:neutro"]).toBeGreaterThan(0);
	});
});

describe("efectos de los Códigos del Altar", () => {
	/** Un aserradero con producción base 10 y un residente con Ánimo 0: 10 × 0,5 = 5 de madera por jornada. */
	const conTrabajador = (codigos?: EstadoSantuario["codigos"]) => {
		const b = balance();
		const aserradero = b.edificios.find((d) => d.id === "aserradero");
		if (aserradero?.produce === undefined)
			throw new Error("falta el aserradero");
		aserradero.produce.base = 10;
		const e = conEdificio(
			estado([residente("r1", { animo: 0, tarea: trabajo("ed2") })], {
				recursos: {},
				...(codigos !== undefined && { codigos }),
			}),
			"aserradero",
			"ed2",
		);
		return { b, e };
	};

	it("sin Códigos la producción es la de siempre", () => {
		const { b, e } = conTrabajador();
		expect(pasoProduccion(e, b, rng()).estado.recursos.madera).toBe(5);
	});

	it("Manos ocupadas (×1,2) y Ritmo propio (×0,9) multiplican la producción", () => {
		const a = conTrabajador({ 1: "A" });
		expect(pasoProduccion(a.e, a.b, rng()).estado.recursos.madera).toBe(6);
		const bb = conTrabajador({ 1: "B" });
		const r = pasoProduccion(bb.e, bb.b, rng()).estado;
		expect(r.recursos.madera).toBe(4); // 4,5: el medio se queda de resto
		expect(edificioDe(r, "ed2").resto.madera).toBeCloseTo(0.5, 5);
	});

	it("Cosecha abundante (×1,3) solo afecta al Huerto, no al aserradero", () => {
		const { b, e } = conTrabajador({ 3: "A" });
		expect(pasoProduccion(e, b, rng()).estado.recursos.madera).toBe(5);
		const huertoB = balance();
		const huerto = huertoB.edificios.find((d) => d.id === "huerto-bayas");
		if (huerto?.produce === undefined) throw new Error("falta el huerto");
		huerto.produce.base = 10;
		const h = (codigos?: EstadoSantuario["codigos"]) =>
			pasoProduccion(
				conEdificio(
					estado([residente("r1", { animo: 0, tarea: trabajo("ed2") })], {
						recursos: {},
						...(codigos !== undefined && { codigos }),
					}),
					"huerto-bayas",
					"ed2",
				),
				huertoB,
				rng(),
			).estado.recursos["baya:neutro"];
		expect(h()).toBe(5);
		expect(h({ 3: "A" })).toBe(6); // 5 × 1,3 = 6,5
	});
});

describe("Ánimo por jornada de los Códigos", () => {
	it("Manos ocupadas resta 3 y Ritmo propio suma 5 al Ánimo de cada residente", () => {
		const animo = (codigos?: EstadoSantuario["codigos"]) =>
			resolverAtardecer(
				estado([residente("r1", { animo: 60 })], {
					momento: "atardecer",
					...(codigos !== undefined && { codigos }),
				}),
				balance(),
			).estado.residentes[0]?.animo as number;
		const base = animo();
		expect(animo({ 1: "A" })).toBeCloseTo(base - 3, 5);
		expect(animo({ 1: "B" })).toBeCloseTo(base + 5, 5);
	});
});
