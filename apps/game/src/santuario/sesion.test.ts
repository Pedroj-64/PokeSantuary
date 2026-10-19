import type { ContextoPartida } from "@santuario/core";
import type { Especie } from "@santuario/data";
import { describe, expect, it } from "vitest";
import especialidades from "../../../../packs/kanto/especialidades.json";
import especiesCrudas from "../../../../packs/kanto/especies.json";
import habitats from "../../../../packs/kanto/habitats.json";
import balance from "../../../../packs/kanto/santuario.json";
import {
	type AlmacenClaveValor,
	almacenEnMemoria,
} from "../guardado/almacen.js";
import { crearFabrica } from "./fabricar.js";
import { abrirSesion } from "./sesion.js";

const ctx = (): ContextoPartida => ({
	balance: structuredClone(balance) as unknown as ContextoPartida["balance"],
	habitats: habitats as unknown as ContextoPartida["habitats"],
	fabricar: crearFabrica(
		especiesCrudas as unknown as Especie[],
		especialidades,
	),
});
/** Almacén en memoria que se comporta como uno persistente (no degradado). */
const almacenPrueba = (): AlmacenClaveValor => ({
	...almacenEnMemoria(),
	degradado: false,
});
const INICIALES = ["bulbasaur", "charmander", "squirtle"];
const abrir = (almacen = almacenPrueba(), semilla = "s1") =>
	abrirSesion({
		almacen,
		ranura: "t",
		semilla,
		ctx: ctx(),
		iniciales: INICIALES,
	});

describe("abrirSesion", () => {
	it("sin guardado crea una partida nueva con los residentes iniciales", async () => {
		const { sesion, avisos } = await abrir();
		const p = sesion.partida();
		expect(avisos).toEqual([]);
		expect(p.santuario.semilla).toBe("s1");
		expect(p.santuario.residentes.map((r) => r.especie)).toEqual(INICIALES);
		expect(p.santuario.residentes.map((r) => r.uid)).toEqual([
			"r2",
			"r3",
			"r4",
		]);
		expect(p.santuario.siguienteUid).toBe(5);
	});

	it("despachar aplica la acción y guarda; reabrir recupera lo mismo", async () => {
		const almacen = almacenPrueba();
		const { sesion } = await abrir(almacen);
		sesion.despachar({ tipo: "comenzarDia" });
		sesion.despachar({ tipo: "pasarDia" });
		await sesion.guardada();
		const otra = await abrir(almacen, "otra-semilla-que-se-ignora");
		expect(otra.sesion.partida()).toEqual(sesion.partida());
		expect(otra.sesion.partida().santuario.momento).toBe("noche");
	});

	it("una acción ilegal lanza y no cambia ni guarda nada", async () => {
		const almacen = almacenPrueba();
		const { sesion } = await abrir(almacen);
		const antes = sesion.partida();
		expect(() => sesion.despachar({ tipo: "pasarDia" })).toThrow(RangeError);
		expect(sesion.partida()).toBe(antes);
	});

	it("devuelve los eventos de la acción", async () => {
		const { sesion } = await abrir();
		sesion.despachar({ tipo: "comenzarDia" });
		const eventos = sesion.despachar({ tipo: "pasarDia" });
		expect(Array.isArray(eventos)).toBe(true);
	});

	it("guardado corrupto sin copia: lanza en vez de empezar de cero y pisar la partida", async () => {
		const almacen = almacenPrueba();
		await almacen.escribir("t", "basura");
		await expect(abrir(almacen)).rejects.toMatchObject({
			name: "ErrorGuardado",
		});
		expect(await almacen.leer("t")).toBe("basura");
	});

	it("el último guardado corrupto con copia buena: carga la copia y avisa", async () => {
		const almacen = almacenPrueba();
		const { sesion } = await abrir(almacen);
		sesion.despachar({ tipo: "comenzarDia" });
		await sesion.guardada();
		sesion.despachar({ tipo: "pasarDia" });
		await sesion.guardada();
		await almacen.escribir("t", "roto a medias");
		const r = await abrir(almacen);
		expect(r.avisos).toEqual(["copia"]);
		expect(r.sesion.partida().santuario.momento).toBe("dia");
	});

	it("con un almacén degradado (sin IndexedDB) avisa de que no se guardará", async () => {
		const { avisos } = await abrir(almacenEnMemoria());
		expect(avisos).toEqual(["sin-guardado"]);
	});
});
