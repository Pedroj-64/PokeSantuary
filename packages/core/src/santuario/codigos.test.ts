import { describe, expect, it } from "vitest";
import {
	codigoElegido,
	type EleccionesCodigos,
	efectoDeCodigos,
	elegirCodigo,
	nivelesPendientes,
	type Opcion,
	type TablaCodigos,
} from "./codigos.js";

const TABLA: TablaCodigos = [
	{
		nivel: 1,
		categoria: "trabajo",
		A: {
			id: "manos-ocupadas",
			efecto: { multProduccion: 1.2, animoPorJornada: -3 },
		},
		B: {
			id: "ritmo-propio",
			efecto: { multProduccion: 0.9, animoPorJornada: 5 },
		},
	},
	{
		nivel: 2,
		categoria: "combate",
		A: { id: "disciplina", efecto: { nivelesPorEco: 1 } },
		B: { id: "cuidado-mutuo", efecto: { debilitadosNoAgotan: true } },
	},
	{
		nivel: 3,
		categoria: "naturaleza",
		A: { id: "cosecha-abundante", efecto: { multHuerto: 1.3 } },
		B: { id: "bosque-libre", efecto: { visitanteCada: 4 } },
	},
];

describe("nivelesPendientes", () => {
	it("Altar 0 devuelve []", () => {
		expect(nivelesPendientes(0, {}, TABLA)).toEqual([]);
	});
	it("Altar 2 sin elecciones devuelve [1, 2]", () => {
		expect(nivelesPendientes(2, {}, TABLA)).toEqual([1, 2]);
	});
	it("con el 1 elegido devuelve [2]", () => {
		expect(nivelesPendientes(2, { 1: "A" }, TABLA)).toEqual([2]);
	});
	it("Altar 3 todo elegido devuelve []", () => {
		expect(nivelesPendientes(3, { 1: "A", 2: "B", 3: "A" }, TABLA)).toEqual([]);
	});
	it("ignora niveles por encima del Altar", () => {
		expect(nivelesPendientes(1, {}, TABLA)).toEqual([1]);
	});
	it("devuelve orden ascendente", () => {
		expect(nivelesPendientes(3, { 2: "A" }, TABLA)).toEqual([1, 3]);
	});
});

describe("elegirCodigo", () => {
	it("elige A y devuelve copia nueva", () => {
		const elegidos: EleccionesCodigos = {};
		const resultado = elegirCodigo(elegidos, 1, "A", 3, TABLA);
		expect(resultado).toEqual({ 1: "A" });
		expect(resultado).not.toBe(elegidos);
		expect(elegidos).toEqual({});
	});
	it("elige B y devuelve copia nueva", () => {
		const elegidos: EleccionesCodigos = { 1: "A" };
		const resultado = elegirCodigo(elegidos, 2, "B", 3, TABLA);
		expect(resultado).toEqual({ 1: "A", 2: "B" });
		expect(resultado).not.toBe(elegidos);
		expect(elegidos).toEqual({ 1: "A" });
	});
	it("entrada congelada no cambia", () => {
		const elegidos = Object.freeze({ 1: "A" } as EleccionesCodigos);
		expect(() => elegirCodigo(elegidos, 2, "B", 3, TABLA)).not.toThrow();
		expect(elegidos).toEqual({ 1: "A" });
	});
	it("nivel inexistente lanza RangeError", () => {
		expect(() => elegirCodigo({}, 9, "A", 3, TABLA)).toThrow(RangeError);
	});
	it("nivel mayor que el Altar lanza RangeError", () => {
		expect(() => elegirCodigo({}, 3, "A", 2, TABLA)).toThrow(RangeError);
	});
	it("repetir elección lanza RangeError", () => {
		expect(() => elegirCodigo({ 1: "A" }, 1, "B", 3, TABLA)).toThrow(
			RangeError,
		);
	});
	it("opción inválida lanza RangeError", () => {
		expect(() => elegirCodigo({}, 1, "X" as Opcion, 3, TABLA)).toThrow(
			RangeError,
		);
	});
});

describe("efectoDeCodigos", () => {
	it("sin elecciones devuelve neutro", () => {
		expect(efectoDeCodigos({}, TABLA)).toEqual({
			multProduccion: 1,
			animoPorJornada: 0,
			nivelesPorEco: 0,
			debilitadosNoAgotan: false,
			multHuerto: 1,
		});
	});
	it("solo nivel 1 A", () => {
		const r = efectoDeCodigos({ 1: "A" }, TABLA);
		expect(r.multProduccion).toBe(1.2);
		expect(r.animoPorJornada).toBe(-3);
		expect(r.nivelesPorEco).toBe(0);
		expect(r.debilitadosNoAgotan).toBe(false);
		expect(r.multHuerto).toBe(1);
		expect(r.visitanteCada).toBeUndefined();
	});
	it("1 A + 2 B + 3 A", () => {
		const r = efectoDeCodigos({ 1: "A", 2: "B", 3: "A" }, TABLA);
		expect(r.multProduccion).toBe(1.2);
		expect(r.animoPorJornada).toBe(-3);
		expect(r.nivelesPorEco).toBe(0);
		expect(r.debilitadosNoAgotan).toBe(true);
		expect(r.multHuerto).toBe(1.3);
		expect(r.visitanteCada).toBeUndefined();
	});
	it("1 B + 3 B", () => {
		const r = efectoDeCodigos({ 1: "B", 3: "B" }, TABLA);
		expect(r.multProduccion).toBe(0.9);
		expect(r.animoPorJornada).toBe(5);
		expect(r.visitanteCada).toBe(4);
	});
	it("mínimo de visitanteCada con dos definiciones (4 y 6 → 4)", () => {
		const t: TablaCodigos = [
			{
				nivel: 1,
				categoria: "naturaleza",
				A: { id: "manos-ocupadas", efecto: { visitanteCada: 4 } },
				B: { id: "ritmo-propio", efecto: {} },
			},
			{
				nivel: 2,
				categoria: "naturaleza",
				A: { id: "disciplina", efecto: { visitanteCada: 6 } },
				B: { id: "cuidado-mutuo", efecto: {} },
			},
		];
		const r = efectoDeCodigos({ 1: "A", 2: "A" }, t);
		expect(r.visitanteCada).toBe(4);
	});
	it("nivel elegido fuera de la tabla lanza RangeError", () => {
		const t: TablaCodigos = [
			{
				nivel: 1,
				categoria: "trabajo",
				A: { id: "manos-ocupadas", efecto: {} },
				B: { id: "ritmo-propio", efecto: {} },
			},
		];
		expect(() => efectoDeCodigos({ 5: "A" } as EleccionesCodigos, t)).toThrow(
			RangeError,
		);
	});
});

describe("codigoElegido", () => {
	it("devuelve el id elegido", () => {
		expect(codigoElegido({ 1: "A", 2: "B" }, 1, TABLA)).toBe("manos-ocupadas");
		expect(codigoElegido({ 1: "A", 2: "B" }, 2, TABLA)).toBe("cuidado-mutuo");
	});
	it("undefined si no hay elección", () => {
		expect(codigoElegido({}, 1, TABLA)).toBeUndefined();
		expect(codigoElegido({ 1: "A" }, 2, TABLA)).toBeUndefined();
	});
});
