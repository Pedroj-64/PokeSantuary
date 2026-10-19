import {
	type EstadoExpedicion,
	iniciarExpedicion,
	liquidar,
} from "../expedicion.js";
import { crearRng, type Rng } from "../rng.js";
import type {
	EstadoSantuario,
	OrigenResidente,
	Residente,
	SantuarioBalance,
} from "./estado.js";
import { admitir, capacidadResidentes } from "./gestion.js";
import type { EventoSantuario, Resultado } from "./jornada.js";

const MIN_EQUIPO = 1;
const MAX_EQUIPO = 6;

/**
 * Crea un residente completo (tipos, trabajos preferidos, Especialidades...) a
 * partir de los datos de la especie; lo implementa la aplicación. El `rng` sale de
 * `semilla:residente:<uid>` para que la naturaleza y los IV sean deterministas.
 */
export type Fabricar = (p: {
	especie: string;
	uid: string;
	origen: OrigenResidente;
	rng: Rng;
}) => Residente;

/** Residentes que salen y su especie, en el orden pedido. */
export function equipoDeExpedicion(
	e: EstadoSantuario,
	uids: readonly string[],
): { uid: string; especie: string }[] {
	if (uids.length < MIN_EQUIPO || uids.length > MAX_EQUIPO) {
		throw new RangeError(
			`equipoDeExpedicion(): el equipo debe tener de ${MIN_EQUIPO} a ${MAX_EQUIPO} residentes (recibidos ${uids.length})`,
		);
	}
	if (new Set(uids).size !== uids.length) {
		throw new RangeError("equipoDeExpedicion(): hay un uid repetido");
	}
	return uids.map((uid) => {
		const r = e.residentes.find((x) => x.uid === uid);
		if (r === undefined) {
			throw new RangeError(
				`equipoDeExpedicion(): no existe el residente '${uid}'`,
			);
		}
		if (r.estado !== "descansado") {
			throw new RangeError(
				`equipoDeExpedicion(): '${uid}' está ${r.estado} y no puede salir`,
			);
		}
		return { uid, especie: r.especie };
	});
}

/** Inicia una expedición con residentes del Santuario; cada miembro lleva su `uid`. */
export function iniciarDesdeSantuario(
	e: EstadoSantuario,
	uids: readonly string[],
	semilla: string,
): EstadoExpedicion {
	const equipo = equipoDeExpedicion(e, uids);
	const x = iniciarExpedicion(
		semilla,
		equipo.map((m) => m.especie),
	);
	return {
		...x,
		equipo: x.equipo.map((m, i) => ({ uid: equipo[i]?.uid, ...m })),
	};
}

/** Resultado de volver al Santuario: lo que no cupo se devuelve para que no se pierda. */
export interface ResultadoLiquidacion extends Resultado {
	/** Especies que no cupieron (Santuario lleno); quien llama decide dónde esperan. */
	sinSitio: string[];
}

/**
 * Vuelve al Santuario con una expedición terminada: suma el dinero conservado
 * (todo si ganó, la mitad si perdió), deja agotados a los residentes que volvieron
 * a 0 PS, y admite como residentes a los capturados y a los Sombríos rescatados
 * (con Medidor 100) mientras quepan.
 *
 * @throws {RangeError} Si la expedición sigue en curso.
 */
export function liquidarEnSantuario(
	e: EstadoSantuario,
	x: EstadoExpedicion,
	b: SantuarioBalance,
	fabricar: Fabricar,
): ResultadoLiquidacion {
	const { dineroConservado } = liquidar(x);
	const volvieron = new Map(
		x.equipo.flatMap((m) => (m.uid === undefined ? [] : [[m.uid, m.psPct]])),
	);
	let estado: EstadoSantuario = {
		...e,
		recursos: {
			...e.recursos,
			pokedolares: (e.recursos.pokedolares ?? 0) + dineroConservado,
		},
		residentes: e.residentes.map((r) => {
			const ps = volvieron.get(r.uid);
			if (ps === undefined) return r;
			return {
				...r,
				tarea: { tipo: "nada" },
				estado: ps === 0 ? "agotado" : "descansado",
			};
		}),
	};

	const llegan: { especie: string; origen: OrigenResidente }[] = [
		...x.equipo
			.filter((m) => m.uid === undefined)
			.map((m) => ({ especie: m.especie, origen: "captura" as const })),
		...x.pendientesPurificar.map((especie) => ({
			especie,
			origen: "rescate" as const,
		})),
	];
	const eventos: EventoSantuario[] = [];
	const sinSitio: string[] = [];
	for (const { especie, origen } of llegan) {
		if (estado.residentes.length >= capacidadResidentes(estado, b)) {
			sinSitio.push(especie);
			eventos.push({ tipo: "sinSitio", especie });
			continue;
		}
		const uid = `r${estado.siguienteUid}`;
		const rng = crearRng(`${estado.semilla}:residente:${uid}`);
		let nuevo = fabricar({ especie, uid, origen, rng });
		if (origen === "rescate") {
			nuevo = { ...nuevo, estado: "sombrio", sombrio: 100 };
		}
		estado = {
			...admitir(estado, nuevo, b),
			siguienteUid: estado.siguienteUid + 1,
		};
		eventos.push({ tipo: "residenteNuevo", uid, especie, origen });
	}
	return { estado, eventos, sinSitio };
}
