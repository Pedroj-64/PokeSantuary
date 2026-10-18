import {
	type Canal,
	type Cancion,
	CancionSchema,
	CICLOS,
	type Eco,
	type EnvolventeHardware,
	type Golpe,
	type Nota,
	type Pista,
	type VibratoCancion,
} from "./modelo.js";

/**
 * Compilador de MML (Music Macro Language) propio del paquete de audio.
 *
 * Una pista por línea; las líneas vacías y las que empiezan por `;` son
 * comentarios. Las directivas de cabecera van antes de las pistas.
 *
 * ```mml
 * @cancion id=combate-salvaje bpm=150 pasosPorNegra=4 repetir=true bucle=32 swing=0
 * @nombre audio.combate-salvaje.nombre
 * @compas=16
 * pulso1 ciclo=25 vol=12 env=12,-2 vib=120,6,0.3 pan=-0.3 | t o4 l8 c d e g4 r8 e [c d]2
 * pulso2 ciclo=12.5 pan=0.2 | o3 l8 e g b > c
 * onda onda=0,3,6,9,12,15,12,9,6,3,0,3,6,9,12,15,15,12,9,6,3,0,3,6,9,12,15,12,9,6,3,0 | o2 l4 a a
 * ruido corto | b16 h16 s16 h16
 * ```
 *
 * ## Cabecera
 *
 * - `@cancion` con `id`, `bpm` obligatorios y `pasosPorNegra` (4 por defecto),
 *   `repetir` (`true`/`false`, por defecto `false`), `bucle` (paso al que
 *   volver) y `swing` (0 a 0.5). Las claves van en cualquier orden.
 * - `@nombre clave.i18n` obligatoria una sola vez.
 * - `@compas=N` opcional: activa la comprobación de que cada compás, medido
 *   entre separadores `|`, suma exactamente N pasos.
 *
 * ## Pista
 *
 * `<canal> [opciones] | <cuerpo>`, con canal `pulso1`, `pulso2`, `onda` o
 * `ruido`. Opciones separadas por espacios:
 *
 * - `ciclo=12.5|25|50|75` (solo pulsos), `vol=1..15`, `env=inicio,paso`,
 *   `vib=retardoMs,hz,profundidad`, `pan=-1..1`, `eco=retardoMs,mezcla`.
 * - `onda=...` con 32 valores 0..15 (obligatoria en el canal onda).
 * - `corto` (solo ruido) activa el registro de 7 bits.
 *
 * ## Cuerpo
 *
 * - Notas `c d e f g a b`, con `+` sostenido y `-` bemol (`c+`, `b-`).
 * - `r` silencio. `o4` octava absoluta (Do central = `o4 c` = MIDI 60);
 *   `<` y `>` bajan o suben una octava.
 * - `l8` longitud por defecto y longitud tras la nota (`c4`, `c8.` con
 *   puntillo). Longitudes: 1, 2, 4, 8, 16 y 32; con `pasosPorNegra=4` una
 *   negra son 4 pasos, así que `l4` = 4 pasos y `l16` = 1 paso.
 * - `v10` volumen (1..15) y `@d2` ciclo de trabajo (0=12.5, 1=25, 2=50,
 *   3=75). Ambos afectan a las notas siguientes.
 * - `&` ligadura: suma la duración de la nota siguiente, que debe ser la
 *   misma altura.
 * - `~+3` / `~-5` deslizamiento de la nota siguiente, en semitonos.
 * - `(c e g)` arpegio: un grupo de 2 a 4 notas se compila a una sola nota con
 *   `arp` (la primera es la fundamental). Tras el paréntesis admite duración.
 * - `[ ... ]N` repite N veces (1..64), anidable hasta 3 niveles. El contenido
 *   se compila una vez con el estado del momento y se replica tal cual.
 * - `|` separador de compás, informativo (con `@compas` se comprueba).
 *
 * En `ruido`: `b` bombo, `s` caja, `h` charles, `o` charles abierto y `x`
 * platillo; admiten longitud como las notas y no admiten octava ni arpegio.
 *
 * Los errores de sintaxis lanzan `Error` con `línea:columna` y una
 * descripción. Si la canción no cumple el esquema se propaga el error de zod.
 */

