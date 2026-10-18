import type { MiembroEquipo } from "@santuario/battle";
import type { TipoNodo } from "@santuario/core";
import type { SetCombate } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { crearRival } from "./encuentros.js";

/** Set mínimo válido para las pruebas. */
const set = (especie: string): SetCombate => ({
	especie,
	movimientos: ["placaje"],
	habilidad: "flexibilidad",
	naturaleza: "Serious",
});

const SETS: readonly SetCombate[] = Array.from({ length: 10 }, (_, i) =>
	set(`esp${i}`),
);

/** Nodo de combate genérico. */
const nodo = (tipo: TipoNodo, id = "2-0") => ({ id, tipo });

const especies = (equipo: MiembroEquipo[]): string[] =>
	equipo.map((m) => m.especie);

describe("crearRival", () => {
	it("respeta el tamaño de cada tipo de nodo y piso", () => {
		const salvajesPiso3 = new Set<number>();
		for (let i = 0; i < 200; i++) {
			const semilla = `t${i}`;
			expect(crearRival(semilla, 1, nodo("salvaje"), SETS, [])).toHaveLength(1);
			expect(crearRival(semilla, 2, nodo("salvaje"), SETS, [])).toHaveLength(1);
			const piso3 = crearRival(semilla, 3, nodo("salvaje"), SETS, []);
			expect([1, 2]).toContain(piso3.length);
			salvajesPiso3.add(piso3.length);
			expect(crearRival(semilla, 1, nodo("entrenador"), SETS, [])).toHaveLength(
				3,
			);
			expect(crearRival(semilla, 1, nodo("jefe"), SETS, [])).toHaveLength(3);
			expect(crearRival(semilla, 3, nodo("jefe"), SETS, [])).toHaveLength(3);
			expect(crearRival(semilla, 2, nodo("alfa"), SETS, [])).toHaveLength(1);
			expect(crearRival(semilla, 3, nodo("sombrio"), SETS, [])).toHaveLength(1);
		}
		expect([...salvajesPiso3].sort()).toEqual([1, 2]);
	});

	it("nunca repite especie y cada miembro lleva su set", () => {
		for (let i = 0; i < 40; i++) {
			const semilla = `u${i}`;
			for (const tipo of [
				"salvaje",
				"entrenador",
				"alfa",
				"sombrio",
				"jefe",
			] as const) {
				const rival = crearRival(semilla, 3, nodo(tipo), SETS, []);
				expect(new Set(especies(rival)).size).toBe(rival.length);
				for (const miembro of rival) {
					expect(miembro.set.especie).toBe(miembro.especie);
				}
			}
		}
	});

	it("con menos sets que el tamaño pedido usa los que haya", () => {
		expect(
			crearRival("poco", 1, nodo("entrenador"), SETS.slice(0, 2), []),
		).toHaveLength(2);
		expect(
			crearRival("poco", 1, nodo("jefe"), SETS.slice(0, 1), []),
		).toHaveLength(1);
		expect(
			crearRival("poco", 1, nodo("alfa"), SETS.slice(0, 1), []),
		).toHaveLength(1);
	});

	it("ignora los sets repetidos del catálogo", () => {
		const repetido = [...SETS.slice(0, 3), ...SETS.slice(0, 2)];
		const rival = crearRival("dup", 1, nodo("entrenador"), repetido, []);
		expect(rival).toHaveLength(3);
		expect(new Set(especies(rival)).size).toBe(3);
	});

	it("prefiere las especies que no están en el equipo del jugador", () => {
		const cinco = SETS.slice(0, 5);
		const excluidas = ["esp1", "esp2", "esp3", "esp4"];
		const unicoLibre = crearRival("pref", 1, nodo("alfa"), cinco, excluidas);
		expect(especies(unicoLibre)).toEqual(["esp0"]);

		const jefe = crearRival("pref", 1, nodo("jefe"), SETS, ["esp0"]);
		expect(jefe).toHaveLength(3);
		expect(especies(jefe)).not.toContain("esp0");
	});

	it("solo usa especies excluidas cuando no quedan otras", () => {
		const cinco = SETS.slice(0, 5);
		const excluidas = ["esp1", "esp2", "esp3", "esp4"];
		const rival = crearRival("justo", 1, nodo("entrenador"), cinco, excluidas);
		expect(rival).toHaveLength(3);
		expect(new Set(especies(rival)).size).toBe(3);
		expect(especies(rival)).toContain("esp0");
		expect(especies(rival).filter((e) => excluidas.includes(e))).toHaveLength(
			2,
		);

		const todoExcluido = crearRival("todo", 1, nodo("jefe"), cinco, [
			"esp0",
			"esp1",
			"esp2",
			"esp3",
			"esp4",
		]);
		expect(todoExcluido).toHaveLength(3);
		expect(new Set(especies(todoExcluido)).size).toBe(3);
	});

	it("rechaza los tipos sin combate y un catálogo vacío", () => {
		for (const tipo of ["tienda", "manantial", "evento", "cofre"] as const) {
			expect(() => crearRival("x", 1, nodo(tipo), SETS, [])).toThrow(
				RangeError,
			);
		}
		expect(() =>
			crearRival("x", 1, nodo("nada" as TipoNodo), SETS, []),
		).toThrow(RangeError);
		expect(() => crearRival("x", 1, nodo("salvaje"), [], [])).toThrow(
			RangeError,
		);
	});

	it("es determinista y no muta el catálogo de sets", () => {
		const congelados: readonly SetCombate[] = Object.freeze(
			SETS.map((s) => Object.freeze({ ...s })),
		);
		const antes = JSON.stringify(congelados);
		for (const tipo of [
			"salvaje",
			"entrenador",
			"alfa",
			"sombrio",
			"jefe",
		] as const) {
			const uno = crearRival("det", 2, nodo(tipo, "3-1"), congelados, ["esp0"]);
			const dos = crearRival("det", 2, nodo(tipo, "3-1"), congelados, ["esp0"]);
			expect(JSON.stringify(uno)).toBe(JSON.stringify(dos));
			expect(uno[0]?.set).toBe(
				congelados.find((s) => s.especie === uno[0]?.especie),
			);
		}
		expect(JSON.stringify(congelados)).toBe(antes);
	});

	it("cambia el rival con el nodo y con el piso", () => {
		const firmas = new Set(
			["0-0", "0-1", "1-0", "2-0", "3-1", "4-2"].map((id) =>
				JSON.stringify(crearRival("var", 1, { id, tipo: "jefe" }, SETS, [])),
			),
		);
		expect(firmas.size).toBeGreaterThan(1);
		const porPiso = new Set(
			[1, 2, 3].map((piso) =>
				JSON.stringify(
					crearRival(
						"var",
						piso as 1 | 2 | 3,
						{ id: "5-0", tipo: "jefe" },
						SETS,
						[],
					),
				),
			),
		);
		expect(porPiso.size).toBe(3);
	});
});
