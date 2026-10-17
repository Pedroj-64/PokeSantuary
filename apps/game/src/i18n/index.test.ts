import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "./en.json";
import es from "./es.json";

/** Almacén en memoria que imita localStorage. */
function almacenFalso(inicial: Record<string, string> = {}) {
	const datos = new Map(Object.entries(inicial));
	return {
		getItem: (k: string) => datos.get(k) ?? null,
		setItem: (k: string, v: string) => void datos.set(k, v),
	};
}

async function cargar(navegador: string, almacen: unknown) {
	vi.resetModules();
	vi.stubGlobal("navigator", { language: navegador });
	vi.stubGlobal("localStorage", almacen);
	return import("./index.js");
}

describe("i18n", () => {
	beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("t('titulo') cambia al cambiar de idioma", async () => {
		const i = await cargar("es-MX", almacenFalso());
		const antes = i.t("titulo");
		i.cambiarIdioma("en");
		expect(i.t("titulo")).not.toBe(antes);
		expect(i.t("titulo")).toBe(en.titulo);
		expect(antes).toBe(es.titulo);
	});

	it("clave inexistente devuelve la clave y avisa", async () => {
		const i = await cargar("en-US", almacenFalso());
		expect(i.t("no.existe")).toBe("no.existe");
		expect(console.warn).toHaveBeenCalled();
	});

	it("es.json y en.json tienen las mismas claves", () => {
		expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
	});

	it("idioma por defecto sale de navigator.language", async () => {
		expect((await cargar("es-ES", almacenFalso())).idiomaActual()).toBe("es");
		expect((await cargar("fr-FR", almacenFalso())).idiomaActual()).toBe("en");
	});

	it("la elección persistida gana al navegador", async () => {
		const i = await cargar("es-ES", almacenFalso({ "santuario.idioma": "en" }));
		expect(i.idiomaActual()).toBe("en");
	});

	it("cambiarIdioma persiste y notifica a los oyentes", async () => {
		const almacen = almacenFalso();
		const i = await cargar("es-ES", almacen);
		const cb = vi.fn();
		const quitar = i.alCambiarIdioma(cb);
		i.cambiarIdioma("en");
		expect(cb).toHaveBeenCalledWith("en");
		expect(almacen.getItem("santuario.idioma")).toBe("en");
		quitar();
		i.cambiarIdioma("es");
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it("localStorage roto no lanza", async () => {
		const roto = {
			getItem: () => {
				throw new Error("x");
			},
			setItem: () => {
				throw new Error("x");
			},
		};
		const i = await cargar("es-ES", roto);
		expect(i.idiomaActual()).toBe("es");
		expect(() => i.cambiarIdioma("en")).not.toThrow();
		expect(i.idiomaActual()).toBe("en");
	});
});
