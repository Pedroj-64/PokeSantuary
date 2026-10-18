import { describe, expect, it } from "vitest";
import { capturar, equipoLleno, sustituirMiembro } from "./equipo.js";
import {
	type EstadoExpedicion,
	elegibles,
	entrar,
	iniciarExpedicion,
} from "./expedicion.js";

/** Expedición con el jugador dentro de un nodo del tipo pedido (busca una semilla que lo tenga en la capa 0). */
function dentroDe(tipo: string, especies = ["a", "b", "c"]): EstadoExpedicion {
	for (let i = 0; i < 200; i++) {
		const e = iniciarExpedicion(`q${i}`, especies);
		const id = elegibles(e).find(
			(n) => e.mapa.capas.flat().find((x) => x.id === n)?.tipo === tipo,
		);
		if (id !== undefined) return entrar(e, id);
	}
	throw new Error(`ninguna semilla da un nodo ${tipo} en la entrada`);
}

describe("capturar", () => {
	it("añade al equipo con los PS que le quedaban", () => {
		const e = capturar(dentroDe("salvaje"), "rattata", 35);
		expect(e.equipo).toHaveLength(4);
		expect(e.equipo[3]).toEqual({ especie: "rattata", psPct: 35 });
	});

	it("acota los PS a 1..100: nunca entra debilitado", () => {
		const e = dentroDe("salvaje");
		expect(capturar(e, "x", 0).equipo[3]?.psPct).toBe(1);
		expect(capturar(e, "x", 250).equipo[3]?.psPct).toBe(100);
	});

	it("solo se captura en un salvaje", () => {
		expect(() => capturar(dentroDe("entrenador"), "x", 50)).toThrow(
			/encuentro salvaje/,
		);
		expect(() => capturar(iniciarExpedicion("q", ["a"]), "x", 50)).toThrow(
			RangeError,
		);
	});

	it("con el equipo lleno pide soltar a alguien", () => {
		const e = dentroDe("salvaje", ["a", "b", "c", "d", "e", "f"]);
		expect(equipoLleno(e)).toBe(true);
		expect(() => capturar(e, "x", 50)).toThrow(/lleno/);
	});

	it("no muta el estado recibido", () => {
		const e = dentroDe("salvaje");
		capturar(e, "x", 50);
		expect(e.equipo).toHaveLength(3);
	});
});

describe("sustituirMiembro", () => {
	const lleno = () => dentroDe("salvaje", ["a", "b", "c", "d", "e", "f"]);

	it("el capturado ocupa el sitio del soltado", () => {
		const e = sustituirMiembro(lleno(), 2, "x", 60);
		expect(e.equipo.map((m) => m.especie)).toEqual([
			"a",
			"b",
			"x",
			"d",
			"e",
			"f",
		]);
		expect(e.equipo[2]?.psPct).toBe(60);
	});

	it("rechaza un índice fuera del equipo y un equipo con hueco", () => {
		expect(() => sustituirMiembro(lleno(), 6, "x", 60)).toThrow(RangeError);
		expect(() => sustituirMiembro(lleno(), 1.5, "x", 60)).toThrow(RangeError);
		expect(() => sustituirMiembro(dentroDe("salvaje"), 0, "x", 60)).toThrow(
			/hueco/,
		);
	});
});
