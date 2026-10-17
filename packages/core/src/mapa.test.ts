import { describe, expect, it } from "vitest";
import {
	generarPiso,
	type MapaPiso,
	type NodoMapa,
	type TipoNodo,
	validarMapa,
} from "./mapa.js";

const PISOS = [1, 2, 3] as const;
const SEMILLAS = Array.from({ length: 500 }, (_, i) => `s${i + 1}`);

/** Construye un nodo suelto para los mapas escritos a mano. */
function nodo(
	capa: number,
	indice: number,
	tipo: TipoNodo,
	siguientes: string[],
): NodoMapa {
	return { id: `${capa}-${indice}`, capa, indice, tipo, siguientes };
}

/**
 * Mapa manual válido de 13 nodos; base para romper una regla a la vez.
 * Capas: 2, 2, 3, 2, 3 nodos y el jefe.
 */
function mapaManual(): MapaPiso {
	return {
		piso: 1,
		semilla: "manual",
		capas: [
			[
				nodo(0, 0, "salvaje", ["1-0", "1-1"]),
				nodo(0, 1, "entrenador", ["1-1"]),
			],
			[
				nodo(1, 0, "salvaje", ["2-0", "2-1"]),
				nodo(1, 1, "entrenador", ["2-2"]),
			],
			[
				nodo(2, 0, "tienda", ["3-0"]),
				nodo(2, 1, "salvaje", ["3-0", "3-1"]),
				nodo(2, 2, "alfa", ["3-1"]),
			],
			[
				nodo(3, 0, "salvaje", ["4-0", "4-1"]),
				nodo(3, 1, "entrenador", ["4-1", "4-2"]),
			],
			[
				nodo(4, 0, "manantial", ["5-0"]),
				nodo(4, 1, "salvaje", ["5-0"]),
				nodo(4, 2, "entrenador", ["5-0"]),
			],
			[nodo(5, 0, "jefe", [])],
		],
	};
}

/** Devuelve el nodo pedido; falla la prueba si no existe. */
function nodoDe(mapa: MapaPiso, capa: number, indice: number): NodoMapa {
	const encontrado = mapa.capas[capa]?.[indice];
	if (!encontrado) throw new Error(`no existe el nodo ${capa}-${indice}`);
	return encontrado;
}

/** Aplica una mutación al mapa manual y devuelve los errores resultantes. */
function mapaRoto(romper: (mapa: MapaPiso) => void): string[] {
	const mapa = mapaManual();
	romper(mapa);
	return validarMapa(mapa);
}

/** Deja el mapa manual con 11 nodos (rompe solo el total de la regla 2). */
function dejarOnceNodos(mapa: MapaPiso): void {
	mapa.capas[2] = [nodoDe(mapa, 2, 0), nodoDe(mapa, 2, 1)];
	nodoDe(mapa, 1, 1).siguientes = ["2-1"];
	mapa.capas[4] = [nodoDe(mapa, 4, 0), nodoDe(mapa, 4, 1)];
	nodoDe(mapa, 3, 1).siguientes = ["4-1"];
}

/** ¿Algún mensaje empieza por la regla indicada y contiene el texto dado? */
function hayErrorDe(errores: string[], regla: number, texto: string): boolean {
	return errores.some(
		(e) => e.startsWith(`regla ${regla}`) && e.includes(texto),
	);
}

