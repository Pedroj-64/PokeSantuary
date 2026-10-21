import { terrenoInicial } from "./terreno.js";

/** Momento del día; la jornada avanza alba → dia → atardecer → noche. */
export type Momento = "alba" | "dia" | "atardecer" | "noche";

/** Estado de un residente dentro del Santuario. */
export type EstadoResidente =
	| "descansado"
	| "agotado"
	| "sombrio"
	| "visitante";

/** De dónde llegó un residente. */
export type OrigenResidente =
	| "captura"
	| "rescate"
	| "habitat"
	| "huevo"
	| "eco";

/** Temas de la Charla del Alba. */
export type TemaCharla =
	| "animo"
	| "trabajo"
	| "valor"
	| "calma"
	| "cuidado"
	| "raices";

/** Sabores de baya; "neutro" para las que no tienen uno. */
export type Sabor =
	| "picante"
	| "seco"
	| "dulce"
	| "amargo"
	| "acido"
	| "neutro";

/** Qué hace un residente durante la jornada. */
export type Tarea =
	| { tipo: "nada" }
	| { tipo: "trabajo"; edificio: string }
	| { tipo: "construir"; edificio: string }
	| { tipo: "cuidador" }
	| { tipo: "especialidad"; accion: string; x: number; y: number };

/** Un residente del Santuario; ninguna función muta este objeto. */
export interface Residente {
	uid: string;
	especie: string;
	mote?: string;
	naturaleza: string;
	nivel: number;
	/** Tipos de la especie (ids, por ejemplo "grass"). */
	tipos: string[];
	/** Trabajos que prefiere (ids de trabajo). */
	preferidos: string[];
	/** Id de Especialidad → nivel 1 a 3. */
	especialidades: Record<string, number>;
	/** Id de Especialidad → usos acumulados. */
	usosEspecialidad: Record<string, number>;
	/** Hambre de 0 a 100. */
	hambre: number;
	/** Ánimo de 0 a 100. */
	animo: number;
	/** Amistad de 0 a 5. */
	amistad: number;
	/** Movimientos activos que conserva del paso por la expedición. */
	movimientos?: string[];
	/** Movimientos olvidados que se pueden recordar. */
	recordables?: string[];
	estado: EstadoResidente;
	/** Medidor sombrío de 0 a 100, solo para los Sombríos. */
	sombrio?: number;
	tarea: Tarea;
	/** uid del edificio-lecho asignado. */
	lecho?: string;
	/** Zona de la isla en la que vive. */
	zona: number;
	origen: OrigenResidente;
	/** Jornadas seguidas en Inquietud. */
	diasInquieto: number;
	/** Jornadas que le quedan como visitante. */
	visitanteRestante?: number;
	/** Id del hábitat que lo trajo, solo para los visitantes. */
	habitat?: string;
	/** Lo rellena la producción del Atardecer. */
	trabajoHoy: "preferido" | "no-preferido" | "ninguno";
	habloHoy: boolean;
	peticionCumplidaHoy: boolean;
}

/** Edificio colocado en la cuadrícula del Santuario. */
export interface Edificio {
	uid: string;
	tipo: string;
	x: number;
	y: number;
	nivel: number;
	/** 0 = terminado. */
	obraRestante: number;
	/** Restos decimales de producción por recurso. */
	resto: Record<string, number>;
	/** Solo el Huerto de Bayas. */
	variedad?: Sabor;
}

/** Materiales del terreno. */
export type TipoLoseta =
	| "yerma"
	| "tierra"
	| "pradera"
	| "hierba-alta"
	| "agua"
	| "arena"
	| "roca"
	| "camino";

/** Una loseta del Santuario, con su capa de objeto y sus estados de jornada. */
export interface Loseta {
	tipo: TipoLoseta;
	/** "brote" | "arbol-joven" | "arbol" | "tocon" | "flor" | "farol" | "fogata" | `decoracion:${id}` */
	objeto?: string;
	/** Jornadas desde que apareció el objeto. */
	edad: number;
	/** Dura una jornada. */
	humedad: boolean;
	/** Farol o fogata encendidos; dura una jornada. */
	encendido: boolean;
}

/** Terreno del Santuario; las losetas van fila a fila: y * ancho + x. */
export interface Terreno {
	ancho: number;
	alto: number;
	losetas: Loseta[];
}

/** Acción de terreno marcada por el jugador para el Atardecer. */
export interface AccionMarcada {
	uid: string;
	accion: string;
	x: number;
	y: number;
	orden: number;
}

/** Estado completo del Santuario; ninguna función lo muta. */
export interface EstadoSantuario {
	semilla: string;
	jornada: number;
	momento: Momento;
	/** Recursos enteros: pokedolares, madera, piedra, mineral, fragmentos, recuerdos y `baya:<sabor>`. */
	recursos: Record<string, number>;
	residentes: Residente[];
	edificios: Edificio[];
	terreno: Terreno;
	/** 0 a 100; la calculó el último Atardecer. */
	armonia: number;
	/** Especies vistas (Pokédex mínima); la Alba prefiere las que no están. */
	vistas: string[];
	/** Tema elegido en la Charla del Alba de esta jornada. */
	temaCharla?: TemaCharla;
	accionesMarcadas: AccionMarcada[];
	habitatsCompletos: { id: string; x: number; y: number }[];
	/** Libro de Hábitats. */
	habitatsDescubiertos: string[];
	/** Hábitats nuevos que traerán visitante en el próximo Alba. */
	habitatsPendientes: string[];
	/** Contador para generar uids deterministas. */
	siguienteUid: number;
}

