import { describe, expect, it } from "vitest";
import {
	curar,
	curarAlMasHerido,
	type EstadoExpedicion,
	elegibles,
	elegirRunaInicial,
	entrar,
	esNodoDeCombate,
	iniciarExpedicion,
	liquidar,
	type ResultadoCombate,
	resolverCombate,
} from "./expedicion.js";
import type { TablaFarol } from "./farol.js";
import {
	generarPiso,
	type MapaPiso,
	type NodoMapa,
	type TipoNodo,
} from "./mapa.js";
import type { IdRuna } from "./runas.js";

/** Tipos de nodo en los que se puede librar un combate. */
const TIPOS_COMBATE: readonly TipoNodo[] = [
	"salvaje",
	"entrenador",
	"alfa",
	"sombrio",
	"jefe",
];

/** Resultado de combate ganado con los PS y el dinero indicados. */
const gana = (psPct: number[], dinero = 0): ResultadoCombate => ({
	victoria: true,
	psPct,
	dinero,
});

/** Resultado de combate perdido. */
const pierde = (psPct: number[], dinero = 0): ResultadoCombate => ({
	victoria: false,
	psPct,
	dinero,
});

/** Congela en profundidad un estado para detectar cualquier mutación. */
function congelar<T>(valor: T): T {
	if (valor === null || typeof valor !== "object") return valor;
	Object.freeze(valor);
	for (const hijo of Object.values(valor as Record<string, unknown>)) {
		congelar(hijo);
	}
	return valor;
}

/** Foto del estado para comparar antes y después. */
function foto(estado: EstadoExpedicion): string {
	return JSON.stringify(estado);
}

/** Nodo del mapa del estado; falla la prueba si no existe. */
function nodoDe(estado: EstadoExpedicion, id: string): NodoMapa {
	return nodoDelMapa(estado.mapa, id);
}

/** Nodo del mapa; falla la prueba si no existe. */
function nodoDelMapa(mapa: MapaPiso, id: string): NodoMapa {
	for (const capa of mapa.capas) {
		for (const nodo of capa) {
			if (nodo.id === id) return nodo;
		}
	}
	throw new Error(`no existe el nodo ${id}`);
}

/** Camino de ids desde la entrada hasta el primer nodo del tipo pedido. */
function caminoHasta(mapa: MapaPiso, tipo: TipoNodo): string[] | null {
	const previos = new Map<string, string | null>();
	const cola: string[] = [];
	for (const nodo of mapa.capas[0] ?? []) {
		previos.set(nodo.id, null);
		cola.push(nodo.id);
	}
	while (cola.length > 0) {
		const id = cola.shift() ?? "";
		const nodo = nodoDelMapa(mapa, id);
		if (nodo.tipo === tipo) {
			const camino: string[] = [];
			let actual: string | null = id;
			while (actual !== null) {
				camino.unshift(actual);
				actual = previos.get(actual) ?? null;
			}
			return camino;
		}
		for (const siguiente of nodo.siguientes) {
			if (!previos.has(siguiente)) {
				previos.set(siguiente, id);
				cola.push(siguiente);
			}
		}
	}
	return null;
}

/** Estado detenido en el primer nodo del tipo pedido que aparezca en algún piso 1. */
function estadoHasta(tipo: TipoNodo): EstadoExpedicion {
	for (let i = 1; i <= 40; i++) {
		const semilla = `camino${i}`;
		const camino = caminoHasta(generarPiso(semilla, 1), tipo);
		if (camino === null) continue;
		let estado = iniciarExpedicion(semilla, ["a", "b"]);
		for (const id of camino) estado = entrar(estado, id);
		return estado;
	}
	throw new Error(`ningún piso 1 tiene un nodo ${tipo}`);
}

/** Estado detenido en el jefe del piso 1. */
function estadoEnJefe(semilla: string): EstadoExpedicion {
	let estado = iniciarExpedicion(semilla, ["a", "b"]);
	while (estado.actual !== "5-0") {
		estado = entrar(estado, elegibles(estado)[0] as string);
	}
	return estado;
}

