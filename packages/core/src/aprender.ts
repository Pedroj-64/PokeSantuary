/** Entrada de aprendizaje: la especie aprende `movimiento` al llegar a `nivel`. */
export interface EntradaAprendizaje {
	nivel: number;
	movimiento: string;
}

/** Máximo de movimientos activos de un individuo (GDD §7.3). */
export const MAX_MOVIMIENTOS = 4;

/** Estado de movimientos de un individuo. */
export interface Movimientos {
	activos: string[];
	recordables: string[];
}

/** Resultado de intentar aprender un movimiento. */
export type ResultadoAprender =
	| { tipo: "hecho"; movimientos: Movimientos }
	| { tipo: "elegir"; candidatos: string[] };

/** Exige que `valor` sea un entero >= `minimo`. */
function exigirEnteroMinimo(
	valor: number,
	campo: string,
	minimo: number,
	quien: string,
): void {
	if (!Number.isInteger(valor) || valor < minimo) {
		throw new RangeError(
			`${quien}(): '${campo}' debe ser un entero >= ${minimo} (recibido ${String(valor)})`,
		);
	}
}

/** Ataque directo según el mapa de poder: ausente o 0 no hace daño. */
function esAtaque(
	movimiento: string,
	poder: Readonly<Record<string, number>>,
): boolean {
	return (poder[movimiento] ?? 0) > 0;
}

/**
 * Completa una selección con ataques aprendidos hasta el nivel: si tiene menos
 * de dos, sustituye sus movimientos sin potencia más antiguos por los ataques
 * de mayor potencia no seleccionados. Los empates los gana el aprendido más
 * tarde. Mantiene el tamaño y el orden relativo de los movimientos que quedan.
 */
function completarConAtaques(
	hasta: readonly EntradaAprendizaje[],
	seleccion: readonly string[],
	poder: Readonly<Record<string, number>>,
): string[] {
	const ataques = seleccion.filter((movimiento) =>
		esAtaque(movimiento, poder),
	).length;
	if (ataques >= 2) return [...seleccion];

	// Aparición más reciente de cada movimiento aprendido: decide qué ataques
	// están disponibles y resuelve los empates de potencia.
	const ultimaAparicion = new Map<string, number>();
	for (const [indice, entrada] of hasta.entries()) {
		ultimaAparicion.set(entrada.movimiento, indice);
	}
	const yaSeleccionados = new Set(seleccion);
	const candidatos = [...ultimaAparicion.entries()]
		.filter(
			([movimiento]) =>
				!yaSeleccionados.has(movimiento) && esAtaque(movimiento, poder),
		)
		.sort(([movimientoA, indiceA], [movimientoB, indiceB]) => {
			const potenciaA = poder[movimientoA] ?? 0;
			const potenciaB = poder[movimientoB] ?? 0;
			if (potenciaA !== potenciaB) return potenciaB - potenciaA;
			return indiceB - indiceA;
		});

	const resultado = [...seleccion];
	let faltan = 2 - ataques;
	let siguienteCandidato = 0;
	for (let i = 0; i < resultado.length && faltan > 0; i++) {
		if (esAtaque(resultado[i] as string, poder)) continue;
		const candidato = candidatos[siguienteCandidato];
		if (candidato === undefined) break;
		resultado[i] = candidato[0];
		siguienteCandidato++;
		faltan--;
	}
	return resultado;
}

/**
 * Los cuatro últimos movimientos por nivel (GDD §7.3): de las entradas con
 * `nivel <= nivel`, los últimos `MAX_MOVIMIENTOS` según el orden de la lista
 * (nivel ascendente y luego movimiento), devueltos del más antiguo al más
 * reciente y sin repetir. Si una misma especie vuelve a aprender un movimiento,
 * solo cuenta su aparición más reciente.
 *
 * Con `poder`, si la selección tiene menos de dos ataques (movimientos con
 * potencia > 0), sustituye los movimientos sin potencia más antiguos por los
 * ataques aprendidos de mayor potencia que no estén ya seleccionados, hasta
 * tener dos o agotar los candidatos. Sin `poder`, se comporta como siempre.
 *
 * No muta la lista ni el mapa de poder.
 *
 * @throws {RangeError} Si `nivel` no es un entero >= 1.
 */
export function movimientosIniciales(
	lista: readonly EntradaAprendizaje[],
	nivel: number,
	poder?: Readonly<Record<string, number>>,
): string[] {
	const quien = "movimientosIniciales";
	exigirEnteroMinimo(nivel, "nivel", 1, quien);
	const hasta = lista.filter((entrada) => entrada.nivel <= nivel);
	const vistos = new Set<string>();
	const ultimos: string[] = [];
	for (
		let i = hasta.length - 1;
		i >= 0 && ultimos.length < MAX_MOVIMIENTOS;
		i--
	) {
		const movimiento = (hasta[i] as EntradaAprendizaje).movimiento;
		if (vistos.has(movimiento)) continue;
		vistos.add(movimiento);
		ultimos.push(movimiento);
	}
	const seleccion = ultimos.reverse();
	if (poder === undefined) return seleccion;
	return completarConAtaques(hasta, seleccion, poder);
}

