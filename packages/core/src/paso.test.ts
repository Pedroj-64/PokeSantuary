import fc from "fast-check";
import { describe, expect, it } from "vitest";
import golden from "../test/repeticiones/basica.json";
import { type Accion, type Estado, paso } from "./paso.js";
import { reproducir } from "./repeticion.js";
import { crearRng } from "./rng.js";

const congelar = <T extends object>(obj: T): T => {
	for (const v of Object.values(obj)) {
		if (typeof v === "object" && v !== null) congelar(v);
	}
	return Object.freeze(obj);
};

const accionArb = fc.constantFrom<Accion>(
	{ tipo: "recolectar" },
	{ tipo: "descansar" },
);

describe("paso", () => {
	it("no muta el estado de entrada", () => {
		const estado = congelar<Estado>({ turno: 3, bayas: 5 });
		const r = paso(estado, { tipo: "recolectar" }, crearRng("a"));
		expect(estado).toEqual({ turno: 3, bayas: 5 });
		expect(r.estado).not.toBe(estado);
	});

	it("descansar solo avanza el turno", () => {
		const r = paso(
			{ turno: 0, bayas: 2 },
			{ tipo: "descansar" },
			crearRng("a"),
		);
		expect(r).toEqual({
			estado: { turno: 1, bayas: 2 },
			eventos: [{ tipo: "descansado" }],
		});
	});

	it("recolectar suma rng.entero(1, 3) bayas", () => {
		const esperado = crearRng("b").entero(1, 3);
		const r = paso(
			{ turno: 0, bayas: 2 },
			{ tipo: "recolectar" },
			crearRng("b"),
		);
		expect(r.estado).toEqual({ turno: 1, bayas: 2 + esperado });
		expect(r.eventos).toEqual([{ tipo: "recolectado", cantidad: esperado }]);
	});
});

describe("reproducir", () => {
	it("coincide con la repetición dorada versionada", () => {
		expect(reproducir(golden.semilla, golden.acciones as Accion[])).toEqual(
			golden.esperado,
		);
	});

	it("propiedad: bayas >= 0 y turno crece 1 por acción", () => {
		fc.assert(
			fc.property(fc.string(), fc.array(accionArb), (semilla, acciones) => {
				const r = reproducir(semilla, acciones);
				const { estado, eventos } = r;
				expect(estado.bayas).toBeGreaterThanOrEqual(0);
				expect(estado.turno).toBe(acciones.length);
				expect(eventos).toHaveLength(acciones.length);
				let suma = 0;
				for (const e of eventos) {
					if (e.tipo === "recolectado") {
						expect(e.cantidad).toBeGreaterThanOrEqual(1);
						expect(e.cantidad).toBeLessThanOrEqual(3);
						suma += e.cantidad;
					}
				}
				expect(estado.bayas).toBe(suma);
				expect(reproducir(semilla, acciones)).toEqual(r);
			}),
		);
	});
});