interface Estado {
	octava: number;
	longitud: number;
	volumen: number;
	ciclo?: (typeof CICLOS)[number];
	paso: number;
	deslizPendiente?: number;
}

type NotaRelativa = Nota;

interface Bloque {
	notas: NotaRelativa[];
	/** Posiciones relativas de los separadores `|`. */
	barras: number[];
	/** Paso absoluto en el que empieza el bloque. */
	base: number;
	pasos: number;
}

const ALTURAS: Record<string, number> = {
	c: 0,
	d: 2,
	e: 4,
	f: 5,
	g: 7,
	a: 9,
	b: 11,
};

const LONGITUDES = new Set([1, 2, 4, 8, 16, 32]);
const MAX_PASOS = 8192;
const MAX_REPETICIONES = 64;
const MAX_NIVELES = 3;

/** Lanza un error de sintaxis con la posición indicada. */
function errorEn(linea: number, columna: number, mensaje: string): never {
	throw new Error(`MML ${linea}:${columna}: ${mensaje}`);
}

/** Lector con posición sobre el texto de una línea. */
class Lector {
	readonly texto: string;
	readonly linea: number;
	pos: number;

	constructor(texto: string, linea: number, pos: number) {
		this.texto = texto;
		this.linea = linea;
		this.pos = pos;
	}

	get columna(): number {
		return this.pos + 1;
	}

	get fin(): boolean {
		return this.pos >= this.texto.length;
	}

	mirar(): string {
		return this.texto[this.pos] ?? "";
	}

	saltarEspacios(): void {
		while (!this.fin && /\s/.test(this.mirar())) this.pos++;
	}

	error(mensaje: string): never {
		return errorEn(this.linea, this.columna, mensaje);
	}
}

/** Lee un entero sin signo si lo hay; deja el cursor intacto si no. */
function leerDigitos(lector: Lector): number | undefined {
	const inicio = lector.pos;
	while (/\d/.test(lector.mirar())) lector.pos++;
	if (lector.pos === inicio) return undefined;
	return Number(lector.texto.slice(inicio, lector.pos));
}

/**
 * Duración de un token en pasos: longitud explícita o la actual, con un
 * puntillo opcional. Exige un número entero de pasos.
 */
function leerDuracion(
	lector: Lector,
	estado: Estado,
	pasosPorNegra: number,
): number {
	const explicita = leerDigitos(lector);
	const longitud = explicita ?? estado.longitud;
	if (!LONGITUDES.has(longitud)) {
		lector.error(`longitud ${longitud} no válida (usa 1, 2, 4, 8, 16 o 32)`);
	}
	let puntillo = false;
	if (lector.mirar() === ".") {
		lector.pos++;
		puntillo = true;
	}
	const base = (pasosPorNegra * 4) / longitud;
	const pasos = puntillo ? base * 1.5 : base;
	if (!Number.isInteger(pasos) || pasos < 1) {
		lector.error(
			`la duración ${longitud}${puntillo ? "." : ""} no cae en un paso entero con ${pasosPorNegra} pasos por negra`,
		);
	}
	return pasos;
}

/** Altura absoluta (MIDI) de una letra con su alteración opcional. */
function leerAltura(lector: Lector, estado: Estado): number {
	const letra = lector.mirar();
	if (!Object.hasOwn(ALTURAS, letra)) {
		lector.error(
			`se esperaba una nota (c, d, e, f, g, a, b) y llegó "${letra}"`,
		);
	}
	lector.pos++;
	let semitono = ALTURAS[letra] ?? 0;
	const signo = lector.mirar();
	if (signo === "+" || signo === "-") {
		lector.pos++;
		semitono += signo === "+" ? 1 : -1;
	}
	const midi = (estado.octava + 1) * 12 + semitono;
	if (midi < 0 || midi > 127) {
		lector.error(`la nota sale del rango MIDI 0..127 (${midi})`);
	}
	return midi;
}

/** Comprueba la octava y la ajusta; se usa en `o`, `<` y `>`. */
function fijarOctava(lector: Lector, estado: Estado, octava: number): void {
	if (octava < 0 || octava > 9) {
		lector.error(`octava ${octava} fuera de 0..9`);
	}
	estado.octava = octava;
}

