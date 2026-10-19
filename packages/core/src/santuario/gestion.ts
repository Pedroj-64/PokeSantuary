import {
	type Edificio,
	type EstadoSantuario,
	esAreaUtil,
	type Residente,
	type SantuarioBalance,
	type Tarea,
} from "./estado.js";
import { zonaDe } from "./jornada.js";

/** Residentes que caben según el nivel del Árbol Cenit. */
export function capacidadResidentes(
	e: EstadoSantuario,
	b: SantuarioBalance,
): number {
	const arbol = e.edificios.find((ed) => ed.tipo === "arbol-cenit");
	if (arbol === undefined) return 0;
	return b.capacidadArbol[arbol.nivel - 1] ?? 0;
}

/**
 * Añade un residente en la zona del Árbol Cenit.
 *
 * @throws {RangeError} Si el uid ya existe, la zona recibida no está en 0..11,
 * no hay Árbol o no queda sitio.
 */
export function admitir(
	e: EstadoSantuario,
	r: Residente,
	b: SantuarioBalance,
): EstadoSantuario {
	if (e.residentes.some((x) => x.uid === r.uid)) {
		throw new RangeError(`admitir(): ya existe el residente '${r.uid}'`);
	}
	if (!Number.isInteger(r.zona) || r.zona < 0 || r.zona > 11) {
		throw new RangeError(
			`admitir(): la zona debe ser un entero de 0 a 11 (recibido ${r.zona})`,
		);
	}
	const arbol = e.edificios.find((ed) => ed.tipo === "arbol-cenit");
	if (arbol === undefined) {
		throw new RangeError("admitir(): no hay Árbol Cenit");
	}
	if (e.residentes.length >= capacidadResidentes(e, b)) {
		throw new RangeError("admitir(): no queda sitio en el Santuario");
	}
	const zona = zonaDe(arbol.x, arbol.y, b);
	return { ...e, residentes: [...e.residentes, { ...r, zona }] };
}

/** Definición del balance para un edificio; lanza si no existe. */
function definicion(b: SantuarioBalance, tipo: string) {
	const def = b.edificios.find((d) => d.id === tipo);
	if (def === undefined) {
		throw new RangeError(`edificio desconocido: '${tipo}'`);
	}
	return def;
}

/**
 * Coloca un kit: comprueba terreno, hueco, nivel del Árbol y materiales.
 *
 * @throws {RangeError} Si el tipo no existe, es el Árbol, no cabe, alguna
 * loseta no es útil o está ocupada, falta nivel del Árbol o faltan recursos.
 */
export function colocarKit(
	e: EstadoSantuario,
	tipo: string,
	x: number,
	y: number,
	b: SantuarioBalance,
): EstadoSantuario {
	const def = definicion(b, tipo);
	if (tipo === "arbol-cenit") {
		throw new RangeError("colocarKit(): el Árbol Cenit no se coloca con kit");
	}
	if (
		!Number.isInteger(x) ||
		!Number.isInteger(y) ||
		x < 0 ||
		y < 0 ||
		x + def.tamano.w > b.isla.ancho ||
		y + def.tamano.h > b.isla.alto
	) {
		throw new RangeError("colocarKit(): el edificio no cabe en la isla");
	}
	const arbol = e.edificios.find((ed) => ed.tipo === "arbol-cenit");
	if (arbol === undefined) {
		throw new RangeError("colocarKit(): no hay Árbol Cenit");
	}
	if (arbol.nivel < def.requiereArbol) {
		throw new RangeError(
			`colocarKit(): ${tipo} necesita el Árbol a nivel ${def.requiereArbol}`,
		);
	}

	for (let j = 0; j < def.tamano.h; j++) {
		for (let i = 0; i < def.tamano.w; i++) {
			const loseta = e.terreno.losetas[(y + j) * e.terreno.ancho + x + i];
			if (loseta === undefined) {
				throw new RangeError("colocarKit(): el edificio no cabe en la isla");
			}
			if (!esAreaUtil(loseta)) {
				throw new RangeError("colocarKit(): hay una loseta no útil");
			}
			if (loseta.objeto !== undefined) {
				throw new RangeError("colocarKit(): hay un objeto en el terreno");
			}
		}
	}

	for (const ed of e.edificios) {
		const otra = definicion(b, ed.tipo);
		const solapa =
			x < ed.x + otra.tamano.w &&
			x + def.tamano.w > ed.x &&
			y < ed.y + otra.tamano.h &&
			y + def.tamano.h > ed.y;
		if (solapa) {
			throw new RangeError("colocarKit(): el edificio se solapa con otro");
		}
	}

	for (const [recurso, cantidad] of Object.entries(def.kit)) {
		if ((e.recursos[recurso] ?? 0) < cantidad) {
			throw new RangeError(`colocarKit(): faltan recursos (${recurso})`);
		}
	}
	const recursos = { ...e.recursos };
	for (const [recurso, cantidad] of Object.entries(def.kit)) {
		recursos[recurso] = (recursos[recurso] ?? 0) - cantidad;
	}
	const nuevo: Edificio = {
		uid: `ed${e.siguienteUid}`,
		tipo,
		x,
		y,
		nivel: 1,
		obraRestante: def.obra,
		resto: {},
	};
	return {
		...e,
		recursos,
		edificios: [...e.edificios, nuevo],
		siguienteUid: e.siguienteUid + 1,
	};
}

/**
 * Sube un nivel pagando el doble del kit y vuelve a poner la obra.
 *
 * @throws {RangeError} Si el edificio no existe, es el Árbol, ya está al
 * máximo o faltan materiales.
 */