describe("iniciarExpedicion", () => {
	it("arranca en el piso 1 con el mapa del piso 1", () => {
		const estado = iniciarExpedicion("s1", ["a", "b", "c"]);
		expect(estado.piso).toBe(1);
		expect(JSON.stringify(estado.mapa)).toBe(
			JSON.stringify(generarPiso("s1", 1)),
		);
		expect(estado.actual).toBeNull();
		expect(estado.visitados).toEqual([]);
		expect(estado.dinero).toBe(0);
		expect(estado.estado).toBe("en-curso");
		expect(estado.semilla).toBe("s1");
		expect(estado.equipo).toEqual([
			{ especie: "a", psPct: 100 },
			{ especie: "b", psPct: 100 },
			{ especie: "c", psPct: 100 },
		]);
	});

	it("acepta de 1 a 6 especies y rechaza 0 o más de 6", () => {
		expect(iniciarExpedicion("s", ["a"]).equipo).toHaveLength(1);
		expect(
			iniciarExpedicion("s", ["a", "b", "c", "d", "e", "f"]).equipo,
		).toHaveLength(6);
		expect(() => iniciarExpedicion("s", [])).toThrow(RangeError);
		expect(() =>
			iniciarExpedicion("s", ["a", "b", "c", "d", "e", "f", "g"]),
		).toThrow(RangeError);
	});

	it("no comparte el arreglo de especies que recibe", () => {
		const especies = ["a", "b"];
		const estado = iniciarExpedicion("s", especies);
		especies.push("c");
		especies[0] = "z";
		expect(estado.equipo.map((m) => m.especie)).toEqual(["a", "b"]);
	});
});

describe("elegibles", () => {
	it("sin haber entrado, devuelve toda la capa 0", () => {
		const estado = iniciarExpedicion("s1", ["a"]);
		const primera = estado.mapa.capas[0] ?? [];
		expect(elegibles(estado)).toEqual(primera.map((n) => n.id));
		expect(elegibles(estado).length).toBeGreaterThanOrEqual(2);
	});

	it("dentro de un nodo, devuelve sus siguientes", () => {
		let estado = iniciarExpedicion("s1", ["a"]);
		estado = entrar(estado, elegibles(estado)[0] as string);
		expect(elegibles(estado)).toEqual(
			nodoDe(estado, estado.actual as string).siguientes,
		);
	});

	it("no comparte las listas de aristas del mapa", () => {
		const estado = iniciarExpedicion("s1", ["a"]);
		const capa0 = (estado.mapa.capas[0] ?? []).map((n) => n.id);
		elegibles(estado).push("9-9");
		expect(elegibles(estado)).toEqual(capa0);
		const dentro = entrar(estado, elegibles(estado)[0] as string);
		const siguientes = [...nodoDe(dentro, dentro.actual as string).siguientes];
		elegibles(dentro).push("9-9");
		expect(elegibles(dentro)).toEqual(siguientes);
	});

	it("fuera de curso no hay nada elegible", () => {
		const jefe = estadoEnJefe("f1");
		const derrota = resolverCombate(jefe, pierde([0, 0]));
		expect(derrota.estado).toBe("derrota");
		expect(elegibles(derrota)).toEqual([]);

		const base = iniciarExpedicion("v1", ["a"]);
		const piso3: EstadoExpedicion = {
			...base,
			piso: 3,
			mapa: generarPiso("v1", 3),
			actual: "5-0",
			visitados: ["5-0"],
		};
		const victoria = resolverCombate(piso3, gana([100]));
		expect(victoria.estado).toBe("victoria");
		expect(elegibles(victoria)).toEqual([]);
	});
});

