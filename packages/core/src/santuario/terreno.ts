import { crearRng } from "../rng.js";
import {
	type AccionMarcada,
	type EstadoSantuario,
	esAreaUtil,
	type Loseta,
	type SantuarioBalance,
	type Tarea,
	type Terreno,
	type TipoLoseta,
} from "./estado.js";
import type { EventoSantuario, Paso } from "./jornada.js";

/** Jornadas que tarda un árbol joven en hacerse árbol. */
const JORNADAS_ARBOL_JOVEN = 2;
/** Madera que da talar un árbol (GDD §11.6). */
const MADERA_POR_ARBOL = 3;
/** Piedra que da partir una roca (GDD §11.6). */
const PIEDRA_POR_ROCA = 2;
/** Usos para subir de nivel una Especialidad (GDD §11.5). */
const USOS_NIVEL_2 = 10;
const USOS_NIVEL_3 = 30;
/** Lado del claro de tierra que rodea al Árbol Cenit. */
const LADO_CLARO = 7;
/** Rocas y manchas de hierba alta que reparte la isla rota. */
const ROCAS = 14;
const MANCHAS_HIERBA = 8;
const LADO_MANCHA = 2;

/** Tarea de quien ya gastó la jornada. */
const SIN_TAREA: Tarea = { tipo: "nada" };

/** Nivel de una Especialidad según sus usos acumulados. */
export function nivelEspecialidad(usos: number): number {
	if (usos >= USOS_NIVEL_3) return 3;
	if (usos >= USOS_NIVEL_2) return 2;
	return 1;
}

/** ¿La casilla está dentro de la isla? */
export function enIsla(t: Terreno, x: number, y: number): boolean {
	return (
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		x >= 0 &&
		y >= 0 &&
		x < t.ancho &&
		y < t.alto
	);
}

/**
 * Loseta de la casilla.
 *
 * @throws {RangeError} Si la casilla queda fuera de la isla.
 */
export function loseta(t: Terreno, x: number, y: number): Loseta {
	if (!enIsla(t, x, y)) {
		throw new RangeError(`loseta(): (${x}, ${y}) está fuera de la isla`);
	}
	const l = t.losetas[y * t.ancho + x];
	if (l === undefined) {
		throw new RangeError(`loseta(): falta la loseta (${x}, ${y})`);
	}
	return l;
}

/** Tipos de las cuatro losetas ortogonales (las de fuera no cuentan). */
export function vecinosDe(t: Terreno, x: number, y: number): TipoLoseta[] {
	return vecinosEn(t.losetas, t.ancho, t.alto, x, y);
}

function vecinosEn(
	losetas: Loseta[],
	ancho: number,
	alto: number,
	x: number,
	y: number,
): TipoLoseta[] {
	const tipos: TipoLoseta[] = [];
	for (const [dx, dy] of [
		[0, -1],
		[-1, 0],
		[1, 0],
		[0, 1],
	]) {
		const nx = x + (dx ?? 0);
		const ny = y + (dy ?? 0);
		if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
		const l = losetas[ny * ancho + nx];
		if (l !== undefined) tipos.push(l.tipo);
	}
	return tipos;
}

/**
 * Especialidades que pueden actuar sobre la loseta ahora mismo. `vecinos` son
 * los tipos de las cuatro losetas de al lado: con dos vecinas de agua, regar
 * amplía el estanque aunque la tierra ya esté húmeda.
 */
