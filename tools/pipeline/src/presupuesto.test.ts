import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluar, marcasEn, type Salida } from "./presupuesto.js";

const html = (js: string) =>
	`<html><head><script type="module" crossorigin src="/assets/${js}"></script></head></html>`;
const salida = (
	principal: Buffer,
	extra: Record<string, Buffer> = {},
): Salida => ({
	html: html("index-a.js"),
	archivos: {
		"index-a.js": principal,
		"worker-a.js": Buffer.from("class BattleStream{}"),
		...extra,
	},
});

describe("presupuesto de carga", () => {
	it("detecta marcas del simulador", () => {
		expect(marcasEn("var a=1")).toEqual([]);
		expect(marcasEn("x BattleStream y @pkmn/sim")).toEqual([
			"@pkmn",
			"BattleStream",
		]);
	});

	it("acepta una salida correcta", () => {
		expect(evaluar(salida(Buffer.from("console.log(1)"))).errores).toEqual([]);
	});

	it("falla si el principal lleva el simulador", () => {
		const { errores } = evaluar(salida(Buffer.from("class BattleQueue{}")));
		expect(errores.join()).toMatch(/simulador.*BattleQueue/);
	});

	it("falla si el principal supera 450 KB gzip", () => {
		const { errores } = evaluar(salida(randomBytes(460 * 1024)));
		expect(errores.join()).toMatch(/principal pesa .* gzip/);
	});

	it("falla si la carga inicial supera 5 MB gzip", () => {
		const css = randomBytes(5 * 1024 * 1024 + 1);
		const s = salida(Buffer.from("1"), { "x.css": css });
		s.html = `${html("index-a.js")}<link rel="stylesheet" href="/assets/x.css">`;
		expect(evaluar(s).errores.join()).toMatch(/carga inicial/);
	});

	it("falla si no hay chunk worker", () => {
		const s = salida(Buffer.from("1"));
		delete s.archivos["worker-a.js"];
		expect(evaluar(s).errores.join()).toMatch(/worker/);
	});

	it("falla si el detector ya no encuentra nada en el worker", () => {
		const s = salida(Buffer.from("1"), { "worker-a.js": Buffer.from("nada") });
		expect(evaluar(s).errores.join()).toMatch(/MARCAS_SIMULADOR/);
	});

	const conPrecarga = (extra: Record<string, Buffer>): Salida => ({
		html: `${html("index-a.js")}<link href="/assets/c.js" rel="modulepreload" crossorigin>`,
		archivos: {
			"index-a.js": Buffer.from("1"),
			"worker-a.js": Buffer.from("class BattleStream{}"),
			...extra,
		},
	});

	it("falla si el simulador está en un chunk precargado", () => {
		const { errores } = evaluar(
			conPrecarga({ "c.js": Buffer.from("ModdedDex") }),
		);
		expect(errores.join()).toMatch(/c\.js contiene código del simulador/);
	});

	it("acepta el simulador solo en el worker", () => {
		expect(evaluar(conPrecarga({ "c.js": Buffer.from("2") })).errores).toEqual(
			[],
		);
	});

	it("falla si el simulador está en la entrada", () => {
		const s = conPrecarga({ "c.js": Buffer.from("2") });
		s.archivos["index-a.js"] = Buffer.from("@pkmn/sim");
		expect(evaluar(s).errores.join()).toMatch(/index-a\.js contiene/);
	});

	it("falla si algo referenciado falta en la compilación", () => {
		const { errores } = evaluar(conPrecarga({}));
		expect(errores.join()).toMatch(/referencia assets\/c\.js pero no está/);
	});

	it("lee la hoja de estilos con cualquier orden de atributos", () => {
		const s = salida(Buffer.from("1"), {
			"x.css": randomBytes(5 * 1024 * 1024 + 1),
		});
		s.html = `${html("index-a.js")}<link href="/assets/x.css" rel="stylesheet">`;
		expect(evaluar(s).errores.join()).toMatch(/carga inicial/);
	});

	it("no da falso positivo con un puente diminuto hacia el worker", () => {
		const s = salida(Buffer.from("1"), {
			"streams-a.js": Buffer.from('import"./worker-a.js";'),
		});
		expect(evaluar(s).errores).toEqual([]);
	});

	it("falla si falta el script referenciado", () => {
		const s = salida(Buffer.from("1"));
		s.html = `${html("index-a.js")}<script type="module" src="/assets/falta.js"></script>`;
		expect(evaluar(s).errores.join()).toMatch(/referencia assets\/falta\.js/);
	});

	it("falla si falta la hoja de estilos referenciada", () => {
		const s = salida(Buffer.from("1"));
		s.html = `${html("index-a.js")}<link rel="stylesheet" href="/assets/falta.css">`;
		expect(evaluar(s).errores.join()).toMatch(/referencia assets\/falta\.css/);
	});
});