describe("generarPiso", () => {
	it("los 3 pisos de 500 semillas generan mapas válidos", () => {
		for (const semilla of SEMILLAS) {
			for (const piso of PISOS) {
				const errores = validarMapa(generarPiso(semilla, piso));
				expect(errores, `${semilla} piso ${piso}`).toEqual([]);
			}
		}
	});

	it("es determinista: misma semilla y piso, mismo JSON", () => {
		for (const piso of PISOS) {
			expect(JSON.stringify(generarPiso("s7", piso))).toBe(
				JSON.stringify(generarPiso("s7", piso)),
			);
		}
		expect(JSON.stringify(generarPiso("ñandú", 3))).toBe(
			JSON.stringify(generarPiso("ñandú", 3)),
		);
	});

	it("el piso forma parte de la semilla del rng", () => {
		// Se comparan las capas: el campo `piso` cambiaría de todos modos.
		const uno = JSON.stringify(generarPiso("s1", 1).capas);
		const dos = JSON.stringify(generarPiso("s1", 2).capas);
		const tres = JSON.stringify(generarPiso("s1", 3).capas);
		expect(uno).not.toBe(dos);
		expect(dos).not.toBe(tres);
	});

	it("semillas distintas dan mapas distintos en 40 de 50 pares", () => {
		let distintos = 0;
		for (let i = 0; i < 50; i++) {
			const a = JSON.stringify(generarPiso(`d${i}`, 1));
			const b = JSON.stringify(generarPiso(`d${i + 50}`, 1));
			if (a !== b) distintos++;
		}
		expect(distintos).toBeGreaterThanOrEqual(40);
	});

	it("entre las 500 semillas aparecen mapas de 12 y de 15 nodos", () => {
		const totales = new Set<number>();
		for (const semilla of SEMILLAS) {
			totales.add(generarPiso(semilla, 1).capas.flat().length);
		}
		expect(totales.has(12)).toBe(true);
		expect(totales.has(15)).toBe(true);
	});

	it("devuelve 6 capas con el único jefe al final y copia piso y semilla", () => {
		for (const semilla of SEMILLAS.slice(0, 50)) {
			const mapa = generarPiso(semilla, 2);
			expect(mapa.piso).toBe(2);
			expect(mapa.semilla).toBe(semilla);
			expect(mapa.capas).toHaveLength(6);
			expect(mapa.capas[5]).toHaveLength(1);
			expect(nodoDe(mapa, 5, 0).tipo).toBe("jefe");
		}
	});

	it("la capa 0 solo tiene salvaje o entrenador", () => {
		for (const semilla of SEMILLAS.slice(0, 50)) {
			for (const n of generarPiso(semilla, 3).capas[0] ?? []) {
				expect(["salvaje", "entrenador"]).toContain(n.tipo);
			}
		}
	});

	it("rechaza un piso fuera de 1..3 con RangeError", () => {
		expect(() => generarPiso("s1", 0 as 1)).toThrow(RangeError);
		expect(() => generarPiso("s1", 4 as 1)).toThrow(RangeError);
		expect(() => generarPiso("s1", 1.5 as 1)).toThrow(RangeError);
	});

	it("rechaza una semilla que no es cadena con TypeError", () => {
		expect(() => generarPiso(1 as unknown as string, 1)).toThrow(TypeError);
		expect(() => generarPiso(null as unknown as string, 1)).toThrow(TypeError);
		expect(() => generarPiso(undefined as unknown as string, 2)).toThrow(
			TypeError,
		);
	});

	it("repetición dorada: el JSON de generarPiso('dorada', 1) no cambia", () => {
		expect(JSON.stringify(generarPiso("dorada", 1))).toBe(DORADA);
	});
});