describe("entrar", () => {
	it("rechaza un id que no es elegible", () => {
		const estado = iniciarExpedicion("s1", ["a"]);
		expect(() => entrar(estado, "2-0")).toThrow(RangeError);
		expect(() => entrar(estado, "no-existe")).toThrow(RangeError);
		const dentro = entrar(estado, elegibles(estado)[0] as string);
		expect(() => entrar(dentro, dentro.actual as string)).toThrow(RangeError);
	});

	it("marca el nodo actual y lo añade a visitados", () => {
		const estado = congelar(iniciarExpedicion("s1", ["a"]));
		const antes = foto(estado);
		const uno = elegibles(estado)[0] as string;
		const paso1 = entrar(estado, uno);
		expect(paso1.actual).toBe(uno);
		expect(paso1.visitados).toEqual([uno]);
		const dos = elegibles(paso1)[0] as string;
		const paso2 = entrar(paso1, dos);
		expect(paso2.actual).toBe(dos);
		expect(paso2.visitados).toEqual([uno, dos]);
		expect(foto(estado)).toBe(antes);
	});

	it("no comparte el arreglo de visitados entre estados", () => {
		const estado = iniciarExpedicion("s1", ["a"]);
		const uno = entrar(estado, elegibles(estado)[0] as string);
		uno.visitados.push("9-9");
		expect(estado.visitados).toEqual([]);
	});
});

describe("resolverCombate", () => {
	it("rechaza un nodo sin combate o sin nodo actual", () => {
		const sinEntrar = iniciarExpedicion("s1", ["a"]);
		expect(() => resolverCombate(sinEntrar, gana([100]))).toThrow(RangeError);
		for (const tipo of ["tienda", "manantial", "evento", "cofre"] as const) {
			const estado = estadoHasta(tipo);
			expect(() => resolverCombate(estado, gana([100, 100]))).toThrow(
				RangeError,
			);
		}
	});

	it("rechaza un psPct de longitud distinta al equipo", () => {
		const estado = estadoHasta("salvaje");
		expect(() => resolverCombate(estado, gana([100]))).toThrow(RangeError);
		expect(() => resolverCombate(estado, gana([100, 100, 100]))).toThrow(
			RangeError,
		);
	});

	it("aplica los PS acotados a 0..100 y suma el dinero", () => {
		const estado = estadoHasta("salvaje");
		const nuevo = resolverCombate(estado, {
			victoria: true,
			psPct: [150, -5],
			dinero: 25,
		});
		expect(nuevo.equipo.map((m) => m.psPct)).toEqual([100, 0]);
		expect(nuevo.dinero).toBe(25);
		expect(nuevo.estado).toBe("en-curso");
		expect(nuevo.actual).toBe(estado.actual);
		expect(elegibles(nuevo)).toEqual(elegibles(estado));
	});

	it("pierde el combate aunque queden PS: derrota", () => {
		const estado = estadoHasta("salvaje");
		const derrota = resolverCombate(estado, pierde([30, 10], 5));
		expect(derrota.estado).toBe("derrota");
		expect(derrota.equipo.map((m) => m.psPct)).toEqual([30, 10]);
		expect(derrota.dinero).toBe(5);
		expect(derrota.actual).toBe(estado.actual);
		expect(derrota.visitados).toEqual(estado.visitados);
		expect(elegibles(derrota)).toEqual([]);
	});

	it("con todo el equipo a 0 PS, derrota aunque gane", () => {
		const estado = estadoHasta("salvaje");
		const derrota = resolverCombate(estado, gana([0, 0], 7));
		expect(derrota.estado).toBe("derrota");
		expect(derrota.equipo.map((m) => m.psPct)).toEqual([0, 0]);
		expect(derrota.dinero).toBe(7);
	});

	it("ganar a un nodo normal deja la expedición en curso", () => {
		const estado = estadoHasta("entrenador");
		const nuevo = resolverCombate(estado, gana([80, 60], 12));
		expect(nuevo.estado).toBe("en-curso");
		expect(nuevo.actual).toBe(estado.actual);
		expect(nuevo.piso).toBe(estado.piso);
		expect(nuevo.dinero).toBe(12);
	});

	it("ganar al jefe del piso 1 pasa al piso 2 con mapa, entrada y visitados nuevos", () => {
		const estado = estadoEnJefe("j1");
		const nuevo = resolverCombate(estado, gana([70, 55], 40));
		expect(nuevo.estado).toBe("en-curso");
		expect(nuevo.piso).toBe(2);
		expect(JSON.stringify(nuevo.mapa)).toBe(
			JSON.stringify(generarPiso("j1", 2)),
		);
		expect(nuevo.actual).toBeNull();
		expect(nuevo.visitados).toEqual([]);
		expect(nuevo.dinero).toBe(estado.dinero + 40);
		expect(nuevo.equipo.map((m) => m.psPct)).toEqual([70, 55]);
		expect(elegibles(nuevo)).toEqual(
			(nuevo.mapa.capas[0] ?? []).map((n) => n.id),
		);
	});

	it("ganar al jefe del piso 3 termina en victoria", () => {
		const base = iniciarExpedicion("v3", ["a"]);
		const piso3: EstadoExpedicion = {
			...base,
			piso: 3,
			mapa: generarPiso("v3", 3),
			actual: "5-0",
			visitados: ["5-0"],
			dinero: 100,
		};
		const fin = resolverCombate(piso3, gana([10], 50));
		expect(fin.estado).toBe("victoria");
		expect(fin.piso).toBe(3);
		expect(JSON.stringify(fin.mapa)).toBe(JSON.stringify(piso3.mapa));
		expect(fin.actual).toBe("5-0");
		expect(fin.dinero).toBe(150);
	});

	it("rechaza resolver un combate en una expedición terminada", () => {
		const derrota = resolverCombate(estadoHasta("salvaje"), pierde([0, 0]));
		expect(() => resolverCombate(derrota, gana([100, 100]))).toThrow(
			RangeError,
		);
	});
});

