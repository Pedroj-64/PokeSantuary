import { crearRng, type Rng } from "./rng.js";

/** Tipos de nodo que puede albergar un piso de expedición. */
export type TipoNodo =
	| "salvaje"
	| "entrenador"
	| "alfa"
	| "sombrio"
	| "tienda"
	| "manantial"
	| "evento"
	| "cofre"
	| "jefe";

/** Casilla del mapa; sus aristas salen siempre hacia la capa inmediatamente siguiente. */
export interface NodoMapa {
	/** `${capa}-${indice}`, p. ej. "2-1". */
	id: string;
	/** Capa del nodo, de 0 a 5. */
	capa: number;
	/** Posición dentro de la capa, desde 0. */
	indice: number;
	/** Tipo de encuentro del nodo. */
	tipo: TipoNodo;
	/** Ids de la capa siguiente, ordenados y sin repetidos. */
	siguientes: string[];
}

/** Mapa completo de un piso: `capas[0]` es la entrada y `capas[5]` el jefe. */
export interface MapaPiso {
	piso: 1 | 2 | 3;
	semilla: string;
	capas: NodoMapa[][];
}

const NUMERO_CAPAS = 6;
const CAPA_JEFE = 5;
const MIN_NODOS = 12;
const MAX_NODOS = 15;
const MIN_NODOS_POR_CAPA = 2;
const MAX_NODOS_POR_CAPA = 3;

/** Tipos que no son combate; dos de ellos no pueden quedar enlazados. */
const TIPOS_SIN_COMBATE: readonly TipoNodo[] = [
	"tienda",
	"manantial",
	"evento",
	"cofre",
];

/** Capas donde puede colocarse cada tipo repartido con el rng. */
const CAPAS_PERMITIDAS: Partial<Record<TipoNodo, readonly number[]>> = {
	tienda: [2, 3],
	manantial: [4],
	alfa: [2, 3, 4],
	sombrio: [1, 2, 3, 4],
	evento: [1, 2, 3, 4],
	cofre: [1, 2, 3, 4],
};

/** ¿El tipo es un nodo sin combate? */
function sinCombate(tipo: TipoNodo): boolean {
	return TIPOS_SIN_COMBATE.includes(tipo);
}

/** Elige un elemento al azar con el rng; el arreglo no puede estar vacío. */
function elegir<T>(rng: Rng, opciones: readonly T[]): T {
	const primero = opciones[0];
	if (primero === undefined) {
		throw new RangeError("elegir(): se esperaba un arreglo no vacío");
	}
	return opciones[rng.entero(0, opciones.length - 1)] ?? primero;
}

/** Índice numérico del id `${capa}-${indice}`. */
function indiceDeId(id: string): number {
	return Number(id.split("-")[1] ?? "-1");
}

/**
 * Reparte los nodos del piso: sortea el total (12 a 15), arranca con 2 nodos por
 * capa y reparte los que sobran entre capas elegidas con el rng (máximo 3).
 */
function repartirCapas(rng: Rng): { total: number; largos: number[] } {
	const total = rng.entero(MIN_NODOS, MAX_NODOS);
	const largos = [2, 2, 2, 2, 2];
	let colocados = largos.length * MIN_NODOS_POR_CAPA;
	while (colocados < total - 1) {
		const conHueco: number[] = [];
		for (let i = 0; i < largos.length; i++) {
			if ((largos[i] ?? MAX_NODOS_POR_CAPA) < MAX_NODOS_POR_CAPA)
				conHueco.push(i);
		}
		const capa = elegir(rng, conHueco);
		largos[capa] = (largos[capa] ?? MIN_NODOS_POR_CAPA) + 1;
		colocados++;
	}
	return { total, largos };
}

/** Crea las 6 capas con sus nodos, todavía sin aristas ni tipos repartidos. */
function crearCapas(largos: readonly number[]): NodoMapa[][] {
	const capas: NodoMapa[][] = [];
	for (let c = 0; c < CAPA_JEFE; c++) {
		const largo = largos[c] ?? MIN_NODOS_POR_CAPA;
		const nodos: NodoMapa[] = [];
		for (let i = 0; i < largo; i++) {
			nodos.push({
				id: `${c}-${i}`,
				capa: c,
				indice: i,
				tipo: "salvaje",
				siguientes: [],
			});
		}
		capas.push(nodos);
	}
	capas.push([
		{
			id: `${CAPA_JEFE}-0`,
			capa: CAPA_JEFE,
			indice: 0,
			tipo: "jefe",
			siguientes: [],
		},
	]);
	return capas;
}

