import { Dex } from "@pkmn/sim";
import type { Rng } from "@santuario/core";
import type { Combate, Eleccion, MiembroEquipo, Peticion } from "./combate.js";
import type { Lado } from "./protocolo.js";

/** Lo que la IA sabe de un movimiento de un Pokémon propio contra el activo rival. */
export interface DatosMovimiento {
	/** Potencia base; 0 si no hace daño directo (estado o daño fijo). */
	potencia: number;
	/** Precisión en [0, 100]; los movimientos que nunca fallan cuentan 100. */
	precision: number;
	/** Multiplicador de tipo contra el activo rival (0, 0.25 ... 4). */
	efectividad: number;
	/** El tipo del movimiento coincide con un tipo del usuario. */
	stab: boolean;
}

/** Vista del combate para la IA: datos del simulador ya cruzados con el activo rival. */
export interface Estimador {
	/** Movimientos conocidos de `especie` (slugs). */
	movimientos(especie: string): string[];
	datos(especie: string, movimiento: string): DatosMovimiento;
	/** Peor multiplicador que los tipos del activo rival hacen a `especie` (mayor = más peligro). */
	amenaza(especie: string): number;
}

const BONO_STAB = 1.5;

/**
 * Estimador por defecto: cruza el equipo de `lado` con el activo rival leído de
 * `combate`, usando solo los datos del simulador (`Dex`), sin tablas propias.
 * Si el rival aún no tiene activo, todo se evalúa como neutro.
 */
export function crearEstimador(
	combate: Combate,
	lado: Lado,
	equipo: MiembroEquipo[],
): Estimador {
	const rival = combate.activo(lado === "jugador" ? "rival" : "jugador");
	const tiposRival: string[] = rival
		? Dex.species.get(rival.especie).types
		: [];
	const multiplicador = (tipo: string, objetivo: string[]): number =>
		Dex.getImmunity(tipo, objetivo)
			? 2 ** Dex.getEffectiveness(tipo, objetivo)
			: 0;

	return {
		movimientos: (especie) =>
			equipo.find((m) => m.especie === especie)?.set.movimientos ?? [],
		datos(especie, movimiento) {
			const m = Dex.moves.get(movimiento);
			// Límite conocido (Fase 1): los movimientos de daño variable o fijo
			// (potencia base 0) cuentan como de estado.
			const dano = m.category !== "Status" ? m.basePower : 0;
			return {
				potencia: dano,
				precision: m.accuracy === true ? 100 : m.accuracy,
				efectividad: multiplicador(m.type, tiposRival),
				stab: Dex.species.get(especie).types.includes(m.type),
			};
		},
		amenaza: (especie) =>
			Math.max(
				0,
				...tiposRival.map((t) =>
					multiplicador(t, Dex.species.get(especie).types),
				),
			),
	};
}

/**
 * Puntuación de un movimiento: potencia × efectividad × STAB (1,5) × precisión/100.
 * Es 0 para movimientos sin daño directo.
 */
function puntuar(d: DatosMovimiento): number {
	return (
		d.potencia * d.efectividad * (d.stab ? BONO_STAB : 1) * (d.precision / 100)
	);
}

/** Elige al azar (con `rng`) entre los índices de mayor puntuación; los empates dependen solo del `rng`. */
function mejor(puntos: { indice: number; punto: number }[], rng: Rng): number {
	const tope = Math.max(...puntos.map((p) => p.punto));
	const empatados = puntos.filter((p) => p.punto === tope);
	return (empatados[rng.entero(0, empatados.length - 1)] as { indice: number })
		.indice;
}

/**
 * IA rival básica y determinista (mismo estado + misma semilla → misma elección).
 *
 * - Movimiento: maximiza `puntuar`. Los movimientos de estado solo se eligen si
 *   no hay ninguno de daño utilizable. Nunca elige uno deshabilitado o sin PP.
 * - Cambio forzado: entre los compañeros vivos y no activos, el que tenga el
 *   mejor ataque (mejor movimiento) dividido entre la amenaza de los tipos
 *   rivales sobre él.
 * - No cambia por voluntad propia (Fase 1): solo cuando está forzada.
 *
 * @throws Error si la petición no tiene ninguna elección legal.
 */
export function elegirIA(
	peticion: Peticion,
	estimador: Estimador,
	rng: Rng,
): Eleccion {
	if (peticion.tipo === "movimiento") {
		const activo = peticion.equipo.find((m) => m.activo);
		const usables = peticion.movimientos
			.map((o, indice) => ({ o, indice }))
			.filter(({ o }) => !o.deshabilitado && !(o.pp === 0 && o.ppMax > 0)); // Struggle llega sin PP (ppMax 0): sigue siendo usable.
		if (activo && usables.length > 0) {
			const puntos = usables.map(({ o, indice }) => ({
				indice,
				punto: puntuar(estimador.datos(activo.especie, o.movimiento)),
			}));
			// Si todo puntúa 0 (solo estado), el empate entre todos lo resuelve el rng.
			return { tipo: "movimiento", indice: mejor(puntos, rng) };
		}
		// Cambiar por voluntad propia no existe en la Fase 1.
		throw new Error("No hay ningún movimiento utilizable");
	}
	const candidatos = peticion.equipo
		.map((m, indice) => ({ m, indice }))
		.filter(({ m }) => !m.activo && !m.debilitado)
		.map(({ m, indice }) => {
			const ataque = Math.max(
				0,
				...estimador
					.movimientos(m.especie)
					.map((mov) => puntuar(estimador.datos(m.especie, mov))),
			);
			return {
				indice,
				punto: ataque / Math.max(estimador.amenaza(m.especie), 0.25),
			};
		});
	if (candidatos.length === 0) throw new Error("No hay ninguna elección legal");
	return { tipo: "cambio", indice: mejor(candidatos, rng) };
}