export function accionesPosibles(l: Loseta, vecinos: TipoLoseta[]): string[] {
	const acciones: string[] = [];
	const agua = vecinos.filter((t) => t === "agua").length;
	if (
		l.objeto === "brote" ||
		(l.objeto === undefined &&
			(l.tipo === "yerma" || l.tipo === "tierra" || l.tipo === "pradera"))
	) {
		acciones.push("crecer");
	}
	if (
		(l.tipo === "tierra" || l.tipo === "pradera") &&
		l.objeto === undefined &&
		(!l.humedad || (l.tipo === "tierra" && agua >= 2))
	) {
		acciones.push("regar");
	}
	if (l.tipo === "roca") acciones.push("romper");
	if (
		l.objeto === "arbol" ||
		(l.tipo === "hierba-alta" && l.objeto === undefined)
	) {
		acciones.push("cortar");
	}
	if (l.objeto === "farol" || l.objeto === "fogata") acciones.push("encender");
	return acciones;
}

/** Texto corto de la loseta para los eventos de la escena. */
function describir(l: Loseta): string {
	if (l.objeto !== undefined) {
		return l.encendido ? `${l.objeto}-encendido` : l.objeto;
	}
	return l.humedad ? `${l.tipo}-humeda` : l.tipo;
}

/**
 * Reparte la isla rota: un claro de tierra de 7 x 7 alrededor del centro, un
 * camino hacia el borde, un lago con su orla de arena, rocas y manchas de
 * hierba alta. Determinista por `semilla + ":terreno"`.
 *
 * @throws {RangeError} Si las medidas de la isla no son válidas.
 */
export function terrenoInicial(semilla: string, b: SantuarioBalance): Terreno {
	const { ancho, alto } = b.isla;
	if (
		!Number.isInteger(ancho) ||
		!Number.isInteger(alto) ||
		ancho < 1 ||
		alto < 1
	) {
		throw new RangeError(
			`terrenoInicial(): la isla debe medir al menos 1 x 1 (recibido ${ancho} x ${alto})`,
		);
	}
	const rng = crearRng(`${semilla}:terreno`);
	const losetas: Loseta[] = Array.from({ length: ancho * alto }, () => ({
		tipo: "yerma",
		edad: 0,
		humedad: false,
		encendido: false,
	}));
	const poner = (x: number, y: number, tipo: TipoLoseta): void => {
		if (x < 0 || y < 0 || x >= ancho || y >= alto) return;
		losetas[y * ancho + x] = {
			tipo,
			edad: 0,
			humedad: false,
			encendido: false,
		};
	};

	const centroX = Math.floor(ancho / 2);
	const centroY = Math.floor(alto / 2);
	const medio = Math.floor(LADO_CLARO / 2);
	const claro = {
		x0: centroX - medio,
		x1: centroX + medio,
		y0: centroY - medio,
		y1: centroY + medio,
	};

	// Claro de tierra donde vive el Árbol Cenit.
	for (let y = claro.y0; y <= claro.y1; y++)
		for (let x = claro.x0; x <= claro.x1; x++) poner(x, y, "tierra");

	// Camino desde el borde sur del claro hasta la costa.
	for (let y = claro.y1; y < alto; y++) poner(centroX, y, "camino");

	// Lago con orla de arena, en el oeste y lejos del claro y del camino.
	const radio = 2 + rng.entero(0, 1);
	const minX = radio + 1;
	const maxX = Math.max(minX, claro.x0 - radio - 2);
	const minY = radio + 1;
	const maxY = Math.max(minY, alto - radio - 2);
	const lagoX = rng.entero(minX, maxX);
	const lagoY = rng.entero(minY, maxY);
	for (let y = lagoY - radio - 1; y <= lagoY + radio + 1; y++) {
		for (let x = lagoX - radio - 1; x <= lagoX + radio + 1; x++) {
			const d = Math.hypot(x - lagoX, y - lagoY);
			if (d <= radio) poner(x, y, "agua");
			else if (d <= radio + 1) poner(x, y, "arena");
		}
	}

	// Rocas sueltas y manchas de hierba alta sobre lo que siga yermo.
	let piedras = 0;
	for (let intentos = 0; intentos < 200 && piedras < ROCAS; intentos++) {
		const x = rng.entero(0, ancho - 1);
		const y = rng.entero(0, alto - 1);
		if (losetas[y * ancho + x]?.tipo !== "yerma") continue;
		poner(x, y, "roca");
		piedras++;
	}
	for (let mancha = 0; mancha < MANCHAS_HIERBA; mancha++) {
		const x = rng.entero(0, Math.max(0, ancho - LADO_MANCHA));
		const y = rng.entero(0, Math.max(0, alto - LADO_MANCHA));
		for (let j = 0; j < LADO_MANCHA; j++)
			for (let i = 0; i < LADO_MANCHA; i++) {
				const lx = x + i;
				const ly = y + j;
				if (losetas[ly * ancho + lx]?.tipo === "yerma")
					poner(lx, ly, "hierba-alta");
			}
	}

	return { ancho, alto, losetas };
}