describe("curar", () => {
	it("sube pct puntos sin pasar de 100 y sin revivir debilitados", () => {
		const base = iniciarExpedicion("s1", ["a", "b", "c"]);
		const estado: EstadoExpedicion = {
			...base,
			equipo: [
				{ especie: "a", psPct: 100 },
				{ especie: "b", psPct: 0 },
				{ especie: "c", psPct: 30 },
			],
		};
		const curado = curar(estado, 20);
		expect(curado.equipo.map((m) => m.psPct)).toEqual([100, 0, 50]);
		expect(curado.estado).toBe("en-curso");
		expect(curado.actual).toBe(estado.actual);
		expect(estado.equipo.map((m) => m.psPct)).toEqual([100, 0, 30]);
	});

	it("rechaza un pct que no sea entero de 1 a 100", () => {
		const estado = iniciarExpedicion("s1", ["a"]);
		for (const pct of [0, 101, -1, 1.5, Number.NaN]) {
			expect(() => curar(estado, pct)).toThrow(RangeError);
		}
		expect(curar(estado, 1).equipo[0]?.psPct).toBe(100);
		expect(curar(estado, 100).equipo[0]?.psPct).toBe(100);
	});
});

describe("liquidar", () => {
	it("en derrota conserva la mitad hacia abajo", () => {
		const base = iniciarExpedicion("s1", ["a"]);
		const derrota: EstadoExpedicion = { ...base, dinero: 7, estado: "derrota" };
		expect(liquidar(derrota)).toEqual({ dineroConservado: 3 });
		expect(liquidar({ ...derrota, dinero: 0 })).toEqual({
			dineroConservado: 0,
		});
	});

	it("en victoria conserva todo el dinero", () => {
		const base = iniciarExpedicion("s1", ["a"]);
		expect(liquidar({ ...base, dinero: 7, estado: "victoria" })).toEqual({
			dineroConservado: 7,
		});
	});

	it("en curso lanza RangeError", () => {
		expect(() => liquidar(iniciarExpedicion("s1", ["a"]))).toThrow(RangeError);
	});
});

