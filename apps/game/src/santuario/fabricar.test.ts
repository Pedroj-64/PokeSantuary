import { crearRng } from "@santuario/core";
import { type Especie, NATURALEZAS } from "@santuario/data";
import { describe, expect, it } from "vitest";
import especialidades from "../../../../packs/kanto/especialidades.json";
import especiesCrudas from "../../../../packs/kanto/especies.json";
import { crearFabrica } from "./fabricar.js";

const especies = especiesCrudas as unknown as Especie[];
const fabricar = crearFabrica(especies, especialidades);
const pedir = (especie: string, uid = "r5", semilla = "s") =>
	fabricar({
		especie,
		uid,
		origen: "captura",
		rng: crearRng(`${semilla}:residente:${uid}`),
	});

describe("crearFabrica", () => {
	it("toma tipos y trabajos preferidos de la especie y las Especialidades del pack", () => {
		const r = pedir("charmander");
		expect(r.uid).toBe("r5");
		expect(r.tipos).toEqual(["fire"]);
		expect(r.preferidos).toEqual(["cocinar"]);
		expect(r.especialidades).toEqual({ cortar: 1, encender: 1 });
		expect(r.origen).toBe("captura");
	});

	it("nace descansado, sin tarea, con hambre y ánimo normales", () => {
		const r = pedir("eevee");
		expect(r.estado).toBe("descansado");
		expect(r.tarea).toEqual({ tipo: "nada" });
		expect(r.hambre).toBe(100);
		expect(r.animo).toBe(60);
		expect(r.amistad).toBe(0);
		expect(r.sombrio).toBeUndefined();
		expect(r.diasInquieto).toBe(0);
	});

	it("la naturaleza sale del rng: misma semilla, misma naturaleza; y es una válida", () => {
		expect(pedir("abra").naturaleza).toBe(pedir("abra").naturaleza);
		for (let i = 0; i < 40; i++)
			expect(NATURALEZAS).toContain(pedir("abra", `r${i}`, "x").naturaleza);
		const distintas = new Set(
			Array.from({ length: 40 }, (_, i) => pedir("abra", `r${i}`).naturaleza),
		);
		expect(distintas.size).toBeGreaterThan(3);
	});

	it("una especie desconocida lanza", () => {
		expect(() => pedir("mew")).toThrow(RangeError);
	});

	it("una especie sin entrada de Especialidades nace sin ninguna", () => {
		const f = crearFabrica(especies, {});
		const r = f({
			especie: "abra",
			uid: "r1",
			origen: "habitat",
			rng: crearRng("x"),
		});
		expect(r.especialidades).toEqual({});
	});
});