/**
 * Movimientos nuevos al pasar de `nivelAntes` a `nivelDespues`: los que cumplen
 * `nivelAntes < nivel <= nivelDespues`, en el orden de la lista y sin repetir.
 * Subir varios niveles de golpe devuelve los de todos los intermedios.
 *
 * No muta la lista.
 *
 * @throws {RangeError} Si los niveles no son enteros >= 0 o si
 * `nivelDespues < nivelAntes`.
 */
export function nuevosMovimientos(
	lista: readonly EntradaAprendizaje[],
	nivelAntes: number,
	nivelDespues: number,
): string[] {
	const quien = "nuevosMovimientos";
	exigirEnteroMinimo(nivelAntes, "nivelAntes", 0, quien);
	exigirEnteroMinimo(nivelDespues, "nivelDespues", 0, quien);
	if (nivelDespues < nivelAntes) {
		throw new RangeError(
			`${quien}(): 'nivelDespues' (${nivelDespues}) no puede ser menor que 'nivelAntes' (${nivelAntes})`,
		);
	}
	const resultado: string[] = [];
	const vistos = new Set<string>();
	for (const entrada of lista) {
		if (entrada.nivel <= nivelAntes || entrada.nivel > nivelDespues) continue;
		if (vistos.has(entrada.movimiento)) continue;
		vistos.add(entrada.movimiento);
		resultado.push(entrada.movimiento);
	}
	return resultado;
}

/** Recordables tras olvidar: sale `nuevo`, entra `olvidado`, sin duplicar y ordenado. */
function recordablesTrasOlvidar(
	recordables: readonly string[],
	olvidado: string,
	nuevo: string,
): string[] {
	const conjunto = new Set(recordables.filter((mov) => mov !== nuevo));
	conjunto.add(olvidado);
	return [...conjunto].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Intenta que un individuo aprenda `nuevo`.
 *
 * - Si ya lo tiene entre los activos, lanza.
 * - Con menos de `MAX_MOVIMIENTOS` activos lo añade al final (y lo quita de
 *   recordables si estaba); no se admite `olvidar`.
 * - Con los cuatro ocupados y sin `olvidar` devuelve `{ tipo: "elegir" }` con
 *   los candidatos, sin cambiar nada.
 * - Con los cuatro ocupados y `olvidar`, el olvidado (que debe estar activo)
 *   deja su sitio al nuevo, pasa a recordables (sin duplicar) y recordables
 *   queda ordenado alfabéticamente.
 *
 * No muta `m`.
 *
 * @throws {RangeError} Si `nuevo` ya está activo, si se pide olvidar sin
 * necesidad (hay hueco) o si `olvidar` no está entre los activos.
 */
export function aprender(
	m: Movimientos,
	nuevo: string,
	olvidar?: string,
): ResultadoAprender {
	const quien = "aprender";
	if (m.activos.includes(nuevo)) {
		throw new RangeError(
			`${quien}(): '${nuevo}' ya está entre los movimientos activos`,
		);
	}
	if (m.activos.length < MAX_MOVIMIENTOS) {
		if (olvidar !== undefined) {
			throw new RangeError(
				`${quien}(): hay hueco; no hace falta olvidar '${olvidar}'`,
			);
		}
		return {
			tipo: "hecho",
			movimientos: {
				activos: [...m.activos, nuevo],
				recordables: m.recordables.filter((mov) => mov !== nuevo),
			},
		};
	}
	if (olvidar === undefined) {
		return { tipo: "elegir", candidatos: [...m.activos] };
	}
	if (!m.activos.includes(olvidar)) {
		throw new RangeError(
			`${quien}(): no se puede olvidar '${olvidar}': no está entre los movimientos activos`,
		);
	}
	return {
		tipo: "hecho",
		movimientos: {
			activos: m.activos.map((mov) => (mov === olvidar ? nuevo : mov)),
			recordables: recordablesTrasOlvidar(m.recordables, olvidar, nuevo),
		},
	};
}

/**
 * Aprende en orden todos los `nuevos`. Mientras haya hueco los aprende solo;
 * al llenarse el cuarto, los que aún no ha aprendido (porque exigen una
 * decisión) se devuelven en `pendientes` en su orden, y los movimientos activos
 * quedan como estaban en ese momento. Los que ya están activos se ignoran en
 * silencio.
 *
 * No muta `m` ni `nuevos`.
 */
export function aprenderTodos(
	m: Movimientos,
	nuevos: readonly string[],
): { movimientos: Movimientos; pendientes: string[] } {
	let actual: Movimientos = {
		activos: [...m.activos],
		recordables: [...m.recordables],
	};
	const pendientes: string[] = [];
	for (const nuevo of nuevos) {
		if (actual.activos.includes(nuevo)) continue;
		if (actual.activos.length >= MAX_MOVIMIENTOS) {
			pendientes.push(nuevo);
			continue;
		}
		const resultado = aprender(actual, nuevo);
		if (resultado.tipo === "hecho") actual = resultado.movimientos;
		else pendientes.push(nuevo);
	}
	return { movimientos: actual, pendientes };
}