/**
 * Marca una acción de Especialidad sobre la loseta (y su área según el nivel).
 *
 * @throws {RangeError} Si el residente no existe, no está disponible, no tiene
 * la Especialidad, ya tiene otra tarea, la casilla no admite la acción o el
 * área entera queda fuera de lo que la admite.
 */
export function marcarAccion(
	e: EstadoSantuario,
	uid: string,
	accion: string,
	x: number,
	y: number,
	_b: SantuarioBalance,
): EstadoSantuario {
	const indice = e.residentes.findIndex((r) => r.uid === uid);
	const residente = e.residentes[indice];
	if (residente === undefined) {
		throw new RangeError(`marcarAccion(): no existe el residente '${uid}'`);
	}
	if (residente.estado !== "descansado" && residente.estado !== "visitante") {
		throw new RangeError("marcarAccion(): el residente no puede trabajar");
	}
	const nivel = residente.especialidades[accion] ?? 0;
	if (nivel < 1) {
		throw new RangeError(
			`marcarAccion(): el residente no tiene la Especialidad '${accion}'`,
		);
	}
	if (residente.tarea.tipo !== "nada") {
		throw new RangeError("marcarAccion(): el residente ya tiene una tarea");
	}
	if (!enIsla(e.terreno, x, y)) {
		throw new RangeError(`marcarAccion(): (${x}, ${y}) está fuera de la isla`);
	}
	if (
		!accionesPosibles(
			loseta(e.terreno, x, y),
			vecinosDe(e.terreno, x, y),
		).includes(accion)
	) {
		throw new RangeError(
			`marcarAccion(): '${accion}' no se puede aplicar en (${x}, ${y})`,
		);
	}

	const lado = nivel >= 3 ? 3 : nivel === 2 ? 2 : 1;
	const marcas: AccionMarcada[] = [];
	let siguienteUid = e.siguienteUid;
	for (let j = 0; j < lado; j++) {
		for (let i = 0; i < lado; i++) {
			const mx = x + i;
			const my = y + j;
			if (!enIsla(e.terreno, mx, my)) continue;
			const admite = accionesPosibles(
				loseta(e.terreno, mx, my),
				vecinosDe(e.terreno, mx, my),
			).includes(accion);
			if (!admite) continue;
			marcas.push({ uid, accion, x: mx, y: my, orden: siguienteUid++ });
		}
	}
	if (marcas.length === 0) {
		throw new RangeError(
			"marcarAccion(): ninguna loseta del área admite la acción",
		);
	}

	return {
		...e,
		residentes: e.residentes.map((r, i) =>
			i === indice
				? { ...r, tarea: { tipo: "especialidad", accion, x, y } }
				: r,
		),
		accionesMarcadas: [...e.accionesMarcadas, ...marcas],
		siguienteUid,
	};
}

/**
 * Libera la tarea del residente y todas sus marcas.
 *
 * @throws {RangeError} Si el residente no existe.
 */
