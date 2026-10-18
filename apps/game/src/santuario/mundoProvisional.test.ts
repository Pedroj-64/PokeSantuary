import { describe, expect, it } from "vitest";
import {
	bloqueado,
	crearMundo,
	edificioCercano,
	LADO,
	TIPOS_LOSETA,
} from "./mundoProvisional.js";

describe("mundo provisional del Santuario", () => {
	it("es determinista por semilla y distinto con otra", () => {
		expect(crearMundo("a")).toEqual(crearMundo("a"));
		expect(crearMundo("a").losetas).not.toEqual(crearMundo("b").losetas);
	});

	it("el punto de partida es transitable y el borde del mapa no", () => {
		const m = crearMundo("s");
		expect(bloqueado(m, m.inicio.x - 5, m.inicio.y - 3, 10, 6)).toBe(false);
		expect(bloqueado(m, -1, 50, 10, 6)).toBe(true);
		expect(bloqueado(m, m.ancho * LADO - 5, 50, 10, 6)).toBe(true);
	});

	it("el agua, la roca y los edificios bloquean; el camino no", () => {
		const m = crearMundo("s");
		const en = (tipo: string) => {
			const i = m.losetas.indexOf(TIPOS_LOSETA.indexOf(tipo as never));
			return {
				x: (i % m.ancho) * LADO + 3,
				y: Math.floor(i / m.ancho) * LADO + 3,
			};
		};
		for (const t of ["agua", "roca"]) {
			const p = en(t);
			expect(bloqueado(m, p.x, p.y, 4, 4), t).toBe(true);
		}
		const camino = en("camino");
		expect(bloqueado(m, camino.x, camino.y, 4, 4)).toBe(false);
		const arbol = m.edificios.find((e) => e.tipo === "arbol-cenit");
		expect(arbol).toBeDefined();
		expect(
			bloqueado(
				m,
				(arbol?.x ?? 0) * LADO + 20,
				(arbol?.y ?? 0) * LADO + 20,
				4,
				4,
			),
		).toBe(true);
	});

	it("ningún edificio se pisa con otro y todos están sobre tierra firme", () => {
		const m = crearMundo("s");
		const celdas = new Set<string>();
		for (const e of m.edificios)
			for (let j = 0; j < e.alto; j++)
				for (let i = 0; i < e.ancho; i++) {
					const k = `${e.x + i},${e.y + j}`;
					expect(celdas.has(k), k).toBe(false);
					celdas.add(k);
					expect(m.losetas[(e.y + j) * m.ancho + e.x + i]).toBe(
						TIPOS_LOSETA.indexOf("tierra"),
					);
				}
	});

	it("edificioCercano devuelve el más próximo del tipo pedido", () => {
		const m = crearMundo("s");
		const lecho = edificioCercano(m, "lecho-hojas", 17 * LADO, 17 * LADO);
		expect(lecho?.edificio.x).toBe(17);
		expect(edificioCercano(m, "no-existe", 0, 0)).toBeUndefined();
	});
});