/**
 * Reparte los tipos con el rng. Coloca primero los nodos obligatorios (tienda y
 * manantial), luego los opcionales mientras quepa en el presupuesto y deja el
 * resto como fondo de combate (`salvaje` o `entrenador`), que debe ser el más
 * frecuente. Como mucho hay un nodo sin combate por capa, de modo que toda capa
 * conserva al menos un nodo de combate para tender aristas.
 */
function asignarTipos(rng: Rng, capas: NodoMapa[][], total: number): void {
	const nodos: NodoMapa[] = [];
	for (let c = 0; c < CAPA_JEFE; c++) nodos.push(...(capas[c] ?? []));
	const libres = new Set(nodos.map((n) => n.id));
	const capasConSinCombate = new Set<number>();

	// Presupuesto de tipos especiales: así el fondo de combate es mayoritario.
	const maxEspeciales = Math.max(2, Math.floor((total - 1) / 2) - 1);
	const especiales: TipoNodo[] = ["tienda", "manantial"];
	if (rng.siguiente() < 0.5) especiales.push("alfa");
	if (rng.siguiente() < 0.5) especiales.push("sombrio");
	if (rng.siguiente() < 0.5) especiales.push("evento");
	if (rng.siguiente() < 0.5) especiales.push("cofre");
	while (especiales.length > maxEspeciales) especiales.pop();

	// Los nodos sin combate van primero: su reparto por capas es el más estrecho.
	const orden: TipoNodo[] = [
		...especiales.filter((tipo) => sinCombate(tipo)),
		...especiales.filter((tipo) => !sinCombate(tipo)),
	];
	const huecos = (capa: number): NodoMapa[] =>
		(capas[capa] ?? []).filter((nodo) => libres.has(nodo.id));

	for (const tipo of orden) {
		const candidatas: number[] = [];
		for (const capa of CAPAS_PERMITIDAS[tipo] ?? []) {
			if (sinCombate(tipo) && capasConSinCombate.has(capa)) continue;
			if (huecos(capa).length > 0) candidatas.push(capa);
		}
		if (candidatas.length === 0) continue;
		const capa = elegir(rng, candidatas);
		const nodo = elegir(rng, huecos(capa));
		nodo.tipo = tipo;
		libres.delete(nodo.id);
		if (sinCombate(tipo)) capasConSinCombate.add(capa);
	}

	for (const nodo of nodos) {
		if (!libres.has(nodo.id)) continue;
		nodo.tipo = rng.siguiente() < 0.5 ? "entrenador" : "salvaje";
	}
}

/** Añade una arista al origen y anota su cupo de salidas. */
function enlazarUno(
	origen: NodoMapa,
	destino: NodoMapa,
	cupo: Map<string, number>,
): void {
	origen.siguientes.push(destino.id);
	cupo.set(origen.id, (cupo.get(origen.id) ?? 0) + 1);
}

/**
 * Tiende las aristas capa a capa. Garantiza por construcción, sin reintentos:
 * que todo nodo de las capas 1 a 5 reciba alguna entrante, que cada nodo de las
 * capas 0 a 4 saque 1 o 2 aristas, que los nodos de la capa 4 apunten al jefe y
 * que nadie quede enlazado con otro nodo sin combate.
 */