/** Emite una nota relativa y avanza el cursor del bloque. */
function emitir(
	bloque: Bloque,
	nota: NotaRelativa,
	estado: Estado,
	lector: Lector,
): void {
	// Las notas se guardan relativas al inicio del bloque para poder repetir.
	nota.t = estado.paso - bloque.base;
	estado.paso += nota.d;
	if (estado.paso > MAX_PASOS) {
		lector.error(
			`la pista supera los ${MAX_PASOS} pasos; acorta las repeticiones`,
		);
	}
	bloque.notas.push(nota);
	bloque.pasos = estado.paso - bloque.base;
}

/** Comprueba que no quede un deslizamiento pendiente. */
function exigirSinDesliz(lector: Lector, estado: Estado): void {
	if (estado.deslizPendiente !== undefined) {
		lector.error("se esperaba una nota después del deslizamiento ~");
	}
}

/** Compila un bloque de notas hasta el final o hasta `]` (si `cierre`). */
function compilarBloque(
	lector: Lector,
	estado: Estado,
	canal: Canal,
	pasosPorNegra: number,
	profundidad: number,
	cierre: boolean,
): Bloque {
	const bloque: Bloque = {
		notas: [],
		barras: [],
		base: estado.paso,
		pasos: 0,
	};
	const esRuido = canal === "ruido";
	while (true) {
		lector.saltarEspacios();
		if (lector.fin) {
			if (cierre) lector.error("falta el corchete de cierre ]");
			break;
		}
		const token = lector.mirar();
		if (token === "]") {
			if (!cierre) lector.error("corchete ] sin abrir");
			break;
		}
		if (token === "|") {
			lector.pos++;
			bloque.barras.push(estado.paso - bloque.base);
			continue;
		}
		if (token === "[") {
			if (profundidad >= MAX_NIVELES) {
				lector.error(
					`las repeticiones solo se anidan hasta ${MAX_NIVELES} niveles`,
				);
			}
			lector.pos++;
			const inicioRepeticion = estado.paso - bloque.base;
			const sub = compilarBloque(
				lector,
				estado,
				canal,
				pasosPorNegra,
				profundidad + 1,
				true,
			);
			lector.saltarEspacios();
			if (lector.mirar() !== "]") lector.error("falta el corchete de cierre ]");
			lector.pos++;
			lector.saltarEspacios();
			const veces = leerDigitos(lector);
			if (veces === undefined) {
				lector.error("se esperaba el número de repeticiones tras ]");
			}
			if (veces < 1 || veces > MAX_REPETICIONES) {
				lector.error(`las repeticiones deben ir de 1 a ${MAX_REPETICIONES}`);
			}
			for (let r = 0; r < veces; r++) {
				const desplazamiento = inicioRepeticion + r * sub.pasos;
				for (const nota of sub.notas) {
					bloque.notas.push({ ...nota, t: nota.t + desplazamiento });
				}
				for (const barra of sub.barras) {
					bloque.barras.push(barra + desplazamiento);
				}
			}
			estado.paso = bloque.base + inicioRepeticion + sub.pasos * veces;
			bloque.pasos = estado.paso - bloque.base;
			continue;
		}
		if (token === "&") {
			lector.error("ligadura sin una nota delante");
		}
		if (token === ")") {
			lector.error("paréntesis de cierre sin abrir");
		}
		if (token === "<" || token === ">") {
			if (esRuido) lector.error("el canal de ruido no tiene octavas");
			lector.pos++;
			fijarOctava(lector, estado, estado.octava + (token === ">" ? 1 : -1));
			continue;
		}
		if (token === "o" && !esRuido) {
			lector.pos++;
			const octava = leerDigitos(lector);
			if (octava === undefined) lector.error("se esperaba el número de octava");
			fijarOctava(lector, estado, octava);
			continue;
		}
		if (token === "l") {
			lector.pos++;
			const longitud = leerDigitos(lector);
			if (longitud === undefined) {
				lector.error("se esperaba la longitud por defecto");
			}
			if (!LONGITUDES.has(longitud)) {
				lector.error(
					`longitud ${longitud} no válida (usa 1, 2, 4, 8, 16 o 32)`,
				);
			}
			estado.longitud = longitud;
			continue;
		}
		if (token === "v") {
			lector.pos++;
			const volumen = leerDigitos(lector);
			if (volumen === undefined) lector.error("se esperaba el volumen");
			if (volumen < 1 || volumen > 15) {
				lector.error(`el volumen debe ir de 1 a 15 (${volumen})`);
			}
			estado.volumen = volumen;
			continue;
		}
		if (token === "@") {
			lector.pos++;
			if (lector.mirar() !== "d") {
				lector.error("se esperaba @d (ciclo de trabajo)");
			}
			lector.pos++;
			if (esRuido) lector.error("@d no vale en el canal de ruido");
			const codigo = leerDigitos(lector);
			if (codigo === undefined) lector.error("se esperaba el ciclo @d0..3");
			const ciclo = CICLOS[codigo];
			if (ciclo === undefined) lector.error("el ciclo @d solo va de 0 a 3");
			estado.ciclo = ciclo;
			continue;
		}
		if (token === "~") {
			if (esRuido)
				lector.error("el deslizamiento no vale en el canal de ruido");
			exigirSinDesliz(lector, estado);
			lector.pos++;
			const signo = lector.mirar();
			if (signo !== "+" && signo !== "-") {
				lector.error("se esperaba + o - tras ~");
			}
			lector.pos++;
			const valor = leerDigitos(lector);
			if (valor === undefined)
				lector.error("se esperaban los semitonos del deslizamiento");
			if (valor > 24) {
				lector.error(
					`el deslizamiento va como mucho a 24 semitonos (${valor})`,
				);
			}
			estado.deslizPendiente = signo === "+" ? valor : -valor;
			continue;
		}
		if (token === "(") {
			if (esRuido) lector.error("el arpegio no vale en el canal de ruido");
			exigirSinDesliz(lector, estado);
			lector.pos++;
			const alturas: number[] = [];
			while (true) {
				lector.saltarEspacios();
				if (lector.mirar() === ")") {
					lector.pos++;
					break;
				}
				if (lector.fin) lector.error("falta el paréntesis de cierre )");
				alturas.push(leerAltura(lector, estado));
			}
			if (alturas.length < 2 || alturas.length > 4) {
				lector.error("el arpegio necesita de 2 a 4 notas");
			}
			const d = leerDuracion(lector, estado, pasosPorNegra);
			const fundamental = alturas[0] ?? 0;
			const arp: number[] = [];
			for (let i = 1; i < alturas.length; i++) {
				const offset = (alturas[i] ?? 0) - fundamental;
				if (offset < -24 || offset > 24) {
					lector.error(
						"cada nota del arpegio debe estar a 24 semitonos o menos de la fundamental",
					);
				}
				arp.push(offset);
			}
			const nota: NotaRelativa = {
				t: estado.paso,
				d,
				n: fundamental,
				v: estado.volumen,
				arp,
			};
			if (estado.ciclo !== undefined) nota.ciclo = estado.ciclo;
			emitir(bloque, nota, estado, lector);
			continue;
		}
		if (token === "r") {
			exigirSinDesliz(lector, estado);
			lector.pos++;
			const d = leerDuracion(lector, estado, pasosPorNegra);
			estado.paso += d;
			if (estado.paso > MAX_PASOS) {
				lector.error(
					`la pista supera los ${MAX_PASOS} pasos; acorta las repeticiones`,
				);
			}
			bloque.pasos = estado.paso - bloque.base;
			continue;
		}
		if (esRuido) {
			const mapa: Record<string, Golpe> = {
				b: "bombo",
				s: "caja",
				h: "charles",
				o: "charlesAbierto",
				x: "platillo",
			};
			const golpe = mapa[token];
			if (golpe === undefined) {
				lector.error(`golpe desconocido "${token}" (usa b, s, h, o o x)`);
			}
			exigirSinDesliz(lector, estado);
			lector.pos++;
			const d = leerDuracion(lector, estado, pasosPorNegra);
			const nota: NotaRelativa = {
				t: estado.paso,
				d,
				n: 0,
				v: estado.volumen,
				golpe,
			};
			if (estado.ciclo !== undefined) {
				lector.error("el ciclo de trabajo no vale en el canal de ruido");
			}
			emitir(bloque, nota, estado, lector);
			continue;
		}
		if (Object.hasOwn(ALTURAS, token)) {
			const desliz = estado.deslizPendiente;
			estado.deslizPendiente = undefined;
			const midi = leerAltura(lector, estado);
			let d = leerDuracion(lector, estado, pasosPorNegra);
			const nota: NotaRelativa = {
				t: estado.paso,
				d,
				n: midi,
				v: estado.volumen,
			};
			if (estado.ciclo !== undefined) nota.ciclo = estado.ciclo;
			if (desliz !== undefined) nota.desliz = desliz;
			// Ligaduras: suma duraciones de la misma altura.
			while (true) {
				const guardado = lector.pos;
				lector.saltarEspacios();
				if (lector.mirar() !== "&") {
					lector.pos = guardado;
					break;
				}
				lector.pos++;
				lector.saltarEspacios();
				if (!Object.hasOwn(ALTURAS, lector.mirar())) {
					lector.error("la ligadura debe seguir con una nota");
				}
				const siguiente = leerAltura(lector, estado);
				if (siguiente !== midi) {
					lector.error("la ligadura necesita la misma altura");
				}
				const extra = leerDuracion(lector, estado, pasosPorNegra);
				d += extra;
			}
			nota.d = d;
			emitir(bloque, nota, estado, lector);
			continue;
		}
		lector.error(`comando desconocido "${token}"`);
	}
	return bloque;
}