describe("validarMapa", () => {
	it("acepta el mapa manual de 13 nodos", () => {
		expect(validarMapa(mapaManual())).toEqual([]);
	});

	it("acumula un mensaje por cada regla rota", () => {
		const errores = mapaRoto((mapa) => {
			dejarOnceNodos(mapa);
			nodoDe(mapa, 2, 0).tipo = "salvaje";
		});
		expect(errores).toHaveLength(2);
		expect(hayErrorDe(errores, 2, "12 y 15")).toBe(true);
		expect(hayErrorDe(errores, 4, "tienda")).toBe(true);
	});

	it("detecta la regla 1: un jefe fuera de la capa 5", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 1, 0).tipo = "jefe";
		});
		expect(hayErrorDe(errores, 1, "jefe")).toBe(true);
	});

	it("detecta la regla 1: la capa 5 sin jefe", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 5, 0).tipo = "salvaje";
		});
		expect(hayErrorDe(errores, 1, "capa 5")).toBe(true);
	});

	it("detecta la regla 1: la capa 5 con dos nodos", () => {
		const errores = mapaRoto((mapa) => {
			mapa.capas[5]?.push(nodo(5, 1, "salvaje", []));
		});
		expect(hayErrorDe(errores, 1, "capa 5")).toBe(true);
	});

	it("detecta la regla 1: menos de 6 capas", () => {
		const errores = mapaRoto((mapa) => {
			mapa.capas.pop();
		});
		expect(hayErrorDe(errores, 1, "6 capas")).toBe(true);
	});

	it("detecta un id que no cuadra con su posición", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 2, 0).id = "9-9";
		});
		expect(errores.some((e) => e.startsWith("estructura"))).toBe(true);
	});

	it("detecta la regla 2: menos de 12 nodos", () => {
		const errores = mapaRoto(dejarOnceNodos);
		expect(errores).toHaveLength(1);
		expect(hayErrorDe(errores, 2, "12 y 15")).toBe(true);
	});

	it("detecta la regla 2: una capa con un solo nodo", () => {
		const errores = mapaRoto((mapa) => {
			mapa.capas[1] = [nodoDe(mapa, 1, 0)];
			nodoDe(mapa, 0, 0).siguientes = ["1-0"];
			nodoDe(mapa, 0, 1).siguientes = ["1-0"];
		});
		expect(hayErrorDe(errores, 2, "capa 1")).toBe(true);
	});

	it("detecta la regla 3: un nodo sin siguientes", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 2, 1).siguientes = [];
		});
		expect(hayErrorDe(errores, 3, "1 o 2 siguientes")).toBe(true);
	});

	it("detecta la regla 3: una arista a otra capa", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 2, 1).siguientes = ["2-0"];
		});
		expect(hayErrorDe(errores, 3, "no está en la capa 3")).toBe(true);
	});

	it("detecta la regla 3: destinos repetidos", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 2, 1).siguientes = ["3-0", "3-0"];
		});
		expect(hayErrorDe(errores, 3, "repite")).toBe(true);
	});

	it("detecta la regla 3: destinos desordenados", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 2, 1).siguientes = ["3-1", "3-0"];
		});
		expect(hayErrorDe(errores, 3, "ordenado")).toBe(true);
	});

	it("detecta la regla 3: un nodo sin arista entrante", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 3, 1).siguientes = ["4-0", "4-1"];
		});
		expect(hayErrorDe(errores, 3, "no recibe")).toBe(true);
		expect(hayErrorDe(errores, 3, "alcanzable")).toBe(true);
	});

	it("detecta la regla 3: la capa 4 no apunta al jefe", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 4, 0).siguientes = [];
		});
		expect(hayErrorDe(errores, 3, "apuntar al jefe")).toBe(true);
	});

	it("detecta la regla 3: el jefe con siguientes", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 5, 0).siguientes = ["5-0"];
		});
		expect(hayErrorDe(errores, 3, "jefe no puede tener siguientes")).toBe(true);
	});

	it("detecta la regla 3: un nodo inalcanzable desde la entrada", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 1, 0).siguientes = ["2-1"];
			nodoDe(mapa, 1, 1).siguientes = ["2-2"];
		});
		expect(hayErrorDe(errores, 3, "alcanzable")).toBe(true);
	});

	it("detecta la regla 4: un nodo sin combate en la capa 0", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 0, 0).tipo = "evento";
		});
		expect(hayErrorDe(errores, 4, "capa 0")).toBe(true);
	});

	it("detecta la regla 4: dos alfa", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 4, 1).tipo = "alfa";
		});
		expect(hayErrorDe(errores, 4, "alfa")).toBe(true);
	});

	it("detecta la regla 4: un alfa en la capa 1", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 2, 2).tipo = "salvaje";
			nodoDe(mapa, 1, 0).tipo = "alfa";
		});
		expect(hayErrorDe(errores, 4, "capas 0 ni 1")).toBe(true);
	});

	it("detecta la regla 4: un sombrío en la capa 0", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 0, 1).tipo = "sombrio";
		});
		expect(hayErrorDe(errores, 4, "capa 0")).toBe(true);
	});

	it("detecta la regla 4: dos sombríos", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 1, 1).tipo = "sombrio";
			nodoDe(mapa, 3, 1).tipo = "sombrio";
		});
		expect(errores).toHaveLength(1);
		expect(hayErrorDe(errores, 4, "sombrío")).toBe(true);
	});

	it("detecta la regla 4: sin tienda en las capas 2 o 3", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 2, 0).tipo = "salvaje";
		});
		expect(hayErrorDe(errores, 4, "tienda")).toBe(true);
	});

	it("detecta la regla 4: dos tiendas", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 3, 0).tipo = "tienda";
		});
		expect(hayErrorDe(errores, 4, "tienda")).toBe(true);
	});

	it("detecta la regla 4: sin manantial en la capa 4", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 4, 0).tipo = "salvaje";
		});
		expect(hayErrorDe(errores, 4, "manantial")).toBe(true);
	});

	it("detecta la regla 4: tres eventos", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 1, 1).tipo = "evento";
			nodoDe(mapa, 2, 1).tipo = "evento";
			nodoDe(mapa, 4, 2).tipo = "evento";
		});
		expect(hayErrorDe(errores, 4, "evento")).toBe(true);
	});

	it("detecta la regla 4: un cofre en la capa 0", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 0, 0).tipo = "cofre";
		});
		expect(hayErrorDe(errores, 4, "cofre")).toBe(true);
	});

	it("detecta la regla 4: dos nodos sin combate enlazados", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 3, 0).tipo = "cofre";
		});
		expect(hayErrorDe(errores, 4, "enlazar")).toBe(true);
	});

	it("detecta la regla 4: el fondo de combate no es mayoritario", () => {
		const errores = mapaRoto((mapa) => {
			nodoDe(mapa, 0, 0).tipo = "evento";
			nodoDe(mapa, 1, 0).tipo = "evento";
			nodoDe(mapa, 2, 1).tipo = "evento";
			nodoDe(mapa, 3, 0).tipo = "evento";
			nodoDe(mapa, 4, 1).tipo = "evento";
			nodoDe(mapa, 4, 2).tipo = "evento";
		});
		expect(hayErrorDe(errores, 4, "mayoritarios")).toBe(true);
	});
});

