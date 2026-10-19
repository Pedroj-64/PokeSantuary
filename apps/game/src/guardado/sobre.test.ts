import { describe, expect, it } from "vitest";
import {
	canonico,
	desempaquetar,
	ErrorGuardado,
	empaquetar,
	type Opciones,
} from "./sobre.js";

type PartidaV2 = { jornada: number; oro: number };

const opciones: Opciones<PartidaV2> = {
	versionActual: 2,
	migraciones: {
		// v1 guardaba `dinero`; v2 lo llama `oro`
		1: (v) => {
			const { dinero, ...resto } = v as { dinero: number; jornada: number };
			return { ...resto, oro: dinero };
		},
	},
	validar: (x) => {
		const p = x as Partial<PartidaV2>;
		if (typeof p.jornada !== "number" || typeof p.oro !== "number")
			throw new Error("partida inválida");
		return p as PartidaV2;
	},
};

const codigoDe = async (texto: string, o = opciones): Promise<string> => {
	try {
		await desempaquetar(texto, o);
	} catch (e) {
		if (e instanceof ErrorGuardado) return e.codigo;
		throw e;
	}
	return "ok";
};

describe("canonico", () => {
	it("ordena las claves y no depende del orden de inserción", () => {
		expect(canonico({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(
			canonico({ a: [{ c: 2, d: 1 }], b: 1 }),
		);
		expect(canonico({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
	});
});

describe("sobre de guardado", () => {
	it("ida y vuelta: lo guardado se lee igual", async () => {
		const partida: PartidaV2 = { jornada: 7, oro: 30 };
		const texto = await empaquetar(partida, 2);
		expect(await desempaquetar(texto, opciones)).toEqual(partida);
	});

	it("la suma no depende del orden de las claves de la partida", async () => {
		const a = JSON.parse(await empaquetar({ jornada: 1, oro: 2 }, 2));
		const b = JSON.parse(await empaquetar({ oro: 2, jornada: 1 }, 2));
		expect(a.suma).toBe(b.suma);
	});

	it("las propiedades undefined no rompen la suma (el JSON las omite al guardar)", async () => {
		const partida = {
			jornada: 3,
			oro: 1,
			expedicion: undefined,
			tema: undefined,
		};
		const texto = await empaquetar(partida, 2);
		expect(await desempaquetar(texto, opciones)).toEqual({
			jornada: 3,
			oro: 1,
		});
	});

	it("un byte cambiado en la partida da 'corrupto'", async () => {
		const texto = await empaquetar({ jornada: 7, oro: 30 }, 2);
		expect(await codigoDe(texto.replace('"oro":30', '"oro":31'))).toBe(
			"corrupto",
		);
	});

	it("una suma alterada da 'corrupto'", async () => {
		const obj = JSON.parse(await empaquetar({ jornada: 7, oro: 30 }, 2));
		obj.suma = obj.suma.replace(/^./, obj.suma[0] === "0" ? "1" : "0");
		expect(await codigoDe(JSON.stringify(obj))).toBe("corrupto");
	});

	it("texto que no es JSON o que no es nuestro formato da 'formato'", async () => {
		expect(await codigoDe("esto no es json")).toBe("formato");
		expect(await codigoDe("[]")).toBe("formato");
		expect(await codigoDe('{"formato":"otro","version":1}')).toBe("formato");
		expect(
			await codigoDe(
				'{"formato":"ecos-del-santuario","version":"2","suma":"x","partida":{}}',
			),
		).toBe("formato");
	});

	it("una versión futura se rechaza sin migrar", async () => {
		const texto = await empaquetar({ jornada: 1, oro: 1 }, 3);
		expect(await codigoDe(texto)).toBe("version-futura");
	});

	it("una versión vieja migra con la cadena de migraciones", async () => {
		const texto = await empaquetar({ jornada: 4, dinero: 12 }, 1);
		expect(await desempaquetar(texto, opciones)).toEqual({
			jornada: 4,
			oro: 12,
		});
	});

	it("falta una migración intermedia: 'migracion'", async () => {
		const texto = await empaquetar({ jornada: 4, dinero: 12 }, 1);
		expect(await codigoDe(texto, { ...opciones, migraciones: {} })).toBe(
			"migracion",
		);
	});

	it("una partida que no valida da 'invalido' aunque la suma cuadre", async () => {
		const texto = await empaquetar({ jornada: "x" }, 2);
		expect(await codigoDe(texto)).toBe("invalido");
	});

	it("versión 0 o negativa o no entera se rechaza al empaquetar", async () => {
		for (const v of [0, -1, 1.5])
			await expect(empaquetar({}, v)).rejects.toThrow(RangeError);
	});
});
