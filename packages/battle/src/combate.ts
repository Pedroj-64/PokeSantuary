import { BattleStreams, Dex, Teams } from "@pkmn/sim";
import { crearRng } from "@santuario/core";
import type { SetCombate } from "@santuario/data";
import {
	Analizador,
	aSlug,
	type EventoCombate,
	idPlano,
	type Lado,
} from "./protocolo.js";

export type { EventoCombate, Lado } from "./protocolo.js";

/** Un Pokémon del equipo: especie (slug del pack) y su set de combate. */
export interface MiembroEquipo {
	especie: string;
	set: SetCombate;
}

/**
 * Elección de un lado. Los índices empiezan en 0 y se refieren a la
 * `Peticion` vigente: `movimientos[indice]` o `equipo[indice]`.
 */
export type Eleccion =
	| { tipo: "movimiento"; indice: number }
	| { tipo: "cambio"; indice: number };

/** Movimiento elegible del activo. */
export interface OpcionMovimiento {
	movimiento: string;
	pp: number;
	ppMax: number;
	/** Sin PP u otra restricción: no se puede elegir. */
	deshabilitado: boolean;
}

/** Pokémon del equipo, en el orden del simulador (el activo va primero). */
export interface MiembroPeticion {
	especie: string;
	hp: number;
	hpMax: number;
	activo: boolean;
	debilitado: boolean;
}

/** Lo que un lado debe elegir ahora. */
export interface Peticion {
	lado: Lado;
	/** `cambio-forzado`: el activo cayó y solo vale un cambio. */
	tipo: "movimiento" | "cambio-forzado";
	/** Vacío en un cambio forzado. */
	movimientos: OpcionMovimiento[];
	equipo: MiembroPeticion[];
}

/** Pokémon en campo de un lado, visible para ambos. */
export interface ActivoPublico {
	especie: string;
	hp: number;
	hpMax: number;
}

const MAX_EQUIPO = 3;
const NIVEL = 50;
const SLOT: Record<Lado, "p1" | "p2"> = { jugador: "p1", rival: "p2" };
const NOMBRE: Record<Lado, string> = { jugador: "jugador", rival: "rival" };

interface RequestJson {
	wait?: boolean;
	forceSwitch?: boolean[];
	active?: {
		moves: { move: string; pp?: number; maxpp?: number; disabled: boolean }[];
	}[];
	side: {
		pokemon: {
			ident: string;
			details: string;
			condition: string;
			active: boolean;
		}[];
	};
}

/** Cuatro enteros de 16 bits derivados de la semilla (formato del PRNG por defecto del simulador). */
function semillaSimulador(semilla: string): [number, number, number, number] {
	const rng = crearRng(semilla);
	return [
		rng.entero(0, 0xffff),
		rng.entero(0, 0xffff),
		rng.entero(0, 0xffff),
		rng.entero(0, 0xffff),
	];
}

/** Valida un equipo contra los datos del simulador; falla en voz alta, nunca omite. */
function validarEquipo(lado: Lado, equipo: MiembroEquipo[]): void {
	if (equipo.length < 1 || equipo.length > MAX_EQUIPO) {
		throw new Error(
			`El equipo del ${lado} debe tener entre 1 y ${MAX_EQUIPO} Pokémon`,
		);
	}
	for (const { especie, set } of equipo) {
		if (!Dex.species.get(especie).exists) {
			throw new Error(`Especie inexistente en el simulador: ${especie}`);
		}
		if (!Dex.abilities.get(set.habilidad).exists) {
			throw new Error(
				`Habilidad inexistente en el simulador: ${set.habilidad}`,
			);
		}
		for (const m of set.movimientos) {
			if (!Dex.moves.get(m).exists) {
				throw new Error(`Movimiento inexistente en el simulador: ${m}`);
			}
		}
	}
}

/**
 * Combate individual por turnos sobre `@pkmn/sim` (`gen9customgame`, nivel 50,
 * sin objetos, sin vista previa de equipos).
 *
 * El simulador corre de forma síncrona y sembrada, así que el combate es
 * determinista: misma semilla y mismas elecciones, mismo `registro()`.
 *
 * Las peticiones se obtienen del canal `sideupdate` del propio flujo del
 * simulador (los `|request|` JSON de cada lado) y se guarda la última por lado.
 */
export class Combate {
	/** Eventos del arranque: tamaños de equipo y primeros Pokémon en campo. */
	readonly inicio: EventoCombate[] = [];

	private readonly lineas: string[] = [];
	private readonly pendientes: Record<Lado, Peticion | null> = {
		jugador: null,
		rival: null,
	};
	private readonly hpMax = new Map<string, number>();
	private ganador: Lado | "empate" | null = null;
	private readonly activos: Record<Lado, ActivoPublico | null> = {
		jugador: null,
		rival: null,
	};

	private constructor(
		private readonly flujo: BattleStreams.BattleStream,
		private readonly salida: string[],
		private readonly analizador: Analizador,
		private readonly conocidos: Map<string, string>,
	) {}