/** Convierte una opción `clave=valor`; devuelve clave y valor en crudo. */
function partirOpcion(token: string): { clave: string; valor: string } {
	const igual = token.indexOf("=");
	if (igual < 0) return { clave: token, valor: "" };
	return {
		clave: token.slice(0, igual),
		valor: token.slice(igual + 1),
	};
}

/** Número entero de una opción, con posición para el error. */
function enteroOpcion(
	valor: string,
	linea: number,
	columna: number,
	nombre: string,
): number {
	const numero = Number(valor);
	if (valor.trim() === "" || !Number.isInteger(numero)) {
		errorEn(linea, columna, `${nombre} necesita un número entero`);
	}
	return numero;
}

/** Número real de una opción, con posición para el error. */
function realOpcion(
	valor: string,
	linea: number,
	columna: number,
	nombre: string,
): number {
	const numero = Number(valor);
	if (valor.trim() === "" || !Number.isFinite(numero)) {
		errorEn(linea, columna, `${nombre} necesita un número`);
	}
	return numero;
}

/** Números separados por comas dentro de una opción. */
function listaOpcion(
	valor: string,
	linea: number,
	columna: number,
	nombre: string,
): string[] {
	const partes = valor.split(",").map((p) => p.trim());
	if (partes.some((p) => p === "")) {
		errorEn(linea, columna, `${nombre} tiene una lista incompleta`);
	}
	return partes;
}

