import { describe, expect, it } from "vitest";
import { resumenDeJornada } from "./resumen.js";

const nombre = (uid: string) => `N(${uid})`;

describe("resumenDeJornada", () => {
	it("una jornada sin novedades da un resumen vacío", () => {
		expect(resumenDeJornada([], { madera: 5 }, { madera: 5 }, nombre)).toEqual(
			[],
		);
	});

	it("la producción sale de la diferencia de recursos, solo lo que sube", () => {
		const lineas = resumenDeJornada(
			[],
			{ madera: 5, piedra: 9, "baya:neutro": 20 },
			{ madera: 9, piedra: 9, "baya:neutro": 14, mineral: 1 },
			nombre,
		);
		expect(lineas).toContainEqual({
			clave: "santuario.resumen.produccion",
			params: { recurso: "madera", n: 4 },
		});
		expect(lineas).toContainEqual({
			clave: "santuario.resumen.produccion",
			params: { recurso: "mineral", n: 1 },
		});
		expect(lineas.some((l) => l.params?.recurso === "piedra")).toBe(false);
	});

	it("las bayas de todos los sabores cuentan juntas, y bajan al comer sin salir como producción", () => {
		const lineas = resumenDeJornada(
			[],
			{ "baya:dulce": 3, "baya:seco": 3 },
			{ "baya:dulce": 8, "baya:seco": 1 },
			nombre,
		);
		expect(
			lineas.filter((l) => l.clave === "santuario.resumen.produccion"),
		).toEqual([
			{
				clave: "santuario.resumen.produccion",
				params: { recurso: "baya", n: 3 },
			},
		]);
	});

	it("traduce los eventos del núcleo a líneas con nombres legibles", () => {
		const lineas = resumenDeJornada(
			[
				{ tipo: "obraTerminada", uid: "ed2", edificio: "cantera" },
				{ tipo: "habitatNuevo", id: "orilla", x: 1, y: 2 },
				{ tipo: "avisoInquietud", uid: "r2" },
				{ tipo: "seVa", uid: "r3" },
				{ tipo: "sinBayas", uid: "r4" },
				{ tipo: "sinBayas", uid: "r5" },
				{ tipo: "recursoPerdido", recurso: "madera", cantidad: 7 },
				{
					tipo: "visitanteLlega",
					uid: "r9",
					especie: "psyduck",
					habitat: "orilla",
				},
				{ tipo: "visitanteSeQueda", uid: "r9" },
				{ tipo: "visitanteSeVa", uid: "r8", motivo: "hambre" },
				{
					tipo: "residenteNuevo",
					uid: "r10",
					especie: "zubat",
					origen: "captura",
				},
				{ tipo: "terrenoCambiado", x: 1, y: 1, de: "yerma", a: "tierra" },
				{ tipo: "terrenoCambiado", x: 2, y: 1, de: "yerma", a: "tierra" },
			],
			{},
			{},
			nombre,
		);
		const por = (c: string) => lineas.filter((l) => l.clave === c);
		expect(por("santuario.resumen.obra")[0]?.params).toEqual({
			edificio: "cantera",
		});
		expect(por("santuario.resumen.habitat")[0]?.params).toEqual({
			habitat: "orilla",
		});
		expect(por("santuario.resumen.inquietud")[0]?.params).toEqual({
			nombre: "N(r2)",
		});
		expect(por("santuario.resumen.seVa")[0]?.params).toEqual({
			nombre: "N(r3)",
		});
		expect(por("santuario.resumen.sinBayas")[0]?.params).toEqual({ n: 2 });
		expect(por("santuario.resumen.perdido")[0]?.params).toEqual({
			recurso: "madera",
			n: 7,
		});
		expect(por("santuario.resumen.visitanteLlega")[0]?.params).toEqual({
			especie: "psyduck",
		});
		expect(por("santuario.resumen.visitanteSeQueda")[0]?.params).toEqual({
			nombre: "N(r9)",
		});
		expect(por("santuario.resumen.visitanteSeVa")[0]?.params).toEqual({
			nombre: "N(r8)",
			motivo: "hambre",
		});
		expect(por("santuario.resumen.residenteNuevo")[0]?.params).toEqual({
			especie: "zubat",
		});
		expect(por("santuario.resumen.terreno")[0]?.params).toEqual({ n: 2 });
	});

	it("ignora los eventos que no conoce", () => {
		expect(resumenDeJornada([{ tipo: "algoNuevo" }], {}, {}, nombre)).toEqual(
			[],
		);
	});
});