	/**
	 * Crea el combate y procesa el arranque.
	 * @throws Error si el equipo es inválido o alguna especie, habilidad o movimiento no existe.
	 */
	static async crear(op: {
		semilla: string;
		jugador: MiembroEquipo[];
		rival: MiembroEquipo[];
	}): Promise<Combate> {
		validarEquipo("jugador", op.jugador);
		validarEquipo("rival", op.rival);
		const conocidos = new Map<string, string>();
		for (const m of [...op.jugador, ...op.rival]) {
			conocidos.set(idPlano(m.especie), m.especie);
			for (const mov of m.set.movimientos) conocidos.set(idPlano(mov), mov);
		}
		// El simulador entrega cada mensaje por `push`; lo capturamos para leerlo sin esperas.
		const salida: string[] = [];
		const flujo = new (class extends BattleStreams.BattleStream {
			override push(chunk: string): void {
				salida.push(chunk);
			}
		})({ noCatch: true });
		const c = new Combate(
			flujo,
			salida,
			new Analizador(conocidos, NOMBRE),
			conocidos,
		);
		const empaquetar = (e: MiembroEquipo[]) =>
			Teams.pack(
				e.map((m) => ({
					name: "",
					species: m.especie,
					moves: m.set.movimientos,
					ability: m.set.habilidad,
					item: "",
					nature: m.set.naturaleza,
					evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
					ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
					level: NIVEL,
					gender: "",
				})),
			);
		const inicio = {
			formatid: "gen9customgame@@@!Team Preview",
			seed: semillaSimulador(op.semilla),
		};
		await flujo.write(
			[
				`>start ${JSON.stringify(inicio)}`,
				`>player p1 ${JSON.stringify({ name: NOMBRE.jugador, team: empaquetar(op.jugador) })}`,
				`>player p2 ${JSON.stringify({ name: NOMBRE.rival, team: empaquetar(op.rival) })}`,
			].join("\n"),
		);
		const eventos = c.procesar();
		const tam = (l: Lado) => (l === "jugador" ? op.jugador : op.rival).length;
		c.inicio.push(
			{
				tipo: "inicio",
				tamanoJugador: tam("jugador"),
				tamanoRival: tam("rival"),
			},
			...eventos,
		);
		return c;
	}

	/**
	 * Lo que `lado` debe elegir, o null si no le toca: ya eligió este turno,
	 * espera el cambio forzado del otro lado, o el combate terminó.
	 */
	peticion(lado: Lado): Peticion | null {
		return this.ganador ? null : this.pendientes[lado];
	}

	/** Pokémon en campo de `lado` (visible para ambos), o null antes del primer cambio. */
	activo(lado: Lado): ActivoPublico | null {
		const a = this.activos[lado];
		return a && { ...a };
	}

	/** Ganador (`empate` incluido) o null si el combate sigue. */
	terminado(): Lado | "empate" | null {
		return this.ganador;
	}

	/**
	 * Protocolo omnisciente crudo acumulado (salud real de ambos lados), sin la
	 * marca de tiempo del simulador, que no es determinista. Sirve para comprobar
	 * repeticiones byte a byte.
	 */
	registro(): string {
		return this.lineas.join("\n");
	}

	/**
	 * Registra la elección de `lado`. El turno se resuelve cuando ya eligieron
	 * todos los lados con petición: hasta entonces devuelve `[]`; al resolverse,
	 * devuelve los eventos nuevos (de ese turno y de cualquier cambio forzado).
	 * Tras un cambio forzado, el combate sigue con la petición de movimientos.
	 *
	 * @throws Error si el combate terminó, no le toca elegir a `lado` o la elección es ilegal.
	 * Una elección rechazada no altera el combate.
	 */
	async elegir(lado: Lado, e: Eleccion): Promise<EventoCombate[]> {
		this.validar(lado, e);
		const orden = `>${SLOT[lado]} ${e.tipo === "movimiento" ? "move" : "switch"} ${e.indice + 1}`;
		await this.flujo.write(orden);
		this.pendientes[lado] = null;
		return this.procesar();
	}

	/**
	 * Aplica las elecciones de ambos lados y devuelve todos los eventos nuevos.
	 * Un lado sin petición (p. ej. espera al otro tras un cambio forzado) debe
	 * recibir `null`; uno con petición no puede recibir `null`. Valida ambas
	 * antes de aplicar ninguna.
	 */
	async resolver(
		jugador: Eleccion | null,
		rival: Eleccion | null,
	): Promise<EventoCombate[]> {
		const elecciones = [
			["jugador", jugador],
			["rival", rival],
		] as const;
		for (const [lado, e] of elecciones) {
			if (e) this.validar(lado, e);
			else if (this.peticion(lado))
				throw new Error(`Falta la elección del ${lado}`);
		}
		const eventos: EventoCombate[] = [];
		for (const [lado, e] of elecciones)
			if (e) eventos.push(...(await this.elegir(lado, e)));
		return eventos;
	}

