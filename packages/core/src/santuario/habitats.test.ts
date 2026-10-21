import { describe, expect, it } from "vitest";
import { crearRng } from "../rng.js";
import {
	crearSantuario,
	type Edificio,
	type EstadoSantuario,
	type Loseta,
	type Residente,
	type SantuarioBalance,
	type TipoLoseta,
} from "./estado.js";
import type { Fabricar } from "./expedicion.js";
import {
	type ContextoJornada,
	detectarHabitats,
	type HabitatData,
} from "./habitats.js";
import {
	amanecer,
	PASOS_ALBA,
	PASOS_ATARDECER,
	resolverAtardecer,
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

/** Catálogo real de hábitats del pack. */
const HABITATS = JSON.parse(
	readFileSync(
		new URL("../../../../packs/kanto/habitats.json", import.meta.url),
		"utf8",
	),
) as HabitatData[];

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

/** Ancho y alto de la isla de pruebas (caben dos ventanas solapadas). */
const ANCHO = 5;
const ALTO = 3;

/** Loseta mínima. */
function losetaVacia(tipo: TipoLoseta = "yerma"): Loseta {
	return { tipo, edad: 0, humedad: false, encendido: false };
}

/** Traduce una clave de objeto de receta al objeto del estado. */
function aplicarObjeto(l: Loseta, clave: string): Loseta {
	if (clave === "farol-apagado")
		return { ...l, objeto: "farol", encendido: false };
	if (clave === "farol-encendido")
		return { ...l, objeto: "farol", encendido: true };
	if (clave === "fogata-encendida")
		return { ...l, objeto: "fogata", encendido: true };
	return { ...l, objeto: clave };
}

/** Construye las nueve losetas de una ventana que cumple la receta. */
function construirVentana(receta: HabitatData["receta"]): Loseta[] {
	const ventana = Array.from({ length: 9 }, () => losetaVacia());
	let k = 0;
	for (const [tipo, n] of Object.entries(receta.loseta ?? {})) {
		for (let i = 0; i < n; i++) {
			ventana[k] = losetaVacia(tipo as TipoLoseta);
			k++;
		}
	}
	for (const [clave, n] of Object.entries(receta.objetos ?? {})) {
		for (let i = 0; i < n; i++) {
			const celda = ventana[k];
			if (celda !== undefined) ventana[k] = aplicarObjeto(celda, clave);
			k++;
		}
	}
	return ventana;
}

/** Santuario de pruebas con la ventana de la receta en la esquina (0, 0). */
function montarHabitat(habitat: HabitatData): EstadoSantuario {
	const losetas = Array.from({ length: ANCHO * ALTO }, () => losetaVacia());
	const ventana = construirVentana(habitat.receta);
	for (let dy = 0; dy < 3; dy++) {
		for (let dx = 0; dx < 3; dx++) {
			const celda = ventana[dy * 3 + dx];
			if (celda !== undefined) losetas[dy * ANCHO + dx] = celda;
		}
	}
	const base = crearSantuario("semilla-habitat", balance());
	const edificios: Edificio[] = [...base.edificios];
	for (const tipo of habitat.receta.edificios ?? []) {
		edificios.push({
			uid: `ed-${tipo}`,
			tipo,
			x: 1,
			y: 1,
			nivel: 1,
			obraRestante: 0,
			resto: {},
		});
	}
	return {
		...base,
		terreno: { ancho: ANCHO, alto: ALTO, losetas },
		edificios,
	};
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

/** Santuario con los residentes y opciones indicados. */
function estadoVisitantes(
	residentes: Residente[],
	opciones: Partial<EstadoSantuario> = {},
): EstadoSantuario {
	return { ...crearSantuario("visitas", balance()), residentes, ...opciones };
}

/** Paso del Atardecer por id; falla la prueba si no existe. */
function pasoAtardecer(id: string) {
	const encontrado = PASOS_ATARDECER.find((p) => p.id === id);
	if (!encontrado) throw new Error(`no hay paso "${id}"`);
	return encontrado.paso;
}

/** Paso del Alba por id; falla la prueba si no existe. */
function pasoAlba(id: string) {
	const encontrado = PASOS_ALBA.find((p) => p.id === id);
	if (!encontrado) throw new Error(`no hay paso "${id}"`);
	return encontrado.paso;
}

/** Fábrica de la app: devuelve un residente con la especie pedida. */
const fabricar: Fabricar = (p) =>
	residente(p.uid, { especie: p.especie, origen: p.origen });

/** Contexto del Alba con un único hábitat. */
function contexto(id: string, especies: string[], raro = 1): ContextoJornada {
	return {
		habitats: [{ id, momento: "dia", especies, raro, receta: {} }],
		fabricar,
	};
}

describe("detectarHabitats", () => {
	it.each(HABITATS)(
		"encuentra el hábitat '$id' en su ventana de ejemplo",
		(habitat) => {
			const estado = montarHabitat(habitat);
			expect(detectarHabitats(estado, [habitat])).toContainEqual({
				id: habitat.id,
				x: 0,
				y: 0,
			});
		},
	);

	it("no completa un hábitat al que le falta una loseta", () => {
		const pradera = HABITATS.find((h) => h.id === "pradera-alta");
		if (!pradera) throw new Error("el pack no trae pradera-alta");
		const estado = montarHabitat(pradera);
		// Quitamos una de las cuatro hierba-alta de la ventana (celda 3 = (0, 1)).
		estado.terreno.losetas[5] = losetaVacia("yerma");
		expect(detectarHabitats(estado, [pradera])).toEqual([]);
	});

	it("una loseta solo cuenta para un hábitat", () => {
		const a: HabitatData = {
			id: "a",
			nombre: "a",
			pista: "a",
			momento: "dia",
			especies: ["x"],
			receta: { loseta: { "hierba-alta": 4 }, objetos: { flor: 1 } },
		};
		const b: HabitatData = { ...a, id: "b" };
		const base = crearSantuario("semilla-habitat", balance());
		const losetas = Array.from({ length: ANCHO * ALTO }, () => losetaVacia());
		const poner = (x: number, y: number, l: Loseta): void => {
			losetas[y * ANCHO + x] = l;
		};
		// Ventana (0,0): cuatro hierba-alta y una flor.
		poner(0, 0, losetaVacia("hierba-alta"));
		poner(1, 0, losetaVacia("hierba-alta"));
		poner(2, 0, losetaVacia("hierba-alta"));
		poner(3, 0, losetaVacia("hierba-alta"));
		poner(0, 1, losetaVacia("hierba-alta"));
		poner(2, 1, losetaVacia("hierba-alta"));
		poner(3, 1, losetaVacia("hierba-alta"));
		poner(1, 1, aplicarObjeto(losetaVacia(), "flor"));
		// Y en la ventana (1,0) bastaría para la receta B si no fuera por las
		// losetas que ya gastó A.
		poner(2, 2, aplicarObjeto(losetaVacia(), "tocon"));
		const estado: EstadoSantuario = {
			...base,
			terreno: { ancho: ANCHO, alto: ALTO, losetas },
		};
		expect(detectarHabitats(estado, [a, b]).map((h) => h.id)).toEqual(["a"]);
	});

	it("es determinista y no muta el estado congelado", () => {
		const pradera = HABITATS.find((h) => h.id === "pradera-alta");
		if (!pradera) throw new Error("el pack no trae pradera-alta");
		const estado = congelar(montarHabitat(pradera));
		const uno = detectarHabitats(estado, [pradera]);
		const otro = detectarHabitats(estado, [pradera]);
		expect(uno).toEqual(otro);
	});
});

describe("paso habitats", () => {
	it("marca los completos, los descubre y avisa solo la primera vez", () => {
		const pradera = HABITATS.find((h) => h.id === "pradera-alta");
		if (!pradera) throw new Error("el pack no trae pradera-alta");
		const estado = montarHabitat(pradera);
		const ctx: ContextoJornada = { habitats: [pradera], fabricar };
		const r1 = pasoAtardecer("habitats")(estado, balance(), crearRng("p"), ctx);
		expect(r1.estado.habitatsCompletos).toEqual([
			{ id: "pradera-alta", x: 0, y: 0 },
		]);
		expect(r1.estado.habitatsDescubiertos).toEqual(["pradera-alta"]);
		expect(r1.estado.habitatsPendientes).toEqual(["pradera-alta"]);
		expect(r1.eventos).toEqual([
			{ tipo: "habitatNuevo", id: "pradera-alta", x: 0, y: 0 },
		]);

		const r2 = pasoAtardecer("habitats")(
			r1.estado,
			balance(),
			crearRng("p"),
			ctx,
		);
		expect(r2.eventos).toEqual([]);
		expect(r2.estado.habitatsPendientes).toEqual(["pradera-alta"]);
	});

	it("sin contexto no hace nada", () => {
		const pradera = HABITATS.find((h) => h.id === "pradera-alta");
		if (!pradera) throw new Error("el pack no trae pradera-alta");
		const estado = montarHabitat(pradera);
		const r = pasoAtardecer("habitats")(
			estado,
			balance(),
			crearRng("p"),
			undefined,
		);
		expect(r.estado.habitatsCompletos).toEqual([]);
		expect(r.eventos).toEqual([]);
	});

	it("el Atardecer completo reenvía el contexto y avisa del hábitat nuevo", () => {
		const pradera = HABITATS.find((h) => h.id === "pradera-alta");
		if (!pradera) throw new Error("el pack no trae pradera-alta");
		const estado = montarHabitat(pradera);
		estado.momento = "atardecer";
		const r = resolverAtardecer(estado, balance(), {
			habitats: [pradera],
			fabricar,
		});
		expect(r.estado.habitatsCompletos).toEqual([
			{ id: "pradera-alta", x: 0, y: 0 },
		]);
		expect(r.eventos).toContainEqual({
			tipo: "habitatNuevo",
			id: "pradera-alta",
			x: 0,
			y: 0,
		});
	});

	it("no muta el estado ni el contexto congelados", () => {
		const pradera = HABITATS.find((h) => h.id === "pradera-alta");
		if (!pradera) throw new Error("el pack no trae pradera-alta");
		const estado = montarHabitat(pradera);
		estado.momento = "noche";
		estado.habitatsPendientes = ["pradera-alta"];
		const congelado = congelar(estado);
		const ctx = congelar({ habitats: [pradera], fabricar });
		expect(() => detectarHabitats(congelado, ctx.habitats)).not.toThrow();
		expect(() =>
			pasoAtardecer("habitats")(
				congelado,
				congelar(balance()),
				crearRng("p"),
				ctx,
			),
		).not.toThrow();
		expect(() => amanecer(congelado, congelar(balance()), ctx)).not.toThrow();
	});
});

describe("visitantes del Atardecer", () => {
	const visitante = (opciones: Partial<Residente> = {}): Residente =>
		residente("r1", {
			estado: "visitante",
			visitanteRestante: 3,
			habitat: "pradera-alta",
			hambre: 80,
			...opciones,
		});

	const intacto = { habitatsCompletos: [{ id: "pradera-alta", x: 0, y: 0 }] };

	it("se queda tras 3 Atardeceres con el hábitat intacto, Hambre y Armonía altas", () => {
		let e = estadoVisitantes([visitante()], { armonia: 60, ...intacto });
		const eventos: unknown[] = [];
		for (let i = 0; i < 3; i++) {
			const r = pasoAtardecer("visitantes-atardecer")(
				e,
				balance(),
				crearRng("prueba"),
			);
			e = r.estado;
			eventos.push(...r.eventos);
		}
		expect(e.residentes[0]).toMatchObject({
			uid: "r1",
			estado: "descansado",
			origen: "habitat",
			visitanteRestante: 0,
		});
		expect(eventos).toEqual([{ tipo: "visitanteSeQueda", uid: "r1" }]);
	});

	it("se va si el hábitat se rompe", () => {
		const e = estadoVisitantes([visitante()], { armonia: 60 });
		const r = pasoAtardecer("visitantes-atardecer")(
			e,
			balance(),
			crearRng("prueba"),
		);
		expect(r.eventos).toEqual([
			{ tipo: "visitanteSeVa", uid: "r1", motivo: "habitat" },
		]);
		expect(r.estado.residentes).toEqual([]);
	});

	it("se va si el Hambre baja de 50", () => {
		const e = estadoVisitantes([visitante({ hambre: 49 })], {
			armonia: 60,
			...intacto,
		});
		const r = pasoAtardecer("visitantes-atardecer")(
			e,
			balance(),
			crearRng("prueba"),
		);
		expect(r.eventos).toEqual([
			{ tipo: "visitanteSeVa", uid: "r1", motivo: "hambre" },
		]);
	});

	it("se va si la Armonía baja de 40", () => {
		const e = estadoVisitantes([visitante()], { armonia: 39, ...intacto });
		const r = pasoAtardecer("visitantes-atardecer")(
			e,
			balance(),
			crearRng("prueba"),
		);
		expect(r.eventos).toEqual([
			{ tipo: "visitanteSeVa", uid: "r1", motivo: "armonia" },
		]);
	});

	it("se va sin sitio si no cabe como residente", () => {
		const llenos = Array.from({ length: 6 }, (_, i) => residente(`c${i}`));
		let e = estadoVisitantes([...llenos, visitante()], {
			armonia: 60,
			...intacto,
		});
		for (let i = 0; i < 2; i++) {
			e = pasoAtardecer("visitantes-atardecer")(
				e,
				balance(),
				crearRng("prueba"),
			).estado;
		}
		const r = pasoAtardecer("visitantes-atardecer")(
			e,
			balance(),
			crearRng("prueba"),
		);
		expect(r.eventos).toEqual([
			{ tipo: "visitanteSeVa", uid: "r1", motivo: "sinSitio" },
		]);
		expect(r.estado.residentes.some((x) => x.uid === "r1")).toBe(false);
	});
});

describe("visitantes del Alba", () => {
	it("solo llegan especies del pack (`especiesDisponibles`): las demás se ignoran y el hábitat sigue pendiente", () => {
		const e = estadoVisitantes([], {
			momento: "noche",
			habitatsPendientes: ["pradera-alta"],
		});
		const ctx = (disponibles: string[]): ContextoJornada => ({
			...contexto("pradera-alta", ["oddish", "pidgey", "pikachu"]),
			especiesDisponibles: disponibles,
		});
		const sinNinguna = amanecer(e, balance(), ctx(["abra"]));
		expect(sinNinguna.estado.residentes).toEqual([]);
		expect(sinNinguna.estado.habitatsPendientes).toEqual(["pradera-alta"]);
		const conUna = amanecer(e, balance(), ctx(["abra", "pikachu"]));
		expect(conUna.estado.residentes.map((r) => r.especie)).toEqual(["pikachu"]);
	});

	it("con Bosque libre llega un visitante extra cada 4 jornadas, sin hábitat pendiente", () => {
		const ctx = (): ContextoJornada => ({
			...contexto("pradera-alta", ["pikachu"]),
			especiesDisponibles: ["pikachu", "eevee", "abra"],
		});
		const jornadasConExtra = (codigos?: EstadoSantuario["codigos"]) => {
			const hay: number[] = [];
			for (let j = 1; j <= 8; j++) {
				const e = estadoVisitantes([], {
					momento: "noche",
					jornada: j,
					...(codigos !== undefined && { codigos }),
				});
				const r = amanecer(e, balance(), ctx());
				if (
					r.eventos.some(
						(x) => (x as { habitat?: string }).habitat === "bosque-libre",
					)
				)
					hay.push(j);
			}
			return hay;
		};
		expect(jornadasConExtra()).toEqual([]);
		expect(jornadasConExtra({ 3: "A" })).toEqual([]); // Cosecha abundante no trae visitantes
		const hay = jornadasConExtra({ 3: "B" });
		expect(hay).toHaveLength(2);
		expect((hay[1] as number) - (hay[0] as number)).toBe(4);
	});

	it("el visitante extra de Bosque libre es determinista y es un visitante normal", () => {
		const e = estadoVisitantes([], {
			momento: "noche",
			jornada: 3, // el Alba siguiente es la jornada 4
			codigos: { 3: "B" },
		});
		const ctx: ContextoJornada = {
			...contexto("pradera-alta", ["pikachu"]),
			especiesDisponibles: ["pikachu", "eevee"],
		};
		const r1 = amanecer(congelar(e), balance(), ctx);
		const r2 = amanecer(congelar(e), balance(), ctx);
		expect(r1).toEqual(r2);
		expect(r1.estado.residentes).toHaveLength(1);
		expect(r1.estado.residentes[0]).toMatchObject({
			estado: "visitante",
			visitanteRestante: 3,
			origen: "habitat",
		});
	});

	it("crea un visitante determinista y prefiere las especies no vistas", () => {
		const e = estadoVisitantes([], {
			momento: "noche",
			jornada: 1,
			habitatsPendientes: ["pradera-alta"],
			vistas: ["eevee"],
		});
		const congelado = congelar(e);
		const r1 = amanecer(
			congelado,
			balance(),
			contexto("pradera-alta", ["pikachu", "eevee"]),
		);
		const r2 = amanecer(
			congelado,
			balance(),
			contexto("pradera-alta", ["pikachu", "eevee"]),
		);
		expect(r1).toEqual(r2);
		expect(r1.estado.residentes).toHaveLength(1);
		expect(r1.estado.residentes[0]).toMatchObject({
			uid: "r2",
			especie: "pikachu",
			estado: "visitante",
			visitanteRestante: 3,
			origen: "habitat",
			habitat: "pradera-alta",
		});
		expect(r1.estado.habitatsPendientes).toEqual([]);
		expect(r1.estado.vistas).toEqual(["eevee", "pikachu"]);
		expect(r1.eventos).toEqual([
			{
				tipo: "visitanteLlega",
				uid: "r2",
				especie: "pikachu",
				habitat: "pradera-alta",
			},
		]);
	});

	it("si el sorteo de 'raro' no pasa, el hábitat sigue pendiente", () => {
		const e = estadoVisitantes([], {
			momento: "noche",
			jornada: 1,
			habitatsPendientes: ["estanque-profundo"],
		});
		const r = amanecer(
			e,
			balance(),
			contexto("estanque-profundo", ["dratini"], 0),
		);
		expect(r.estado.residentes).toEqual([]);
		expect(r.estado.habitatsPendientes).toEqual(["estanque-profundo"]);
		expect(r.eventos).toEqual([]);
	});

	it("sin contexto no crea visitantes ni lanza", () => {
		const e = congelar(
			estadoVisitantes([], {
				momento: "noche",
				jornada: 1,
				habitatsPendientes: ["pradera-alta"],
			}),
		);
		const r = amanecer(e, balance());
		expect(r.estado.residentes).toEqual([]);
		expect(r.estado.habitatsPendientes).toEqual(["pradera-alta"]);
		expect(r.eventos).toEqual([]);
	});

	it("el paso 'visitantes' del Alba está registrado", () => {
		expect(pasoAlba("visitantes")).toBeTypeOf("function");
	});
});
