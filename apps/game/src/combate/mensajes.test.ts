import type { EventoCombate } from "@santuario/battle";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cambiarIdioma } from "../i18n/index.js";
import { mensajeDe } from "./mensajes.js";

const datos = {
	especie: (s: string) => ({ pikachu: "Pikachu", abra: "Abra" })[s] ?? s,
	movimiento: (m: string) => ({ surf: "Surf", thunderbolt: "Rayo" })[m] ?? m,
};

const casos: [EventoCombate, string, string][] = [
	[
		{ tipo: "inicio", tamanoJugador: 3, tamanoRival: 3 },
		"¡Comienza el combate!",
		"The battle begins!",
	],
	[{ tipo: "turno", numero: 2 }, "", ""],
	[
		{
			tipo: "movimiento",
			lado: "jugador",
			especie: "pikachu",
			movimiento: "thunderbolt",
		},
		"¡Pikachu usó Rayo!",
		"Pikachu used Thunderbolt!",
	],
	[
		{ tipo: "movimiento", lado: "rival", especie: "abra", movimiento: "surf" },
		"¡Abra rival usó Surf!",
		"The opposing Abra used Surf!",
	],
	[{ tipo: "dano", lado: "rival", hp: 1, hpMax: 2 }, "", ""],
	[
		{ tipo: "curacion", lado: "jugador", hp: 5, hpMax: 9 },
		"Tu Pokémon recuperó PS.",
		"Your Pokémon restored HP.",
	],
	[
		{ tipo: "curacion", lado: "rival", hp: 5, hpMax: 9 },
		"El Pokémon rival recuperó PS.",
		"The opposing Pokémon restored HP.",
	],
	[
		{ tipo: "efectividad", valor: "super" },
		"¡Es muy eficaz!",
		"It's super effective!",
	],
	[
		{ tipo: "efectividad", valor: "poco" },
		"No es muy eficaz...",
		"It's not very effective...",
	],
	[
		{ tipo: "efectividad", valor: "nula" },
		"No afecta...",
		"It doesn't affect it...",
	],
	[{ tipo: "critico" }, "¡Un golpe crítico!", "A critical hit!"],
	[{ tipo: "fallo" }, "¡El ataque falló!", "The attack missed!"],
	[
		{ tipo: "debilitado", lado: "jugador", especie: "pikachu" },
		"¡Pikachu se debilitó!",
		"Pikachu fainted!",
	],
	[
		{ tipo: "debilitado", lado: "rival", especie: "abra" },
		"¡Abra rival se debilitó!",
		"The opposing Abra fainted!",
	],
	[
		{ tipo: "cambio", lado: "jugador", especie: "pikachu", hp: 1, hpMax: 1 },
		"¡Adelante, Pikachu!",
		"Go! Pikachu!",
	],
	[
		{ tipo: "cambio", lado: "rival", especie: "abra", hp: 1, hpMax: 1 },
		"El rival envía a Abra.",
		"The opponent sends out Abra.",
	],
	[
		{ tipo: "fin", ganador: "jugador" },
		"¡Has ganado el combate!",
		"You won the battle!",
	],
	[
		{ tipo: "fin", ganador: "rival" },
		"Has perdido el combate...",
		"You lost the battle...",
	],
	[
		{ tipo: "fin", ganador: "empate" },
		"El combate acabó en empate.",
		"The battle ended in a draw.",
	],
];

describe("mensajeDe", () => {
	beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
	afterEach(() => {
		cambiarIdioma("es");
		vi.restoreAllMocks();
	});

	for (const [e, es, en] of casos) {
		const nombre = `${e.tipo} ${JSON.stringify(e)}`;
		it(`es: ${nombre}`, () => {
			cambiarIdioma("es");
			expect(
				mensajeDe(e, {
					...datos,
					movimiento: (m) => ({ thunderbolt: "Rayo", surf: "Surf" })[m] ?? m,
				}),
			).toBe(es);
		});
		it(`en: ${nombre}`, () => {
			cambiarIdioma("en");
			expect(
				mensajeDe(e, {
					...datos,
					movimiento: (m) =>
						({ thunderbolt: "Thunderbolt", surf: "Surf" })[m] ?? m,
				}),
			).toBe(en);
		});
	}

	it("no deja claves sin traducir (sin avisos de i18n)", () => {
		for (const idioma of ["es", "en"] as const) {
			cambiarIdioma(idioma);
			for (const [e] of casos) mensajeDe(e, datos);
		}
		expect(console.warn).not.toHaveBeenCalled();
	});
});