describe("inmutabilidad y determinismo", () => {
	it("ninguna función muta el estado que recibe", () => {
		let estado = iniciarExpedicion("inm", ["a", "b"]);
		estado = entrar(estado, elegibles(estado)[0] as string);
		const congelado = congelar(estado);
		const antes = foto(congelado);
		expect(elegibles(congelado)).toEqual(elegibles(congelado));
		entrar(congelado, elegibles(congelado)[0] as string);
		resolverCombate(congelado, gana([50, 50], 3));
		curar(congelado, 10);
		expect(() => liquidar(congelado)).toThrow(RangeError);
		expect(foto(congelado)).toBe(antes);
	});

	it("mismo estado de entrada, mismo JSON de salida", () => {
		const estado = congelar(estadoHasta("salvaje"));
		const id = elegibles(estado)[0] as string;
		expect(foto(entrar(estado, id))).toBe(foto(entrar(estado, id)));
		expect(foto(resolverCombate(estado, gana([10, 20], 1)))).toBe(
			foto(resolverCombate(estado, gana([10, 20], 1))),
		);
		expect(foto(curar(estado, 33))).toBe(foto(curar(estado, 33)));
		expect(foto(iniciarExpedicion("det", ["x", "y"]))).toBe(
			foto(iniciarExpedicion("det", ["x", "y"])),
		);
	});
});

describe("expediciones completas", () => {
	it("recorre los 3 pisos tomando siempre el primer elegible hasta el jefe", () => {
		let estado = iniciarExpedicion("completa", ["a", "b", "c"]);
		const pisos = new Set<number>();
		const jefes: string[] = [];
		let combates = 0;
		for (let paso = 0; paso < 300 && estado.estado === "en-curso"; paso++) {
			const id = elegibles(estado)[0];
			expect(id).toBeDefined();
			pisos.add(estado.piso);
			estado = entrar(estado, id as string);
			const nodo = nodoDe(estado, id as string);
			if (!TIPOS_COMBATE.includes(nodo.tipo)) continue;
			if (nodo.tipo === "jefe") jefes.push(`${estado.piso}:${nodo.id}`);
			estado = resolverCombate(
				estado,
				gana(
					estado.equipo.map(() => 100),
					10,
				),
			);
			combates++;
		}
		expect(estado.estado).toBe("victoria");
		expect(estado.piso).toBe(3);
		expect([...pisos]).toEqual([1, 2, 3]);
		expect(jefes).toEqual(["1:5-0", "2:5-0", "3:5-0"]);
		expect(combates).toBeGreaterThan(3);
		expect(estado.dinero).toBe(combates * 10);
		expect(estado.visitados.at(-1)).toBe("5-0");
		expect(elegibles(estado)).toEqual([]);
		expect(liquidar(estado)).toEqual({ dineroConservado: combates * 10 });
	});

	it("se pierde a mitad de camino y se liquida la mitad del dinero", () => {
		let estado = iniciarExpedicion("media", ["a", "b"]);
		let combates = 0;
		// Ocho entradas: llega al jefe del piso 1, pasa al 2 y avanza unos nodos.
		for (let paso = 0; paso < 8; paso++) {
			expect(estado.estado).toBe("en-curso");
			estado = entrar(estado, elegibles(estado)[0] as string);
			const nodo = nodoDe(estado, estado.actual as string);
			if (!TIPOS_COMBATE.includes(nodo.tipo)) continue;
			estado = resolverCombate(
				estado,
				gana(
					estado.equipo.map(() => 100),
					10,
				),
			);
			combates++;
		}
		expect(combates).toBeGreaterThan(1);
		expect(estado.piso).toBe(2);
		// Desde un nodo sin combate la arista siempre lleva a uno de combate.
		const ultimo = nodoDe(estado, estado.actual as string);
		const enCombate = TIPOS_COMBATE.includes(ultimo.tipo)
			? estado
			: entrar(estado, elegibles(estado)[0] as string);
		const perdido = resolverCombate(
			enCombate,
			pierde(enCombate.equipo.map(() => 0)),
		);
		expect(perdido.estado).toBe("derrota");
		expect(perdido.equipo.every((m) => m.psPct === 0)).toBe(true);
		expect(perdido.dinero).toBe(combates * 10);
		expect(elegibles(perdido)).toEqual([]);
		expect(liquidar(perdido)).toEqual({
			dineroConservado: Math.floor((combates * 10) / 2),
		});
	});
});