export function mejorarEdificio(
	e: EstadoSantuario,
	uid: string,
	b: SantuarioBalance,
): EstadoSantuario {
	const indice = e.edificios.findIndex((ed) => ed.uid === uid);
	const actual = e.edificios[indice];
	if (actual === undefined) {
		throw new RangeError(`mejorarEdificio(): no existe el edificio '${uid}'`);
	}
	if (actual.tipo === "arbol-cenit") {
		throw new RangeError("mejorarEdificio(): el Árbol Cenit no se mejora así");
	}
	const def = definicion(b, actual.tipo);
	if (actual.nivel >= def.nivelMax) {
		throw new RangeError(`mejorarEdificio(): ${actual.tipo} ya está al máximo`);
	}
	const coste = Object.entries(def.kit).map(
		([recurso, cantidad]) => [recurso, cantidad * 2] as const,
	);
	for (const [recurso, cantidad] of coste) {
		if ((e.recursos[recurso] ?? 0) < cantidad) {
			throw new RangeError(`mejorarEdificio(): faltan recursos (${recurso})`);
		}
	}
	const recursos = { ...e.recursos };
	for (const [recurso, cantidad] of coste) {
		recursos[recurso] = (recursos[recurso] ?? 0) - cantidad;
	}
	const edificios = e.edificios.map((ed, i) =>
		i === indice ? { ...ed, nivel: ed.nivel + 1, obraRestante: def.obra } : ed,
	);
	return { ...e, recursos, edificios };
}

/**
 * Asigna una tarea. `trabajo` y `construir` validan edificio y estado del
 * residente; `especialidad` la gestiona terreno.ts; `cuidador` y `nada` se
 * aceptan sin más.
 *
 * @throws {RangeError} Si la orden no es legal.
 */
export function asignarTarea(
	e: EstadoSantuario,
	uid: string,
	tarea: Tarea,
	b: SantuarioBalance,
): EstadoSantuario {
	const indice = e.residentes.findIndex((r) => r.uid === uid);
	const residente = e.residentes[indice];
	if (residente === undefined) {
		throw new RangeError(`asignarTarea(): no existe el residente '${uid}'`);
	}

	switch (tarea.tipo) {
		case "nada":
		case "cuidador":
			break;
		case "especialidad":
			throw new RangeError("lo gestiona terreno.ts");
		case "trabajo": {
			if (
				residente.estado !== "descansado" &&
				residente.estado !== "visitante"
			) {
				throw new RangeError("asignarTarea(): el residente no puede trabajar");
			}
			const edificio = e.edificios.find((x) => x.uid === tarea.edificio);
			if (edificio === undefined) {
				throw new RangeError("asignarTarea(): no existe el edificio");
			}
			if (edificio.obraRestante > 0) {
				throw new RangeError("asignarTarea(): el edificio está en obra");
			}
			const def = definicion(b, edificio.tipo);
			if (def.trabajo === undefined) {
				throw new RangeError("asignarTarea(): el edificio no admite trabajo");
			}
			const plazas = def.plazas[edificio.nivel - 1];
			if (plazas === undefined) {
				throw new RangeError("asignarTarea(): el edificio no tiene plazas");
			}
			const ocupadas = e.residentes.filter(
				(x) =>
					x.uid !== uid &&
					x.tarea.tipo === "trabajo" &&
					x.tarea.edificio === tarea.edificio,
			).length;
			if (ocupadas >= plazas) {
				throw new RangeError("asignarTarea(): no quedan plazas en el edificio");
			}
			break;
		}
		case "construir": {
			if (
				residente.estado !== "descansado" &&
				residente.estado !== "visitante"
			) {
				throw new RangeError("asignarTarea(): el residente no puede trabajar");
			}
			const edificio = e.edificios.find((x) => x.uid === tarea.edificio);
			if (edificio === undefined) {
				throw new RangeError("asignarTarea(): no existe el edificio");
			}
			if (edificio.obraRestante <= 0) {
				throw new RangeError("asignarTarea(): el edificio ya está terminado");
			}
			break;
		}
		default:
			throw new RangeError("asignarTarea(): tarea desconocida");
	}

	const residentes = e.residentes.map((r, i) =>
		i === indice ? { ...r, tarea } : r,
	);
	return { ...e, residentes };
}

/**
 * Asigna o libera (`undefined`) el lecho de un residente.
 *
 * @throws {RangeError} Si el residente o el edificio no existen, no es un
 * lecho, está en obra o ya lo ocupa otro residente.
 */
export function asignarLecho(
	e: EstadoSantuario,
	uid: string,
	edificioUid: string | undefined,
	b: SantuarioBalance,
): EstadoSantuario {
	const indice = e.residentes.findIndex((r) => r.uid === uid);
	const residente = e.residentes[indice];
	if (residente === undefined) {
		throw new RangeError(`asignarLecho(): no existe el residente '${uid}'`);
	}
	if (edificioUid !== undefined) {
		const edificio = e.edificios.find((x) => x.uid === edificioUid);
		if (edificio === undefined) {
			throw new RangeError("asignarLecho(): no existe el edificio");
		}
		if (edificio.obraRestante > 0) {
			throw new RangeError("asignarLecho(): el lecho está en obra");
		}
		const def = b.edificios.find((d) => d.id === edificio.tipo);
		if (def === undefined || !def.id.startsWith("lecho-")) {
			throw new RangeError("asignarLecho(): el edificio no es un lecho");
		}
		const ocupante = e.residentes.find(
			(r) => r.uid !== uid && r.lecho === edificioUid,
		);
		if (ocupante !== undefined) {
			throw new RangeError("asignarLecho(): el lecho ya está ocupado");
		}
	}
	const residentes = e.residentes.map((r, i) =>
		i === indice ? { ...r, lecho: edificioUid } : r,
	);
	return { ...e, residentes };
}