/** Convierte el código de un canal en su nombre; lanza si no existe. */
function leerCanal(token: string, linea: number, columna: number): Canal {
	if (
		token === "pulso1" ||
		token === "pulso2" ||
		token === "onda" ||
		token === "ruido"
	) {
		return token;
	}
	return errorEn(
		linea,
		columna,
		`canal desconocido "${token}" (usa pulso1, pulso2, onda o ruido)`,
	);
}

/**
 * Compila texto MML a una canción validada con `CancionSchema`.
 *
 * @throws {Error} Con `línea:columna` si hay un fallo de sintaxis.
 * @throws {ZodError} Si el resultado no cumple el esquema.
 */
export function compilarMml(texto: string): Cancion {
	const lineas = texto.split(/\r?\n/);
	let id: string | undefined;
	let nombre: string | undefined;
	let bpm: number | undefined;
	let pasosPorNegra = 4;
	let repetir = false;
	let bucle: number | undefined;
	let swing: number | undefined;
	let compas: number | undefined;
	let hayCabecera = false;
	const pistas: Pista[] = [];
	const pasosPista: number[] = [];
	const canales = new Map<string, number>();

	for (let i = 0; i < lineas.length; i++) {
		const linea = lineas[i] ?? "";
		const numero = i + 1;
		const limpia = linea.trim();
		if (limpia === "" || limpia.startsWith(";")) continue;

		if (limpia.startsWith("@")) {
			const tokens = [...linea.matchAll(/\S+/g)];
			const primero = tokens[0];
			if (primero === undefined) continue;
			const directiva = primero[0];
			const columnaDirectiva = (primero.index ?? 0) + 1;
			if (directiva === "@cancion") {
				if (hayCabecera) {
					errorEn(numero, columnaDirectiva, "@cancion repetida");
				}
				hayCabecera = true;
				for (let t = 1; t < tokens.length; t++) {
					const token = tokens[t];
					if (token === undefined) continue;
					const columna = (token.index ?? 0) + 1;
					const { clave, valor } = partirOpcion(token[0]);
					switch (clave) {
						case "id":
							if (valor === "") errorEn(numero, columna, "id vacío");
							id = valor;
							break;
						case "bpm":
							bpm = enteroOpcion(valor, numero, columna, "bpm");
							if (bpm < 40 || bpm > 240) {
								errorEn(numero, columna, `bpm fuera de 40..240 (${bpm})`);
							}
							break;
						case "pasosPorNegra":
							pasosPorNegra = enteroOpcion(
								valor,
								numero,
								columna,
								"pasosPorNegra",
							);
							if (pasosPorNegra < 1 || pasosPorNegra > 8) {
								errorEn(
									numero,
									columna,
									`pasosPorNegra fuera de 1..8 (${pasosPorNegra})`,
								);
							}
							break;
						case "repetir":
							if (valor === "true") repetir = true;
							else if (valor === "false") repetir = false;
							else errorEn(numero, columna, "repetir debe ser true o false");
							break;
						case "bucle":
							bucle = enteroOpcion(valor, numero, columna, "bucle");
							if (bucle < 0)
								errorEn(numero, columna, "bucle no puede ser negativo");
							break;
						case "swing":
							swing = realOpcion(valor, numero, columna, "swing");
							if (swing < 0 || swing > 0.5) {
								errorEn(numero, columna, `swing fuera de 0..0.5 (${swing})`);
							}
							break;
						default:
							errorEn(
								numero,
								columna,
								`clave de @cancion desconocida "${clave}"`,
							);
					}
				}
				continue;
			}
			if (directiva === "@nombre") {
				const valor = tokens[1];
				if (valor === undefined) {
					errorEn(numero, columnaDirectiva, "falta la clave de @nombre");
				}
				if (nombre !== undefined) {
					errorEn(numero, columnaDirectiva, "@nombre repetido");
				}
				nombre = valor[0];
				continue;
			}
			if (directiva === "@compas" || directiva.startsWith("@compas=")) {
				const valor = directiva.startsWith("@compas=")
					? directiva.slice("@compas=".length)
					: tokens[1]?.[0];
				if (valor === undefined) {
					errorEn(
						numero,
						columnaDirectiva,
						"falta el número de pasos de @compas",
					);
				}
				compas = enteroOpcion(valor, numero, columnaDirectiva, "@compas");
				if (compas < 1)
					errorEn(numero, columnaDirectiva, "@compas debe ser positivo");
				continue;
			}
			errorEn(numero, columnaDirectiva, `directiva desconocida "${directiva}"`);
		}

		if (hayCabecera === false || id === undefined || bpm === undefined) {
			errorEn(numero, 1, "faltan las directivas @cancion antes de las pistas");
		}
		if (nombre === undefined) {
			errorEn(numero, 1, "falta la directiva @nombre antes de las pistas");
		}

		const corte = linea.indexOf("|");
		if (corte < 0) {
			errorEn(
				numero,
				linea.length + 1,
				"falta el separador | antes de las notas",
			);
		}
		const cabecera = linea.slice(0, corte);
		const tokens = [...cabecera.matchAll(/\S+/g)];
		const primero = tokens[0];
		if (primero === undefined) {
			errorEn(numero, 1, "falta el canal de la pista");
		}
		const canal = leerCanal(primero[0], numero, (primero.index ?? 0) + 1);
		if (canales.has(canal)) {
			errorEn(
				numero,
				(primero.index ?? 0) + 1,
				`el canal ${canal} ya tiene una pista (primera en la línea ${canales.get(canal)})`,
			);
		}
		canales.set(canal, numero);
		if (pistas.length >= 4) {
			errorEn(numero, 1, "una canción admite como mucho cuatro pistas");
		}

		const opciones: {
			ciclo?: Pista["ciclo"];
			onda?: Pista["onda"];
			ruidoCorto?: boolean;
			volumen?: Pista["volumen"];
			envolvente?: Pista["envolvente"];
			vibrato?: Pista["vibrato"];
			pan?: Pista["pan"];
			eco?: Pista["eco"];
		} = {};

		for (let t = 1; t < tokens.length; t++) {
			const token = tokens[t];
			if (token === undefined) continue;
			const columna = (token.index ?? 0) + 1;
			const { clave, valor } = partirOpcion(token[0]);
			switch (clave) {
				case "ciclo": {
					const numeroCiclo = realOpcion(valor, numero, columna, "ciclo");
					const ciclo = CICLOS.find((c) => c === numeroCiclo);
					if (ciclo === undefined) {
						errorEn(
							numero,
							columna,
							`ciclo ${valor} no válido (12.5, 25, 50 o 75)`,
						);
					}
					opciones.ciclo = ciclo;
					break;
				}
				case "vol": {
					const volumen = enteroOpcion(valor, numero, columna, "vol");
					if (volumen < 1 || volumen > 15) {
						errorEn(numero, columna, `vol fuera de 1..15 (${volumen})`);
					}
					opciones.volumen = volumen;
					break;
				}
				case "env": {
					const partes = listaOpcion(valor, numero, columna, "env");
					if (partes.length !== 2) {
						errorEn(numero, columna, "env necesita inicio,paso");
					}
					const inicio = enteroOpcion(partes[0] ?? "", numero, columna, "env");
					const paso = enteroOpcion(partes[1] ?? "", numero, columna, "env");
					if (inicio < 1 || inicio > 15) {
						errorEn(numero, columna, `env.inicio fuera de 1..15 (${inicio})`);
					}
					if (paso < -7 || paso > 7) {
						errorEn(numero, columna, `env.paso fuera de -7..7 (${paso})`);
					}
					const envolvente: EnvolventeHardware = { inicio, paso };
					opciones.envolvente = envolvente;
					break;
				}
				case "vib": {
					const partes = listaOpcion(valor, numero, columna, "vib");
					if (partes.length !== 3) {
						errorEn(numero, columna, "vib necesita retardoMs,hz,profundidad");
					}
					const retardoMs = enteroOpcion(
						partes[0] ?? "",
						numero,
						columna,
						"vib",
					);
					const hz = realOpcion(partes[1] ?? "", numero, columna, "vib");
					const profundidad = realOpcion(
						partes[2] ?? "",
						numero,
						columna,
						"vib",
					);
					if (retardoMs < 0 || retardoMs > 1000) {
						errorEn(
							numero,
							columna,
							`vib.retardoMs fuera de 0..1000 (${retardoMs})`,
						);
					}
					if (hz < 1 || hz > 12) {
						errorEn(numero, columna, `vib.hz fuera de 1..12 (${hz})`);
					}
					if (profundidad < 0 || profundidad > 2) {
						errorEn(
							numero,
							columna,
							`vib.profundidad fuera de 0..2 (${profundidad})`,
						);
					}
					const vibrato: VibratoCancion = { retardoMs, hz, profundidad };
					opciones.vibrato = vibrato;
					break;
				}
				case "pan": {
					const pan = realOpcion(valor, numero, columna, "pan");
					if (pan < -1 || pan > 1) {
						errorEn(numero, columna, `pan fuera de -1..1 (${pan})`);
					}
					opciones.pan = pan;
					break;
				}
				case "eco": {
					const partes = listaOpcion(valor, numero, columna, "eco");
					if (partes.length !== 2) {
						errorEn(numero, columna, "eco necesita retardoMs,mezcla");
					}
					const retardoMs = enteroOpcion(
						partes[0] ?? "",
						numero,
						columna,
						"eco",
					);
					const mezcla = realOpcion(partes[1] ?? "", numero, columna, "eco");
					if (retardoMs < 20 || retardoMs > 400) {
						errorEn(
							numero,
							columna,
							`eco.retardoMs fuera de 20..400 (${retardoMs})`,
						);
					}
					if (mezcla < 0 || mezcla > 0.6) {
						errorEn(numero, columna, `eco.mezcla fuera de 0..0.6 (${mezcla})`);
					}
					const eco: Eco = { retardoMs, mezcla };
					opciones.eco = eco;
					break;
				}
				case "onda": {
					const partes = listaOpcion(valor, numero, columna, "onda");
					if (partes.length !== 32) {
						errorEn(
							numero,
							columna,
							`onda necesita 32 muestras (${partes.length})`,
						);
					}
					const onda = partes.map((parte) => {
						const muestra = enteroOpcion(parte, numero, columna, "onda");
						if (muestra < 0 || muestra > 15) {
							errorEn(numero, columna, `onda fuera de 0..15 (${muestra})`);
						}
						return muestra;
					});
					opciones.onda = onda;
					break;
				}
				case "corto":
					if (canal !== "ruido") {
						errorEn(numero, columna, "corto solo vale en el canal de ruido");
					}
					opciones.ruidoCorto = true;
					break;
				default:
					errorEn(numero, columna, `opción de pista desconocida "${clave}"`);
			}
		}

		if (canal === "onda" && opciones.onda === undefined) {
			errorEn(numero, 1, "el canal onda necesita la opción onda=...");
		}
		if (canal !== "onda" && opciones.onda !== undefined) {
			errorEn(numero, 1, "la opción onda=... solo vale en el canal onda");
		}
		if (canal !== "ruido" && opciones.ruidoCorto !== undefined) {
			errorEn(numero, 1, "la opción corto solo vale en el canal ruido");
		}

		const estado: Estado = {
			octava: 4,
			longitud: 4,
			volumen: 15,
			paso: 0,
		};
		const lector = new Lector(linea, numero, corte + 1);
		const bloque = compilarBloque(
			lector,
			estado,
			canal,
			pasosPorNegra,
			0,
			false,
		);
		if (estado.deslizPendiente !== undefined) {
			lector.error("el deslizamiento se quedó sin nota");
		}
		if (compas !== undefined && bloque.barras.length > 0) {
			let anterior = 0;
			let numeroCompas = 1;
			for (const marca of bloque.barras) {
				const largo = marca - anterior;
				if (marca === anterior) {
					// Un `|` justo al final no añade un compás vacío.
					continue;
				}
				if (largo !== compas) {
					errorEn(
						numero,
						1,
						`el compás ${numeroCompas} mide ${largo} pasos y @compas pide ${compas}`,
					);
				}
				anterior = marca;
				numeroCompas++;
			}
			const resto = bloque.pasos - anterior;
			if (resto !== 0 && resto !== compas) {
				errorEn(
					numero,
					1,
					`el último compás mide ${resto} pasos y @compas pide ${compas}`,
				);
			}
		}
		pistas.push({ canal, ...opciones, notas: bloque.notas });
		pasosPista.push(bloque.pasos);
	}

	if (id === undefined || bpm === undefined) {
		errorEn(1, 1, "faltan las directivas @cancion con id y bpm");
	}
	if (nombre === undefined) {
		errorEn(1, 1, "falta la directiva @nombre");
	}
	const pasos = Math.max(0, ...pasosPista);
	if (pasos < 1) {
		errorEn(1, 1, "la canción no tiene ni un paso de música");
	}
	const cancion: Cancion = {
		id,
		nombre,
		bpm,
		pasosPorNegra,
		pasos,
		repetir,
		pistas,
	};
	if (bucle !== undefined) cancion.bucle = { desde: bucle };
	if (swing !== undefined) cancion.swing = swing;
	return CancionSchema.parse(cancion);
}