describe("esNodoDeCombate", () => {
	it("es cierto para los cinco tipos con combate y falso para el resto", () => {
		const todos: TipoNodo[] = [
			"salvaje",
			"entrenador",
			"alfa",
			"sombrio",
			"jefe",
			"tienda",
			"manantial",
			"evento",
			"cofre",
		];
		expect(todos.filter(esNodoDeCombate)).toEqual(TIPOS_COMBATE);
	});
});

describe("curarAlMasHerido", () => {
	const equipo = (...ps: number[]) => ({
		...iniciarExpedicion("m", ["a", "b", "c"].slice(0, ps.length)),
		equipo: ps.map((psPct, i) => ({ especie: `e${i}`, psPct })),
	});

	it("cura solo al vivo con menos PS y no pasa de 100", () => {
		const e = curarAlMasHerido(equipo(80, 30, 0), 15);
		expect(e.equipo.map((m) => m.psPct)).toEqual([80, 45, 0]);
		expect(curarAlMasHerido(equipo(98, 99), 15).equipo[0]?.psPct).toBe(100);
	});

	it("si todos están debilitados o pct es 0 no cambia nada", () => {
		const caidos = equipo(0, 0);
		expect(curarAlMasHerido(caidos, 15)).toBe(caidos);
		const vivos = equipo(50);
		expect(curarAlMasHerido(vivos, 0)).toBe(vivos);
	});

	it("rechaza un pct fuera de rango", () => {
		expect(() => curarAlMasHerido(equipo(50), 101)).toThrow(RangeError);
		expect(() => curarAlMasHerido(equipo(50), 1.5)).toThrow(RangeError);
	});
});

describe("recompensas de nodo", () => {
	it("el Alfa da una runa misterio; con la mochila llena o ya con '?' no da otra", () => {
		const e = estadoHasta("alfa");
		expect(resolverCombate(e, gana([100, 100])).runas).toEqual(["?"]);
		const llena = { ...e, runas: ["A", "C", "F", "S", "?"] as IdRuna[] };
		expect(resolverCombate(llena, gana([100, 100])).runas).toEqual(llena.runas);
		const conMisterio = { ...e, runas: ["?"] as IdRuna[] };
		expect(resolverCombate(conMisterio, gana([100, 100])).runas).toEqual(["?"]);
	});

	it("un salvaje o un entrenador no dan runa", () => {
		for (const tipo of ["salvaje", "entrenador"] as const) {
			expect(
				resolverCombate(estadoHasta(tipo), gana([100, 100])).runas,
			).toEqual([]);
		}
	});

	it("el Sombrío vencido se anota si se rinde: determinista, y la runa S lo favorece", () => {
		const e = estadoHasta("sombrio");
		const rinde = (base: EstadoExpedicion, rival: string) =>
			resolverCombate(base, { ...gana([100, 100]), rival }).pendientesPurificar;
		expect(rinde(e, "gastly")).toEqual(rinde(e, "gastly"));
		let sinS = 0;
		let conS = 0;
		for (let i = 0; i < 200; i++) {
			const base = { ...e, semilla: `${e.semilla}${i}` };
			sinS += rinde(base, "gastly").length;
			conS += rinde({ ...base, runas: ["S"] }, "gastly").length;
		}
		expect(sinS).toBeGreaterThan(0);
		expect(sinS).toBeLessThan(200);
		expect(conS).toBeGreaterThan(sinS);
	});

	it("un Sombrío sin especie de rival o derrotado no se anota", () => {
		const e = estadoHasta("sombrio");
		expect(resolverCombate(e, gana([100, 100])).pendientesPurificar).toEqual(
			[],
		);
		expect(resolverCombate(e, pierde([0, 0])).pendientesPurificar).toEqual([]);
	});

	it("al vencer al jefe del piso se revelan los misterios de la mochila", () => {
		const e = { ...estadoEnJefe("rev"), runas: ["?"] as IdRuna[] };
		const siguiente = resolverCombate(e, gana([100, 100]));
		expect(siguiente.piso).toBe(2);
		expect(siguiente.runas).toHaveLength(1);
		expect(siguiente.runas[0]).not.toBe("?");
	});
});