export function desmarcarAccion(
	e: EstadoSantuario,
	uid: string,
): EstadoSantuario {
	if (!e.residentes.some((r) => r.uid === uid)) {
		throw new RangeError(`desmarcarAccion(): no existe el residente '${uid}'`);
	}
	return {
		...e,
		residentes: e.residentes.map((r) =>
			r.uid === uid ? { ...r, tarea: SIN_TAREA } : r,
		),
		accionesMarcadas: e.accionesMarcadas.filter((m) => m.uid !== uid),
	};
}

/** ¿Hay un edificio sobre la casilla? */
function hayEdificio(
	e: EstadoSantuario,
	b: SantuarioBalance,
	x: number,
	y: number,
): boolean {
	return e.edificios.some((ed) => {
		const def = b.edificios.find((d) => d.id === ed.tipo);
		if (def === undefined) return false;
		return (
			x >= ed.x &&
			x < ed.x + def.tamano.w &&
			y >= ed.y &&
			y < ed.y + def.tamano.h
		);
	});
}

/** Copia el estado con una loseta cambiada. */
function cambiarLoseta(
	e: EstadoSantuario,
	x: number,
	y: number,
	cambios: Partial<Loseta>,
): EstadoSantuario {
	const i = y * e.terreno.ancho + x;
	return {
		...e,
		terreno: {
			...e.terreno,
			losetas: e.terreno.losetas.map((l, j) =>
				j === i ? { ...l, ...cambios } : l,
			),
		},
	};
}

/**
 * Coloca un camino (lo único que hace el Guardián, GDD §11.6).
 *
 * @throws {RangeError} Si la casilla no es tierra o pradera, tiene un objeto o
 * un edificio, está fuera de la isla o faltan piedras.
 */
export function colocarCamino(
	e: EstadoSantuario,
	x: number,
	y: number,
	b: SantuarioBalance,
): EstadoSantuario {
	if (!enIsla(e.terreno, x, y)) {
		throw new RangeError(`colocarCamino(): (${x}, ${y}) está fuera de la isla`);
	}
	const l = loseta(e.terreno, x, y);
	if (l.tipo !== "tierra" && l.tipo !== "pradera") {
		throw new RangeError("colocarCamino(): solo sobre tierra o pradera");
	}
	if (l.objeto !== undefined || hayEdificio(e, b, x, y)) {
		throw new RangeError("colocarCamino(): la loseta está ocupada");
	}
	const coste = b.camino.costePiedra;
	if ((e.recursos.piedra ?? 0) < coste) {
		throw new RangeError("colocarCamino(): faltan piedras");
	}
	return {
		...cambiarLoseta(e, x, y, { tipo: "camino", humedad: false }),
		recursos: { ...e.recursos, piedra: (e.recursos.piedra ?? 0) - coste },
	};
}

/**
 * Coloca una decoración pagando su coste.
 *
 * @throws {RangeError} Si la decoración no existe, la loseta no es área útil,
 * tiene un objeto o un edificio, está fuera de la isla o faltan recursos.
 */
export function colocarDecoracion(
	e: EstadoSantuario,
	id: string,
	x: number,
	y: number,
	b: SantuarioBalance,
): EstadoSantuario {
	const decoracion = b.decoraciones.find((d) => d.id === id);
	if (decoracion === undefined) {
		throw new RangeError(`colocarDecoracion(): no existe '${id}'`);
	}
	if (!enIsla(e.terreno, x, y)) {
		throw new RangeError(
			`colocarDecoracion(): (${x}, ${y}) está fuera de la isla`,
		);
	}
	const l = loseta(e.terreno, x, y);
	if (!esAreaUtil(l)) {
		throw new RangeError("colocarDecoracion(): la loseta no es área útil");
	}
	if (l.objeto !== undefined || hayEdificio(e, b, x, y)) {
		throw new RangeError("colocarDecoracion(): la loseta está ocupada");
	}
	for (const [recurso, cantidad] of Object.entries(decoracion.coste)) {
		if ((e.recursos[recurso] ?? 0) < cantidad) {
			throw new RangeError(`colocarDecoracion(): faltan recursos (${recurso})`);
		}
	}
	const recursos = { ...e.recursos };
	for (const [recurso, cantidad] of Object.entries(decoracion.coste)) {
		recursos[recurso] = (recursos[recurso] ?? 0) - cantidad;
	}
	return {
		...cambiarLoseta(e, x, y, { objeto: `decoracion:${id}`, edad: 0 }),
		recursos,
	};
}