function enlazar(rng: Rng, capas: NodoMapa[][]): void {
	for (let c = 0; c < CAPA_JEFE; c++) {
		const actuales = capas[c] ?? [];
		const destinos = capas[c + 1] ?? [];
		const cupo = new Map<string, number>();

		// 1) Cobertura: los destinos sin combate primero, porque solo admiten
		//    orígenes de combate; así ninguno se queda sin arista entrante.
		const ordenados = [...destinos].sort(
			(a, b) =>
				Number(sinCombate(b.tipo)) - Number(sinCombate(a.tipo)) ||
				a.indice - b.indice,
		);
		for (const destino of ordenados) {
			const admisibles = actuales.filter(
				(origen) =>
					!(sinCombate(origen.tipo) && sinCombate(destino.tipo)) &&
					(cupo.get(origen.id) ?? 0) < 2,
			);
			if (admisibles.length === 0) continue;
			enlazarUno(elegir(rng, admisibles), destino, cupo);
		}

		// 2) Salida garantizada: toda capa tiene algún nodo de combate, así que
		//    siempre existe un destino compatible.
		for (const origen of actuales) {
			if ((cupo.get(origen.id) ?? 0) > 0) continue;
			const admisibles = destinos.filter(
				(destino) => !(sinCombate(origen.tipo) && sinCombate(destino.tipo)),
			);
			enlazarUno(origen, elegir(rng, admisibles), cupo);
		}

		// 3) Segunda arista opcional, sorteada por el rng.
		for (const origen of actuales) {
			if ((cupo.get(origen.id) ?? 0) !== 1) continue;
			const libres = destinos.filter(
				(destino) =>
					!origen.siguientes.includes(destino.id) &&
					!(sinCombate(origen.tipo) && sinCombate(destino.tipo)),
			);
			if (libres.length > 0 && rng.siguiente() < 0.5) {
				enlazarUno(origen, elegir(rng, libres), cupo);
			}
		}
	}

	for (const capa of capas) {
		for (const nodo of capa) {
			nodo.siguientes.sort((a, b) => indiceDeId(a) - indiceDeId(b));
		}
	}
}

/**
 * Genera el mapa de un piso de expedición al estilo Slay the Spire.
 *
 * Es determinista: con la misma `semilla` y el mismo `piso` devuelve siempre el
 * mismo JSON. El mapa que devuelve cumple todas las reglas que comprueba
 * {@link validarMapa}.
 *
 * @param semilla Semilla del generador; debe ser una cadena.
 * @param piso Número de piso, 1, 2 o 3.
 * @throws {TypeError} Si `semilla` no es una cadena.
 * @throws {RangeError} Si `piso` no es 1, 2 ni 3.
 */
export function generarPiso(semilla: string, piso: 1 | 2 | 3): MapaPiso {
	if (typeof semilla !== "string") {
		throw new TypeError(
			`generarPiso(): 'semilla' debe ser una cadena (recibido ${typeof semilla})`,
		);
	}
	if (piso !== 1 && piso !== 2 && piso !== 3) {
		throw new RangeError(
			`generarPiso(): 'piso' debe ser 1, 2 o 3 (recibido ${String(piso)})`,
		);
	}
	const rng = crearRng(`${semilla}:piso${piso}`);
	const { total, largos } = repartirCapas(rng);
	const capas = crearCapas(largos);
	asignarTipos(rng, capas, total);
	enlazar(rng, capas);
	return { piso, semilla, capas };
}

/** Ids alcanzables desde `inicio` siguiendo las aristas que da `aristas`. */
function alcanzables(
	inicio: readonly NodoMapa[],
	aristas: (id: string) => readonly string[],
): Set<string> {
	const vistos = new Set<string>();
	const pila = inicio.map((nodo) => nodo.id);
	while (pila.length > 0) {
		const id = pila.pop();
		if (id === undefined || vistos.has(id)) continue;
		vistos.add(id);
		for (const siguiente of aristas(id)) pila.push(siguiente);
	}
	return vistos;
}

/**
 * Comprueba las reglas 1 a 4 del mapa y devuelve un mensaje por cada una que se
 * rompa, o `[]` si el mapa es válido.
 *
 * Se interpreta "salvaje y entrenador claramente los más frecuentes" como que
 * suman al menos la mitad de los nodos sin jefe.
 *
 * @param mapa Mapa a revisar.
 * @returns Lista de mensajes de error, vacía si todo es correcto.
 */