/** JSON canónico congelado de `generarPiso("dorada", 1)`; si cambia la generación, cambia a propósito. */
const DORADA = `{"piso":1,"semilla":"dorada","capas":[[{"id":"0-0","capa":0,"indice":0,"tipo":"salvaje","siguientes":["1-1"]},{"id":"0-1","capa":0,"indice":1,"tipo":"salvaje","siguientes":["1-0","1-2"]},{"id":"0-2","capa":0,"indice":2,"tipo":"salvaje","siguientes":["1-2"]}],[{"id":"1-0","capa":1,"indice":0,"tipo":"entrenador","siguientes":["2-0","2-1"]},{"id":"1-1","capa":1,"indice":1,"tipo":"salvaje","siguientes":["2-0","2-1"]},{"id":"1-2","capa":1,"indice":2,"tipo":"entrenador","siguientes":["2-0","2-1"]}],[{"id":"2-0","capa":2,"indice":0,"tipo":"salvaje","siguientes":["3-0","3-1"]},{"id":"2-1","capa":2,"indice":1,"tipo":"evento","siguientes":["3-0","3-2"]}],[{"id":"3-0","capa":3,"indice":0,"tipo":"salvaje","siguientes":["4-0","4-1"]},{"id":"3-1","capa":3,"indice":1,"tipo":"tienda","siguientes":["4-0"]},{"id":"3-2","capa":3,"indice":2,"tipo":"entrenador","siguientes":["4-2"]}],[{"id":"4-0","capa":4,"indice":0,"tipo":"salvaje","siguientes":["5-0"]},{"id":"4-1","capa":4,"indice":1,"tipo":"salvaje","siguientes":["5-0"]},{"id":"4-2","capa":4,"indice":2,"tipo":"manantial","siguientes":["5-0"]}],[{"id":"5-0","capa":5,"indice":0,"tipo":"jefe","siguientes":[]}]]}`;