/**
 * Pone un brote sobre tierra o pradera, sin coste (el brote se compra aparte).
 *
 * @throws {RangeError} Si la casilla no es tierra o pradera, ya tiene un objeto
 * o está fuera de la isla.
 */
export function plantarBrote(
	e: EstadoSantuario,
	x: number,
	y: number,
): EstadoSantuario {
	if (!enIsla(e.terreno, x, y)) {
		throw new RangeError(`plantarBrote(): (${x}, ${y}) está fuera de la isla`);
	}
	const l = loseta(e.terreno, x, y);
	if (l.tipo !== "tierra" && l.tipo !== "pradera") {
		throw new RangeError("plantarBrote(): solo sobre tierra o pradera");
	}
	if (l.objeto !== undefined) {
		throw new RangeError("plantarBrote(): la loseta ya tiene un objeto");
	}
	return cambiarLoseta(e, x, y, { objeto: "brote", edad: 0 });
}

/** Resultado de aplicar una acción a una loseta. */
interface Aplicado {
	loseta: Loseta;
	madera?: number;
	piedra?: number;
}

/** Aplica una acción sobre una loseta; `undefined` si no puede actuar. */
function aplicarAccion(
	l: Loseta,
	accion: string,
	vecinos: TipoLoseta[],
): Aplicado | undefined {
	if (accion === "crecer") {
		if (l.objeto === "brote") {
			return { loseta: { ...l, objeto: "arbol-joven", edad: 0 } };
		}
		if (l.objeto !== undefined) return undefined;
		if (l.tipo === "yerma") return { loseta: { ...l, tipo: "tierra" } };
		if (l.tipo === "tierra") {
			return {
				loseta: { ...l, tipo: l.humedad ? "hierba-alta" : "pradera" },
			};
		}
		if (l.tipo === "pradera") {
			return l.humedad
				? { loseta: { ...l, objeto: "flor", edad: 0 } }
				: { loseta: { ...l, tipo: "hierba-alta" } };
		}
		return undefined;
	}
	if (accion === "regar") {
		if (
			(l.tipo !== "tierra" && l.tipo !== "pradera") ||
			l.objeto !== undefined
		) {
			return undefined;
		}
		if (
			l.tipo === "tierra" &&
			vecinos.filter((t) => t === "agua").length >= 2
		) {
			return { loseta: { ...l, tipo: "agua", humedad: false } };
		}
		if (l.humedad) return undefined;
		return { loseta: { ...l, humedad: true } };
	}
	if (accion === "romper") {
		if (l.tipo !== "roca") return undefined;
		const tocaAgua = vecinos.includes("agua");
		return {
			loseta: { ...l, tipo: tocaAgua ? "arena" : "tierra" },
			piedra: PIEDRA_POR_ROCA,
		};
	}
	if (accion === "cortar") {
		if (l.objeto === "arbol") {
			return {
				loseta: { ...l, objeto: "tocon", edad: 0 },
				madera: MADERA_POR_ARBOL,
			};
		}
		if (l.tipo === "hierba-alta" && l.objeto === undefined) {
			return { loseta: { ...l, tipo: "pradera" } };
		}
		return undefined;
	}
	if (accion === "encender") {
		if ((l.objeto === "farol" || l.objeto === "fogata") && !l.encendido) {
			return { loseta: { ...l, encendido: true } };
		}
		return undefined;
	}
	return undefined;
}

/**
 * Atardecer del terreno: envejece los objetos, apaga lo que dura una jornada y
 * aplica las acciones marcadas por orden de (y, x, orden), con regar antes que
 * crecer en la misma loseta. Sube los usos de Especialidad y suelta la tarea.
 */