export function validarMapa(mapa: MapaPiso): string[] {
	const errores: string[] = [];
	if (mapa === null || typeof mapa !== "object") {
		return ["estructura: se esperaba un mapa"];
	}
	if (mapa.piso !== 1 && mapa.piso !== 2 && mapa.piso !== 3) {
		errores.push("estructura: 'piso' debe ser 1, 2 o 3");
	}
	if (typeof mapa.semilla !== "string") {
		errores.push("estructura: 'semilla' debe ser una cadena");
	}
	if (!Array.isArray(mapa.capas)) {
		return [...errores, `regla 1: se esperaban ${NUMERO_CAPAS} capas`];
	}
	if (mapa.capas.length !== NUMERO_CAPAS) {
		errores.push(
			`regla 1: se esperaban ${NUMERO_CAPAS} capas y hay ${mapa.capas.length}`,
		);
	}

	const capas: NodoMapa[][] = [];
	for (let c = 0; c < NUMERO_CAPAS; c++) {
		const capa = mapa.capas[c];
		if (!Array.isArray(capa)) {
			errores.push(`regla 1: la capa ${c} debe ser un arreglo de nodos`);
			capas.push([]);
			continue;
		}
		capas.push(capa);
	}

	const todos: NodoMapa[] = [];
	for (let c = 0; c < capas.length; c++) {
		const capa = capas[c] ?? [];
		for (const [i, nodo] of capa.entries()) {
			todos.push(nodo);
			if (nodo.id !== `${c}-${i}` || nodo.capa !== c || nodo.indice !== i) {
				errores.push(
					`estructura: el nodo en la posición ${c}-${i} declara id/capa/indice incoherentes (${nodo.id}/${nodo.capa}/${nodo.indice})`,
				);
			}
		}
	}

	const porId = new Map<string, NodoMapa>();
	for (const nodo of todos) {
		if (porId.has(nodo.id))
			errores.push(`estructura: id repetido '${nodo.id}'`);
		porId.set(nodo.id, nodo);
	}

	// Regla 1: estructura de capas y unicidad del jefe.
	const capaJefe = capas[CAPA_JEFE] ?? [];
	if (capaJefe.length !== 1) {
		errores.push(
			`regla 1: la capa ${CAPA_JEFE} debe tener exactamente un nodo (tiene ${capaJefe.length})`,
		);
	}
	const jefe = capaJefe[0];
	if (jefe !== undefined && jefe.tipo !== "jefe") {
		errores.push(`regla 1: la capa ${CAPA_JEFE} debe contener el jefe`);
	}
	for (const nodo of todos) {
		if (nodo.tipo === "jefe" && nodo.capa !== CAPA_JEFE) {
			errores.push(
				`regla 1: el nodo ${nodo.id} es jefe y está en la capa ${nodo.capa}`,
			);
		}
	}

	// Regla 2: número de nodos.
	if (todos.length < MIN_NODOS || todos.length > MAX_NODOS) {
		errores.push(
			`regla 2: el piso debe tener entre ${MIN_NODOS} y ${MAX_NODOS} nodos (tiene ${todos.length})`,
		);
	}
	for (let c = 0; c < CAPA_JEFE; c++) {
		const largo = (capas[c] ?? []).length;
		if (largo < MIN_NODOS_POR_CAPA || largo > MAX_NODOS_POR_CAPA) {
			errores.push(
				`regla 2: la capa ${c} debe tener ${MIN_NODOS_POR_CAPA} o ${MAX_NODOS_POR_CAPA} nodos (tiene ${largo})`,
			);
		}
	}

	// Regla 3: aristas.
	for (const nodo of todos) {
		const validos = new Set(
			(capas[nodo.capa + 1] ?? []).map((siguiente) => siguiente.id),
		);
		for (const destino of nodo.siguientes) {
			if (!validos.has(destino)) {
				errores.push(
					`regla 3: el nodo ${nodo.id} apunta a ${destino}, que no está en la capa ${nodo.capa + 1}`,
				);
			}
		}
		if (new Set(nodo.siguientes).size !== nodo.siguientes.length) {
			errores.push(`regla 3: 'siguientes' de ${nodo.id} repite algún destino`);
		}
		const ordenados = [...nodo.siguientes].sort(
			(a, b) => indiceDeId(a) - indiceDeId(b),
		);
		if (nodo.siguientes.some((id, i) => ordenados[i] !== id)) {
			errores.push(`regla 3: 'siguientes' de ${nodo.id} no está ordenado`);
		}
		if (
			nodo.capa < CAPA_JEFE &&
			(nodo.siguientes.length < 1 || nodo.siguientes.length > 2)
		) {
			errores.push(
				`regla 3: el nodo ${nodo.id} debe tener 1 o 2 siguientes (tiene ${nodo.siguientes.length})`,
			);
		}
		if (nodo.capa === CAPA_JEFE && nodo.siguientes.length > 0) {
			errores.push(`regla 3: el jefe no puede tener siguientes`);
		}
	}

	const entrantes = new Map<string, number>();
	const predecesores = new Map<string, string[]>();
	for (const nodo of todos) {
		for (const destino of nodo.siguientes) {
			entrantes.set(destino, (entrantes.get(destino) ?? 0) + 1);
			const lista = predecesores.get(destino) ?? [];
			lista.push(nodo.id);
			predecesores.set(destino, lista);
		}
	}
	for (let c = 1; c < NUMERO_CAPAS; c++) {
		for (const nodo of capas[c] ?? []) {
			if ((entrantes.get(nodo.id) ?? 0) === 0) {
				errores.push(
					`regla 3: el nodo ${nodo.id} no recibe ninguna arista entrante`,
				);
			}
		}
	}

	const idJefe = jefe?.id;
	for (const nodo of capas[CAPA_JEFE - 1] ?? []) {
		if (idJefe === undefined || !nodo.siguientes.includes(idJefe)) {
			errores.push(
				`regla 3: el nodo ${nodo.id} de la capa ${CAPA_JEFE - 1} debe apuntar al jefe`,
			);
		}
	}

	const desdeEntrada = alcanzables(
		capas[0] ?? [],
		(id) => porId.get(id)?.siguientes ?? [],
	);
	for (const nodo of todos) {
		if (!desdeEntrada.has(nodo.id)) {
			errores.push(
				`regla 3: el nodo ${nodo.id} no es alcanzable desde la entrada`,
			);
		}
	}
	const hastaElJefe = alcanzables(
		jefe === undefined ? [] : [jefe],
		(id) => predecesores.get(id) ?? [],
	);
	for (const nodo of todos) {
		if (!hastaElJefe.has(nodo.id)) {
			errores.push(`regla 3: el nodo ${nodo.id} no puede alcanzar al jefe`);
		}
	}

	// Regla 4: tipos.
	const cuantos = (tipo: TipoNodo): number =>
		todos.filter((nodo) => nodo.tipo === tipo).length;
	for (const nodo of capas[0] ?? []) {
		if (nodo.tipo !== "salvaje" && nodo.tipo !== "entrenador") {
			errores.push(
				`regla 4: la capa 0 solo admite salvaje o entrenador (${nodo.id} es ${nodo.tipo})`,
			);
		}
	}
	if (cuantos("alfa") > 1) {
		errores.push("regla 4: como máximo un nodo alfa en el piso");
	}
	if (todos.some((nodo) => nodo.tipo === "alfa" && nodo.capa < 2)) {
		errores.push("regla 4: el alfa no puede estar en las capas 0 ni 1");
	}
	if (cuantos("sombrio") > 1) {
		errores.push("regla 4: como máximo un nodo sombrío en el piso");
	}
	const tiendas = todos.filter((nodo) => nodo.tipo === "tienda");
	if (tiendas.length > 1) {
		errores.push(
			`regla 4: como máximo una tienda en el piso (hay ${tiendas.length})`,
		);
	}
	if (!tiendas.some((nodo) => nodo.capa === 2 || nodo.capa === 3)) {
		errores.push("regla 4: falta una tienda en las capas 2 o 3");
	}
	if (!todos.some((nodo) => nodo.tipo === "manantial" && nodo.capa === 4)) {
		errores.push("regla 4: falta un manantial en la capa 4");
	}
	if (cuantos("evento") > 2) {
		errores.push(
			`regla 4: como máximo dos eventos en el piso (hay ${cuantos("evento")})`,
		);
	}
	if (cuantos("cofre") > 2) {
		errores.push(
			`regla 4: como máximo dos cofres en el piso (hay ${cuantos("cofre")})`,
		);
	}
	for (const nodo of todos) {
		for (const destino of nodo.siguientes) {
			const otro = porId.get(destino);
			if (
				otro !== undefined &&
				sinCombate(nodo.tipo) &&
				sinCombate(otro.tipo)
			) {
				errores.push(
					`regla 4: no se pueden enlazar dos nodos sin combate (${nodo.id} ${nodo.tipo} -> ${otro.id} ${otro.tipo})`,
				);
			}
		}
	}
	const fondo = cuantos("salvaje") + cuantos("entrenador");
	const sinJefe = Math.max(todos.length - 1, 0);
	if (fondo * 2 < sinJefe) {
		errores.push(
			`regla 4: 'salvaje' y 'entrenador' deben ser mayoritarios (${fondo} de ${sinJefe} nodos sin jefe)`,
		);
	}

	return errores;
}
