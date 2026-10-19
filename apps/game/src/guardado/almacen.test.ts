import { describe, expect, it, vi } from "vitest";
import {
	type AlmacenClaveValor,
	abrirAlmacen,
	almacenEnMemoria,
	cargarPartida,
	guardarPartida,
} from "./almacen.js";
import { empaquetar, type Opciones } from "./sobre.js";

type P = { jornada: number };
const opciones: Opciones<P> = {
	versionActual: 1,
	migraciones: {},
	validar: (x) => {
		if (typeof (x as P).jornada !== "number") throw new Error("inválida");
		return x as P;
	},
};
const texto = (jornada: number) => empaquetar({ jornada }, 1);

describe("almacenEnMemoria", () => {
	it("guarda y lee; lo que no existe es null", async () => {
		const a = almacenEnMemoria();
		expect(await a.leer("x")).toBeNull();
		await a.escribir("x", "1");
		expect(await a.leer("x")).toBe("1");
	});
});

describe("abrirAlmacen", () => {
	it("sin IndexedDB devuelve un almacén en memoria marcado como degradado", async () => {
		vi.stubGlobal("indexedDB", undefined);
		const a = await abrirAlmacen("prueba");
		vi.unstubAllGlobals();
		expect(a.degradado).toBe(true);
		await a.escribir("k", "v");
		expect(await a.leer("k")).toBe("v");
	});

	it("si IndexedDB falla al abrir, también degrada y no lanza", async () => {
		vi.stubGlobal("indexedDB", {
			open: () => {
				throw new Error("modo privado");
			},
		});
		const a = await abrirAlmacen("prueba");
		vi.unstubAllGlobals();
		expect(a.degradado).toBe(true);
	});
});

describe("guardarPartida y cargarPartida", () => {
	it("sin guardado devuelve null", async () => {
		expect(await cargarPartida(almacenEnMemoria(), "ranura1", opciones)).toBe(
			null,
		);
	});

	it("guarda y carga lo último", async () => {
		const a = almacenEnMemoria();
		await guardarPartida(a, "ranura1", await texto(3));
		const r = await cargarPartida(a, "ranura1", opciones);
		expect(r?.partida).toEqual({ jornada: 3 });
		expect(r?.avisos).toEqual([]);
	});

	it("la copia anterior se conserva: si lo último se corrompe, carga la copia y avisa", async () => {
		const a = almacenEnMemoria();
		await guardarPartida(a, "ranura1", await texto(3));
		await guardarPartida(a, "ranura1", await texto(4));
		await a.escribir("ranura1", "basura a medio escribir");
		const r = await cargarPartida(a, "ranura1", opciones);
		expect(r?.partida).toEqual({ jornada: 3 });
		expect(r?.avisos).toEqual(["copia"]);
	});

	it("una versión futura NO cae a la copia: se avisa y se conserva todo", async () => {
		const a = almacenEnMemoria();
		await guardarPartida(a, "ranura1", await texto(3));
		await guardarPartida(a, "ranura1", await empaquetar({ jornada: 9 }, 2));
		await expect(cargarPartida(a, "ranura1", opciones)).rejects.toMatchObject({
			codigo: "version-futura",
		});
		expect(await a.leer("ranura1")).toContain('"version":2');
		expect(await a.leer("ranura1.copia")).not.toBeNull();
	});

	it("actual y copia corruptas: lanza, no devuelve una partida vacía", async () => {
		const a = almacenEnMemoria();
		await a.escribir("ranura1", "mal");
		await a.escribir("ranura1.copia", "peor");
		await expect(cargarPartida(a, "ranura1", opciones)).rejects.toMatchObject({
			codigo: "formato",
		});
	});

	it("si el almacén falla al escribir, guardarPartida lo cuenta y no lanza", async () => {
		const roto: AlmacenClaveValor = {
			degradado: false,
			leer: async () => null,
			escribir: async () => {
				throw new Error("cuota llena");
			},
		};
		await expect(guardarPartida(roto, "r", await texto(1))).resolves.toBe(
			false,
		);
	});
});