export const pasoTerreno: Paso = (e) => {
	const eventos: EventoSantuario[] = [];
	const recursos = { ...e.recursos };
	const ancho = e.terreno.ancho;
	const alto = e.terreno.alto;

	// 1. Envejecen los objetos, crece el árbol joven y se apaga lo de un día.
	let losetas = e.terreno.losetas.map((l, i) => {
		const x = i % ancho;
		const y = Math.floor(i / ancho);
		let nueva = l;
		if (l.objeto !== undefined) nueva = { ...nueva, edad: nueva.edad + 1 };
		if (nueva.objeto === "arbol-joven" && nueva.edad >= JORNADAS_ARBOL_JOVEN) {
			eventos.push({
				tipo: "terrenoCambiado",
				x,
				y,
				de: "arbol-joven",
				a: "arbol",
			});
			nueva = { ...nueva, objeto: "arbol", edad: 0 };
		}
		return { ...nueva, humedad: false, encendido: false };
	});

	// 2. Las marcas se aplican por (y, x), regar primero, y luego por orden.
	const marcas = [...e.accionesMarcadas].sort(
		(a, z) =>
			a.y - z.y ||
			a.x - z.x ||
			(a.accion === "regar" ? 0 : 1) - (z.accion === "regar" ? 0 : 1) ||
			a.orden - z.orden,
	);
	const usos = new Map<string, Map<string, number>>();
	const actuaron = new Set<string>();

	for (const marca of marcas) {
		if (!e.residentes.some((r) => r.uid === marca.uid)) continue;
		actuaron.add(marca.uid);
		if (marca.x < 0 || marca.y < 0 || marca.x >= ancho || marca.y >= alto) {
			continue;
		}
		const i = marca.y * ancho + marca.x;
		const actual = losetas[i];
		if (actual === undefined) continue;
		const aplicado = aplicarAccion(
			actual,
			marca.accion,
			vecinosEn(losetas, ancho, alto, marca.x, marca.y),
		);
		if (aplicado === undefined) continue;
		losetas = losetas.map((l, j) => (j === i ? aplicado.loseta : l));
		if (aplicado.madera !== undefined) {
			recursos.madera = (recursos.madera ?? 0) + aplicado.madera;
		}
		if (aplicado.piedra !== undefined) {
			recursos.piedra = (recursos.piedra ?? 0) + aplicado.piedra;
		}
		eventos.push({
			tipo: "terrenoCambiado",
			x: marca.x,
			y: marca.y,
			de: describir(actual),
			a: describir(aplicado.loseta),
		});
		const cuenta = usos.get(marca.uid) ?? new Map<string, number>();
		cuenta.set(marca.accion, (cuenta.get(marca.accion) ?? 0) + 1);
		usos.set(marca.uid, cuenta);
	}

	// 3. Los que trabajaron sueltan la tarea; los usos suben el nivel.
	const residentes = e.residentes.map((r) => {
		const cuentas = usos.get(r.uid);
		if (cuentas === undefined) {
			return actuaron.has(r.uid) ? { ...r, tarea: SIN_TAREA } : r;
		}
		const usosEspecialidad = { ...r.usosEspecialidad };
		const especialidades = { ...r.especialidades };
		for (const [accion, cuantos] of cuentas) {
			const total = (usosEspecialidad[accion] ?? 0) + cuantos;
			usosEspecialidad[accion] = total;
			especialidades[accion] = Math.max(
				especialidades[accion] ?? 1,
				nivelEspecialidad(total),
			);
		}
		return { ...r, usosEspecialidad, especialidades, tarea: SIN_TAREA };
	});

	return {
		estado: {
			...e,
			terreno: { ancho, alto, losetas },
			residentes,
			recursos,
			accionesMarcadas: [],
		},
		eventos,
	};
};