	private validar(lado: Lado, e: Eleccion): void {
		if (this.ganador) throw new Error("El combate ya terminó");
		const p = this.pendientes[lado];
		if (!p) throw new Error(`No es el turno del ${lado} para elegir`);
		if (!Number.isInteger(e.indice) || e.indice < 0) {
			throw new Error(`Índice de ${e.tipo} inválido: ${e.indice}`);
		}
		if (e.tipo === "movimiento") {
			if (p.tipo !== "movimiento") {
				throw new Error(`El ${lado} debe elegir un cambio, no un movimiento`);
			}
			const m = p.movimientos[e.indice];
			if (!m) throw new Error(`Movimiento fuera de rango: ${e.indice}`);
			if (m.deshabilitado)
				throw new Error(
					`El movimiento ${m.movimiento} no se puede usar (sin PP)`,
				);
			return;
		}
		const destino = p.equipo[e.indice];
		if (!destino) throw new Error(`Cambio fuera de rango: ${e.indice}`);
		if (destino.debilitado)
			throw new Error(`${destino.especie} está debilitado`);
		if (destino.activo) throw new Error(`${destino.especie} ya está activo`);
	}

	/** Consume lo que el simulador emitió desde la última vez: registro, eventos y peticiones. */
	private procesar(): EventoCombate[] {
		const eventos: EventoCombate[] = [];
		for (const chunk of this.salida.splice(0)) {
			const [tipo, ...resto] = chunk.split("\n");
			if (tipo === "update") {
				eventos.push(...this.leerActualizacion(resto));
			} else if (tipo === "sideupdate") {
				this.leerLado(resto[0] ?? "", resto.slice(1).join("\n"));
			}
		}
		if (this.ganador) this.pendientes.jugador = this.pendientes.rival = null;
		return eventos;
	}

	private leerActualizacion(lineas: string[]): EventoCombate[] {
		const eventos: EventoCombate[] = [];
		for (let i = 0; i < lineas.length; i++) {
			const linea = lineas[i] ?? "";
			// Tras `|split|`, la primera línea es la omnisciente (salud real) y la segunda la pública.
			if (linea.startsWith("|split|")) {
				i++;
				const secreta = lineas[i] ?? "";
				i++;
				this.lineas.push(secreta);
				this.añadir(eventos, secreta);
				continue;
			}
			if (linea.startsWith("|t:|")) continue;
			this.lineas.push(linea);
			this.añadir(eventos, linea);
		}
		return eventos;
	}

	private añadir(eventos: EventoCombate[], linea: string): void {
		const ev = this.analizador.analizar(linea);
		if (!ev) return;
		if (ev.tipo === "fin") this.ganador = ev.ganador;
		if (ev.tipo === "cambio")
			this.activos[ev.lado] = {
				especie: ev.especie,
				hp: ev.hp,
				hpMax: ev.hpMax,
			};
		else if (ev.tipo === "dano" || ev.tipo === "curacion") {
			const a = this.activos[ev.lado];
			if (a) {
				a.hp = ev.hp;
				a.hpMax = ev.hpMax;
			}
		}
		eventos.push(ev);
	}

	private leerLado(slot: string, texto: string): void {
		const lado: Lado = slot === "p1" ? "jugador" : "rival";
		for (const linea of texto.split("\n")) {
			if (linea.startsWith("|error|")) {
				// Nuestra validación debería atajarlo antes; es la red de seguridad.
				throw new Error(`El simulador rechazó la elección: ${linea.slice(7)}`);
			}
			if (linea.startsWith("|request|")) {
				this.pendientes[lado] = this.leerPeticion(
					lado,
					JSON.parse(linea.slice(9)) as RequestJson,
				);
			}
		}
	}

	private leerPeticion(lado: Lado, r: RequestJson): Peticion | null {
		const equipo: MiembroPeticion[] = r.side.pokemon.map((p) => {
			const hp = Number(/^(\d+)/.exec(p.condition)?.[1]);
			const max = /\/(\d+)/.exec(p.condition)?.[1];
			if (max) this.hpMax.set(`${lado}${p.ident}`, Number(max));
			return {
				especie: aSlug(p.details.split(",")[0] ?? "", this.conocidos),
				hp,
				hpMax: this.hpMax.get(`${lado}${p.ident}`) ?? hp,
				activo: p.active,
				debilitado: p.condition.endsWith("fnt"),
			};
		});
		if (r.wait) return null;
		const forzado = r.forceSwitch?.[0] === true;
		const movimientos = forzado
			? []
			: (r.active?.[0]?.moves ?? []).map((m) => ({
					movimiento: aSlug(m.move, this.conocidos),
					pp: m.pp ?? 0,
					ppMax: m.maxpp ?? 0,
					// Struggle llega sin datos de PP: sigue siendo elegible.
					deshabilitado: m.disabled || m.pp === 0,
				}));
		return {
			lado,
			tipo: forzado ? "cambio-forzado" : "movimiento",
			movimientos,
			equipo,
		};
	}
}
