/** Lado del combate: quien juega (`jugador`) o la IA (`rival`). */
export type Lado = "jugador" | "rival";

/**
 * Evento tipado del combate. Las especies y los movimientos van como slug
 * (p. ej. `giga-drain`), nunca como nombre visible: la interfaz los localiza
 * con los datos del pack.
 */
export type EventoCombate =
	| { tipo: "inicio"; tamanoJugador: number; tamanoRival: number }
	| { tipo: "turno"; numero: number }
	| { tipo: "movimiento"; lado: Lado; especie: string; movimiento: string }
	| { tipo: "dano"; lado: Lado; hp: number; hpMax: number }
	| { tipo: "curacion"; lado: Lado; hp: number; hpMax: number }
	| { tipo: "efectividad"; valor: "super" | "poco" | "nula" }
	| { tipo: "critico" }
	| { tipo: "fallo" }
	| { tipo: "debilitado"; lado: Lado; especie: string }
	| { tipo: "cambio"; lado: Lado; especie: string; hp: number; hpMax: number }
	| { tipo: "fin"; ganador: Lado | "empate" };

/** Quita tildes y símbolos: identificador "plano" del simulador. */
export function idPlano(texto: string): string {
	return texto.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Convierte un nombre visible a slug cuando no es un nombre conocido. */
function slugGenerico(nombre: string): string {
	return nombre
		.toLowerCase()
		.replace(/['’.]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Convierte un nombre del simulador al slug del pack; `conocidos` mapea `idPlano` → slug. */
export function aSlug(nombre: string, conocidos: Map<string, string>): string {
	return conocidos.get(idPlano(nombre)) ?? slugGenerico(nombre);
}

/** Devuelve el lado de un identificador como `p1a: Pikachu`, o null si no lo es. */
function ladoDe(ident: string): Lado | null {
	if (ident.startsWith("p1")) return "jugador";
	if (ident.startsWith("p2")) return "rival";
	return null;
}

/** Lee `84/110` o `0 fnt` (con estado opcional); `hpMaxPrevio` cubre el caso sin máximo. */
export function parsearHp(
	texto: string,
	hpMaxPrevio: number,
): { hp: number; hpMax: number } {
	const m = /^(\d+)(?:\/(\d+))?/.exec(texto);
	if (!m) throw new Error(`Salud ilegible en el protocolo: "${texto}"`);
	return { hp: Number(m[1]), hpMax: m[2] ? Number(m[2]) : hpMaxPrevio };
}

/**
 * Traductor con estado de líneas del protocolo (visión omnisciente) a
 * `EventoCombate`. Recuerda el activo y su salud máxima de cada lado, porque
 * el protocolo no repite la especie en `|move|` ni el máximo en `0 fnt`.
 */
export class Analizador {
	private readonly activo: Record<Lado, string> = { jugador: "", rival: "" };
	private readonly hpMax: Record<Lado, number> = { jugador: 1, rival: 1 };
	/** Número del último `|turn|`. */
	turnos = 0;

	constructor(
		private readonly conocidos: Map<string, string>,
		private readonly nombres: Record<Lado, string>,
	) {}

	/** Traduce una línea; devuelve null si el protocolo no aporta un evento. */
	analizar(linea: string): EventoCombate | null {
		const p = linea.split("|");
		switch (p[1]) {
			case "teamsize":
				return null;
			case "turn":
				this.turnos = Number(p[2]);
				return { tipo: "turno", numero: this.turnos };
			case "switch":
			case "drag": {
				const lado = ladoDe(p[2] ?? "");
				if (!lado) return null;
				const especie = aSlug((p[3] ?? "").split(",")[0] ?? "", this.conocidos);
				const { hp, hpMax } = parsearHp(p[4] ?? "", 1);
				this.activo[lado] = especie;
				this.hpMax[lado] = hpMax;
				return { tipo: "cambio", lado, especie, hp, hpMax };
			}
			case "move": {
				const lado = ladoDe(p[2] ?? "");
				if (!lado) return null;
				return {
					tipo: "movimiento",
					lado,
					especie: this.activo[lado],
					movimiento: aSlug(p[3] ?? "", this.conocidos),
				};
			}
			case "-damage":
			case "-heal": {
				const lado = ladoDe(p[2] ?? "");
				if (!lado) return null;
				const { hp, hpMax } = parsearHp(p[3] ?? "", this.hpMax[lado]);
				this.hpMax[lado] = hpMax;
				return {
					tipo: p[1] === "-damage" ? "dano" : "curacion",
					lado,
					hp,
					hpMax,
				};
			}
			case "-supereffective":
				return { tipo: "efectividad", valor: "super" };
			case "-resisted":
				return { tipo: "efectividad", valor: "poco" };
			case "-immune":
				return { tipo: "efectividad", valor: "nula" };
			case "-crit":
				return { tipo: "critico" };
			case "-miss":
				return { tipo: "fallo" };
			case "faint": {
				const lado = ladoDe(p[2] ?? "");
				if (!lado) return null;
				return { tipo: "debilitado", lado, especie: this.activo[lado] };
			}
			case "win": {
				const ganador = (["jugador", "rival"] as const).find(
					(l) => this.nombres[l] === p[2],
				);
				if (!ganador) throw new Error(`Ganador desconocido: "${p[2]}"`);
				return { tipo: "fin", ganador };
			}
			case "tie":
				return { tipo: "fin", ganador: "empate" };
			default:
				return null;
		}
	}
}