/** Entrada de un edificio en el balance; repite la forma de los datos. */
export interface EdificioBalance {
	id: string;
	tamano: { w: number; h: number };
	kit: Record<string, number>;
	obra: number;
	nivelMax: number;
	requiereArbol: number;
	/** Trabajadores por nivel; vacío si el edificio no produce. */
	plazas: number[];
	trabajo?: string;
	especialidadesAfines: string[];
	produce?: { recurso: string; base: number };
}

/** Entrada de una decoración en el balance; repite la forma de los datos. */
export interface DecoracionBalance {
	id: string;
	puntos: 1 | 2 | 3;
	coste: Record<string, number>;
}

/**
 * Números de balance del Santuario. Repite estructuralmente el esquema de
 * `@santuario/data` porque el núcleo no depende del paquete de datos.
 */
export interface SantuarioBalance {
	isla: { ancho: number; alto: number; zona: number };
	recursosIniciales: Record<string, number>;
	comida: {
		umbral: number;
		caidaPorJornada: number;
		neutra: { hambre: number; animo: number };
		favorita: { hambre: number; animo: number };
		noGusta: { hambre: number; animo: number };
		sabores: Record<string, { favorito: Sabor; noGusta: Sabor }>;
	};
	animo: {
		inicial: number;
		preferido: number;
		noPreferido: number;
		confortBase: number;
		confortFactor: number;
		hambreBaja: number;
		hambreBajaUmbral: number;
		peticion: number;
		temaAnimo: number;
		sinLecho: number;
		agotado: number;
		sombrioSuelto: number;
		hablo: number;
		animar: number;
	};
	confort: { puntosPorNivel: number; min: number; max: number };
	armonia: {
		pesoAnimo: number;
		pesoConfort: number;
		factorConfort: number;
		umbralAlto: number;
		umbralMuyAlto: number;
		umbralBajo: number;
		multProduccionAlta: number;
	};
	inquietud: {
		animoUmbral: number;
		jornadasAviso: number;
		jornadasSalida: number;
		multProduccion: number;
	};
	produccion: {
		multNivel: number[];
		multPreferido: number;
		animoBase: number;
		multEspecialidad: number;
		multCharlaTrabajo: number;
		obraBasePorConstructor: number;
		obraPorNivelEspecialidad: number;
		obraCharlaRaices: number;
		mineralProbabilidad: number;
		tiposMineral: string[];
	};
	capacidadArbol: number[];
	capacidadAlmacen: number[];
	edificios: EdificioBalance[];
	decoraciones: DecoracionBalance[];
	camino: { costePiedra: number };
}

/** ¿Se puede construir sobre esta loseta? No cuentan yerma ni roca (GDD §11.6). */
export function esAreaUtil(l: Loseta): boolean {
	return l.tipo !== "yerma" && l.tipo !== "roca";
}

/**
 * Crea el Santuario inicial (GDD §11): jornada 1 al alba, recursos del balance,
 * el Árbol Cenit terminado en el centro y la isla rota de `terrenoInicial`.
 *
 * Es determinista y no comparte referencias con `balance`.
 *
 * @throws {RangeError} Si la isla no tiene tamaño válido, si el balance no trae
 * el Árbol Cenit o si el Árbol no cabe en la isla.
 */
export function crearSantuario(
	semilla: string,
	balance: SantuarioBalance,
): EstadoSantuario {
	const { ancho, alto } = balance.isla;
	if (
		!Number.isInteger(ancho) ||
		!Number.isInteger(alto) ||
		ancho < 1 ||
		alto < 1
	) {
		throw new RangeError(
			`crearSantuario(): la isla debe medir al menos 1 x 1 (recibido ${ancho} x ${alto})`,
		);
	}
	const arbol = balance.edificios.find((e) => e.id === "arbol-cenit");
	if (arbol === undefined) {
		throw new RangeError("crearSantuario(): el balance no trae el Árbol Cenit");
	}
	const x = Math.floor((ancho - arbol.tamano.w) / 2);
	const y = Math.floor((alto - arbol.tamano.h) / 2);
	if (x < 0 || y < 0) {
		throw new RangeError(
			`crearSantuario(): el Árbol Cenit no cabe en una isla de ${ancho} x ${alto}`,
		);
	}
	return {
		semilla,
		jornada: 1,
		momento: "alba",
		recursos: { ...balance.recursosIniciales },
		residentes: [],
		edificios: [
			{
				uid: "ed1",
				tipo: "arbol-cenit",
				x,
				y,
				nivel: 1,
				obraRestante: 0,
				resto: {},
			},
		],
		terreno: terrenoInicial(semilla, balance),
		armonia: 50,
		vistas: [],
		accionesMarcadas: [],
		habitatsCompletos: [],
		habitatsDescubiertos: [],
		habitatsPendientes: [],
		siguienteUid: 2,
	};
}