describe("llamas del Farol", () => {
	const FAROL: TablaFarol = {
		base: 1,
		extraPorRango: [0, 1, 2],
		maximo: 3,
		restaTenue: 1,
		repetibles: ["jefe"],
	};
	const conLlamas = (e: EstadoExpedicion, llamas: number) => ({ ...e, llamas });

	it("sin llamas (o sin tabla) perder termina la expedición, como siempre", () => {
		const jefe = estadoEnJefe("f1");
		expect(resolverCombate(jefe, pierde([50, 0])).estado).toBe("derrota");
		expect(resolverCombate(conLlamas(jefe, 2), pierde([50, 0])).estado).toBe(
			"derrota",
		);
		expect(resolverCombate(jefe, pierde([50, 0]), FAROL).estado).toBe(
			"derrota",
		);
	});

	it("perder con una llama sigue en el nodo, gasta una llama y marca el fallo", () => {
		const jefe = conLlamas(estadoEnJefe("f1"), 2);
		const r = resolverCombate(jefe, pierde([50, 0], 99), FAROL);
		expect(r.estado).toBe("en-curso");
		expect(r.llamas).toBe(1);
		expect(r.fallidos).toEqual([jefe.actual]);
		expect(r.actual).toBe(jefe.actual);
		expect(r.dinero).toBe(jefe.dinero);
		expect(r.equipo.map((m) => m.psPct)).toEqual([50, 0]);
	});

	it("un jefe perdido se puede repetir; entrar lo consume", () => {
		const jefe = conLlamas(estadoEnJefe("f1"), 2);
		const r = resolverCombate(jefe, pierde([50, 0]), FAROL);
		expect(r.repetir).toBe(jefe.actual);
		expect(elegibles(r)).toContain(jefe.actual as string);
		const otra = entrar(r, jefe.actual as string);
		expect(otra.repetir).toBeUndefined();
		expect(otra.llamas).toBe(1);
	});

	it("sin llamas restantes o sin conscientes termina en derrota", () => {
		const jefe = estadoEnJefe("f1");
		expect(
			resolverCombate(conLlamas(jefe, 0), pierde([50, 0]), FAROL).estado,
		).toBe("derrota");
		expect(
			resolverCombate(conLlamas(jefe, 3), pierde([0, 0]), FAROL).estado,
		).toBe("derrota");
	});

	it("un nodo que no es repetible no deja reintento", () => {
		const base = conLlamas(estadoHasta("salvaje"), 1);
		const r = resolverCombate(
			base,
			pierde(base.equipo.map((_, i) => (i === 0 ? 40 : 0))),
			FAROL,
		);
		expect(r.estado).toBe("en-curso");
		expect(r.repetir).toBeUndefined();
		expect(elegibles(r)).not.toContain(base.actual as string);
	});

	it("no muta el estado de entrada", () => {
		const jefe = congelar(conLlamas(estadoEnJefe("f1"), 2));
		const antes = foto(jefe);
		resolverCombate(jefe, pierde([50, 0]), FAROL);
		expect(foto(jefe)).toBe(antes);
	});
});

describe("Bendición del Viajero: elegirRunaInicial", () => {
	const base = (): EstadoExpedicion => ({
		...iniciarExpedicion("b1", ["a"]),
		runaPendiente: ["A", "C", "S"],
	});

	it("añade la runa elegida a la mochila y cierra la elección", () => {
		const e = elegirRunaInicial(base(), "C");
		expect(e.runas).toEqual(["C"]);
		expect(e.runaPendiente).toBeUndefined();
	});

	it("rechaza una runa que no se ofreció o si no hay elección pendiente", () => {
		expect(() => elegirRunaInicial(base(), "F")).toThrow(RangeError);
		expect(() =>
			elegirRunaInicial(iniciarExpedicion("b1", ["a"]), "A"),
		).toThrow(RangeError);
	});

	it("no muta el estado de entrada", () => {
		const e = congelar(base());
		const antes = foto(e);
		elegirRunaInicial(e, "A");
		expect(foto(e)).toBe(antes);
	});
});
