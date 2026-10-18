import atlasJson from "@packs/kanto/atlas-combate.json?url";
import atlasPng from "@packs/kanto/atlas-combate.png?url";
import {
	abrirCombate,
	type CombateRemoto,
	type Eleccion,
	type EventoCombate,
	eleccionIlegal,
	esEleccionIlegal,
	type Lado,
	type MiembroEquipo,
	type Peticion,
	type ResultadoTurno,
} from "@santuario/battle";
import { resolverCombate } from "@santuario/core";
import Phaser from "phaser";
import { cargarDatosCombate } from "../combate/datosPack.js";
import { crearEquipos } from "../combate/equipos.js";
import { mensajeDe } from "../combate/mensajes.js";
import { cargarBalance } from "../expedicion/balancePack.js";
import {
	type DatosCombate,
	destinoTrasCombate,
	dineroDeNodo,
	prepararCombate,
	resultadoDeCombate,
} from "../expedicion/combateNodo.js";
import { t } from "../i18n/index.js";
import { obtenerSemilla } from "../semilla.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";
const ATLAS = "combate";
const NIVEL = 50;

// Paleta coherente con la lista de especies (#1b1b2f, #ffd866, #9ad1ff).
const FONDO_UI = 0x1b1b2f;
const ACENTO = 0xffd866;
const BOTON = 0x2d2d52;
const BOTON_SOBRE = 0x44447a;
const BOTON_APAGADO = 0x3a3a46;

/** Pausa por mensaje; con `?test=1` es corta para que las pruebas e2e no esperen. */
const PAUSA_MENSAJE_MS = 900;
const PAUSA_MENSAJE_PRUEBA_MS = 40;
const PAUSA_BARRA_MS = 450;
const PAUSA_BARRA_PRUEBA_MS = 60;

type Fase = "cargando" | "reproduciendo" | "menu" | "cambio" | "fin" | "error";

/** Todo lo que se dibuja de un lado del campo. */
interface LadoVisual {
	lado: Lado;
	sprite: Phaser.GameObjects.Image;
	baseY: number;
	/** Objetos de la placa de nombre; ocultos hasta el primer `cambio` del lado. */
	placa: Visibilidad[];
	nombre: Phaser.GameObjects.Text;
	nivel: Phaser.GameObjects.Text;
	pstexto: Phaser.GameObjects.Text;
	barra: Phaser.GameObjects.Rectangle;
	/** Proporción de PS que se está mostrando (la anima un tween). */
	ratio: number;
	hp: number;
	hpMax: number;
}

const ANCHO_BARRA = 90;

type Visibilidad = Phaser.GameObjects.Components.Visible;

export class Combate extends Phaser.Scene {
	private remoto?: CombateRemoto;
	/** Número de ejecución: cada `create` lo incrementa y toda continuación asíncrona comprueba el suyo. */
	private generacion = 0;
	private falloForzado: "fatal" | "ilegal" | null = null;
	private errorMostrado: {
		titulo: string;
		cuerpo: string;
		detalle: string;
	} | null = null;
	private fase: Fase = "cargando";
	private peticion: Peticion | null = null;
	private terminado: Lado | "empate" | null = null;
	/** Título del panel final o de error visible (solo para las pruebas e2e). */
	private tituloPanel: string | null = null;
	private readonly mensajes: string[] = [];
	private campo!: Record<Lado, LadoVisual>;
	private cajaTexto!: Phaser.GameObjects.Text;
	private menu: Phaser.GameObjects.GameObject[] = [];
	private panelFinal: Phaser.GameObjects.GameObject[] = [];
	/** Resuelve la espera en curso (la usa saltar mensaje). */
	private saltar: (() => void) | null = null;
	private pausaMensajeMs = PAUSA_MENSAJE_MS;
	private pausaBarraMs = PAUSA_BARRA_MS;
	private datos!: ReturnType<typeof cargarDatosCombate>;
	/** Presente cuando el combate es el de un nodo de la expedición; si no, es el combate de prueba. */
	private expedicion?: DatosCombate & { vivos: number[] };
	private equipoFinal?: { especie: string; psPct: number }[];
	private datosExpedicion?: DatosCombate;
	/** Acciones por tecla de la vista actual (menú o lista de cambio). */
	private teclas = new Map<string, () => void>();

	constructor() {
		super("Combate");
	}

	init(datos?: Partial<DatosCombate>): void {
		this.datosExpedicion =
			datos?.estado && datos.nodoId
				? { estado: datos.estado, nodoId: datos.nodoId }
				: undefined;
		this.expedicion = undefined;
		this.equipoFinal = undefined;
	}

	preload(): void {
		if (!this.textures.exists(ATLAS))
			this.load.atlas(ATLAS, atlasPng, atlasJson);
	}

	create(): void {
		const consulta = new URLSearchParams(location.search);
		const prueba = consulta.get("test") === "1";
		// `?pausas=reales` conserva los tiempos de juego aun con ganchos (prueba del salto de mensajes)
		const rapido = prueba && consulta.get("pausas") !== "reales";
		this.pausaMensajeMs = rapido ? PAUSA_MENSAJE_PRUEBA_MS : PAUSA_MENSAJE_MS;
		this.pausaBarraMs = rapido ? PAUSA_BARRA_PRUEBA_MS : PAUSA_BARRA_MS;
		++this.generacion;
		this.falloForzado = null;
		this.errorMostrado = null;
		this.fase = "cargando";
		this.peticion = null;
		this.terminado = null;
		this.tituloPanel = null;
		this.mensajes.length = 0;
		this.menu = [];
		this.panelFinal = [];
		this.teclas = new Map();

		this.dibujarFondo();
		this.campo = {
			rival: this.crearLado("rival"),
			jugador: this.crearLado("jugador"),
		};
		this.dibujarCaja();
		this.cajaTexto.setText(t("combate.cargando"));
		// Esc vuelve a la lista aunque el combate aún se esté abriendo (cierra su Worker).
		this.teclas.set("escape", () => this.volverALista());

		alPulsarTecla(this, (ev) => this.tecla(ev.key, ev.repeat));
		this.input.on("pointerdown", () => this.saltarMensaje());
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			++this.generacion;
			this.remoto?.cerrar();
			this.remoto = undefined;
			const g = window as unknown as { __santuario?: { combate?: unknown } };
			if (g.__santuario) delete g.__santuario.combate;
		});

		if (prueba) this.exponerGancho();
		this.game.canvas.parentElement?.setAttribute("data-estado", "combate");
		void this.arrancar();
	}

	// ---------------------------------------------------------------- arranque

	private vigente(gen: number): boolean {
		return gen === this.generacion;
	}

	private async arrancar(): Promise<void> {
		const gen = this.generacion;
		let remoto: CombateRemoto | undefined;
		try {
			// Se carga aquí (no al construir la escena) para que un pack roto muestre el panel de error.
			this.datos = cargarDatosCombate();
			let semilla: string;
			let jugador: MiembroEquipo[];
			let rival: MiembroEquipo[];
			if (this.datosExpedicion) {
				const p = prepararCombate(
					this.datosExpedicion.estado,
					this.datosExpedicion.nodoId,
					this.datos.sets,
				);
				({ semilla, jugador, rival } = p);
				this.expedicion = { ...this.datosExpedicion, vivos: p.vivos };
			} else {
				semilla = obtenerSemilla();
				({ jugador, rival } = crearEquipos(semilla, this.datos.sets));
			}
			const abierto = await abrirCombate({ semilla, jugador, rival });
			remoto = abierto.remoto;
			if (!this.vigente(gen)) return remoto.cerrar();
			this.remoto = remoto;
			await this.aplicar(abierto, gen);
		} catch (e) {
			if (this.vigente(gen)) this.mostrarError(e);
			else remoto?.cerrar();
		}
	}

	/** Reproduce los eventos de un resultado y deja la escena lista para la siguiente acción. */
	private async aplicar(r: ResultadoTurno, gen: number): Promise<void> {
		this.fase = "reproduciendo";
		await this.reproducir(r.eventos, gen);
		if (!this.vigente(gen)) return;
		this.peticion = r.peticion;
		this.terminado = r.terminado;
		if (r.equipoFinal) this.equipoFinal = r.equipoFinal;
		this.siguienteVista();
	}

	/** Tras reproducir: fin del combate, lista de cambio forzado o menú de movimientos. */
	private siguienteVista(aviso?: string): void {
		if (this.terminado) this.mostrarFin();
		else if (!this.peticion)
			this.mostrarError(
				new Error("Estado inconsistente: sin petición ni final"),
			);
		else if (this.peticion.tipo === "cambio-forzado") this.mostrarCambio(aviso);
		else this.mostrarMenu(aviso);
	}

	// --------------------------------------------------------------- elecciones

	/** Única vía de elección: la usan los botones, las teclas y el gancho de pruebas. */
	private async elegir(e: Eleccion): Promise<void> {
		const remoto = this.remoto;
		if ((this.fase !== "menu" && this.fase !== "cambio") || !remoto) {
			throw new Error(`No se puede elegir en la fase "${this.fase}"`);
		}
		const gen = this.generacion;
		this.limpiarMenu();
		this.fase = "reproduciendo";
		this.cajaTexto.setText("");
		let resultado: ResultadoTurno;
		try {
			const forzado = this.falloForzado;
			this.falloForzado = null;
			resultado = forzado
				? await Promise.reject(
						forzado === "ilegal"
							? eleccionIlegal("Fallo forzado de prueba: elección ilegal")
							: new Error(
									"El combate dejó de responder: fallo forzado de prueba",
								),
					)
				: await remoto.elegirJugador(e);
		} catch (error) {
			if (!this.vigente(gen)) return;
			// Solo la elección ilegal es recuperable: el combate sigue en un estado válido.
			if (esEleccionIlegal(error))
				this.siguienteVista(t("combate.avisoIlegal"));
			else this.mostrarError(error);
			return;
		}
		if (!this.vigente(gen)) return;
		try {
			await this.aplicar(resultado, gen);
		} catch (error) {
			// Un fallo de reproducción (cliente) nunca es una elección ilegal.
			if (this.vigente(gen)) this.mostrarError(error);
		}
	}

	// ------------------------------------------------------------------ fondo

	private dibujarFondo(): void {
		const bandas: [number, number, number, number][] = [
			[0, 0, 60, 0x274c77],
			[0, 60, 50, 0x3a6ea5],
			[0, 110, 45, 0x6096ba],
			[0, 155, 45, 0x5f9a5a], // suelo
		];
		for (const [x, y, alto, color] of bandas) {
			this.add.rectangle(x, y, 480, alto, color).setOrigin(0, 0);
		}
		this.add.rectangle(0, 155, 480, 2, 0x477a43).setOrigin(0, 0);
		// plataformas de cada Pokémon
		this.add.ellipse(380, 128, 120, 22, 0x477a43);
		this.add.ellipse(110, 196, 140, 26, 0x477a43);
		this.add.rectangle(0, 204, 480, 66, FONDO_UI).setOrigin(0, 0);
		this.add.rectangle(0, 204, 480, 2, ACENTO).setOrigin(0, 0);
	}

	private crearLado(lado: Lado): LadoVisual {
		const rival = lado === "rival";
		// Sprites del atlas (96x96) con escala entera x2.
		const x = rival ? 380 : 110;
		const baseY = rival ? 78 : 140;
		const sprite = this.add
			.image(x, baseY, ATLAS)
			.setScale(2)
			.setVisible(false);
		const antes = this.children.length;
		const px = rival ? 10 : 262;
		const py = rival ? 10 : 152;
		this.add
			.rectangle(px, py, 208, 40, FONDO_UI, 0.92)
			.setOrigin(0, 0)
			.setStrokeStyle(1, ACENTO);
		const nombre = this.add
			.text(px + 6, py + 4, "", {
				fontFamily: FUENTE,
				fontSize: "11px",
				color: "#ffffff",
			})
			.setVisible(false);
		const nivel = this.add
			.text(px + 202, py + 5, t("combate.nivel", { n: NIVEL }), {
				fontFamily: FUENTE,
				fontSize: "9px",
				color: "#9ad1ff",
			})
			.setOrigin(1, 0);
		this.add.text(px + 6, py + 24, t("combate.ps"), {
			fontFamily: FUENTE,
			fontSize: "9px",
			color: "#ffd866",
		});
		this.add
			.rectangle(px + 24, py + 26, ANCHO_BARRA + 2, 8, 0x000000)
			.setOrigin(0, 0);
		const barra = this.add
			.rectangle(px + 25, py + 27, ANCHO_BARRA, 6, 0x4cd964)
			.setOrigin(0, 0);
		const pstexto = this.add.text(px + 202, py + 24, "", {
			fontFamily: FUENTE,
			fontSize: "9px",
			color: "#ffffff",
		});
		pstexto.setOrigin(1, 0);
		const placa = this.children.list.slice(antes) as unknown as Visibilidad[];
		for (const o of placa) o.setVisible(false);
		return {
			lado,
			sprite,
			baseY,
			placa,
			nombre,
			nivel,
			pstexto,
			barra,
			ratio: 1,
			hp: 1,
			hpMax: 1,
		};
	}

	private dibujarCaja(): void {
		this.cajaTexto = this.add.text(16, 214, "", {
			fontFamily: FUENTE,
			fontSize: "12px",
			color: "#ffffff",
			wordWrap: { width: 448 },
			lineSpacing: 4,
		});
	}

	// ---------------------------------------------------------- reproducción

	private async reproducir(
		eventos: EventoCombate[],
		gen: number,
	): Promise<void> {
		for (const e of eventos) {
			if (!this.vigente(gen)) return;
			await this.aplicarEvento(e);
			if (!this.vigente(gen)) return;
			const texto = mensajeDe(e, this.datos.nombres);
			if (texto) {
				this.mensajes.push(texto);
				this.cajaTexto.setText(texto);
				await this.esperar(this.pausaMensajeMs);
			}
		}
	}

	private async aplicarEvento(e: EventoCombate): Promise<void> {
		switch (e.tipo) {
			case "dano":
			case "curacion": {
				const l = this.campo[e.lado];
				l.hp = e.hp;
				l.hpMax = e.hpMax;
				this.pintarTextoPs(l);
				this.tweens.add({
					targets: l,
					ratio: e.hpMax > 0 ? e.hp / e.hpMax : 0,
					duration: this.pausaBarraMs,
					onUpdate: () => this.pintarBarra(l),
				});
				await this.esperar(this.pausaBarraMs + 50, false);
				return;
			}
			case "cambio": {
				const l = this.campo[e.lado];
				l.hp = e.hp;
				l.hpMax = e.hpMax;
				l.ratio = e.hpMax > 0 ? e.hp / e.hpMax : 0;
				const vista = e.lado === "jugador" ? "espalda" : "frente";
				l.sprite
					.setTexture(ATLAS, `combate/${e.especie}/${vista}`)
					.setPosition(l.sprite.x, l.baseY)
					.setAlpha(0)
					.setVisible(true);
				for (const o of l.placa) o.setVisible(true);
				l.nombre.setText(this.datos.nombres.especie(e.especie));
				this.pintarBarra(l);
				this.pintarTextoPs(l);
				await this.animar({ targets: l.sprite, alpha: 1, duration: 200 });
				return;
			}
			case "debilitado": {
				const l = this.campo[e.lado];
				await this.animar({
					targets: l.sprite,
					alpha: 0,
					y: l.baseY + 20,
					duration: 300,
				});
				return;
			}
			default:
				return;
		}
	}

	/** Dato de cada lado, solo el jugador muestra PS numéricos. */
	private pintarTextoPs(l: LadoVisual): void {
		l.pstexto.setText(l.lado === "jugador" ? `${l.hp}/${l.hpMax}` : "");
	}

	private pintarBarra(l: LadoVisual): void {
		const r = Phaser.Math.Clamp(l.ratio, 0, 1);
		const color = r > 0.5 ? 0x4cd964 : r > 0.2 ? 0xffcc00 : 0xff453a;
		l.barra.setSize(Math.round(ANCHO_BARRA * r), 6).setFillStyle(color);
		l.barra.setVisible(r > 0);
	}

	private animar(
		config: Phaser.Types.Tweens.TweenBuilderConfig,
	): Promise<void> {
		return new Promise((resolver) => {
			this.tweens.add({ ...config, onComplete: () => resolver() });
		});
	}

	/** Espera `ms` o hasta que el jugador salte (tecla o clic). */
	private esperar(ms: number, saltable = true): Promise<void> {
		return new Promise((resolver) => {
			const cronometro = this.time.delayedCall(ms, () => fin());
			const fin = (): void => {
				cronometro.remove(false);
				this.saltar = null;
				resolver();
			};
			if (saltable) this.saltar = fin;
		});
	}

	private saltarMensaje(): void {
		if (this.fase === "reproduciendo") this.saltar?.();
	}

	// ------------------------------------------------------------------ menús

	private limpiarMenu(): void {
		for (const o of this.menu) o.destroy();
		this.menu = [];
		this.teclas.clear();
	}

	/** Botón de 2 líneas; si está apagado no responde al ratón ni a la tecla. */
	private boton(
		x: number,
		y: number,
		ancho: number,
		lineas: [string, string?],
		activo: boolean,
		accion: () => void,
		tecla?: string,
	): void {
		const alto = 28;
		const fondo = this.add
			.rectangle(x, y, ancho, alto, activo ? BOTON : BOTON_APAGADO)
			.setOrigin(0, 0)
			.setStrokeStyle(1, activo ? ACENTO : 0x555566);
		const color = activo ? "#ffffff" : "#8a8a96";
		const a = this.add.text(x + 6, y + 3, lineas[0], {
			fontFamily: FUENTE,
			fontSize: "11px",
			color,
		});
		const objetos: Phaser.GameObjects.GameObject[] = [fondo, a];
		if (lineas[1]) {
			objetos.push(
				this.add.text(x + 6, y + 16, lineas[1], {
					fontFamily: FUENTE,
					fontSize: "9px",
					color: activo ? "#9ad1ff" : "#8a8a96",
				}),
			);
		}
		this.menu.push(...objetos);
		if (!activo) return;
		fondo.setInteractive({ useHandCursor: true });
		fondo.on("pointerover", () => fondo.setFillStyle(BOTON_SOBRE));
		fondo.on("pointerout", () => fondo.setFillStyle(BOTON));
		fondo.on("pointerdown", accion);
		if (tecla) this.teclas.set(tecla, accion);
	}

	/** Rejilla de 2x2 a la izquierda; la columna derecha lleva la pregunta y el botón de cambio. */
	private posicion(i: number): { x: number; y: number } {
		return { x: 10 + (i % 2) * 154, y: 210 + Math.floor(i / 2) * 30 };
	}

	private textoPregunta(texto: string, color = "#ffffff"): void {
		this.menu.push(
			this.add.text(326, 212, texto, {
				fontFamily: FUENTE,
				fontSize: "10px",
				color,
				wordWrap: { width: 146 },
				lineSpacing: 2,
			}),
		);
	}

	private mostrarMenu(error?: string): void {
		const p = this.peticion;
		if (!p) return;
		this.limpiarMenu();
		this.fase = "menu";
		this.cajaTexto.setText("");
		p.movimientos.forEach((m, i) => {
			const { x, y } = this.posicion(i);
			const tipo = t(`tipo.${this.datos.tipoDeMovimiento(m.movimiento)}`);
			this.boton(
				x,
				y,
				150,
				[
					`${i + 1} ${this.datos.nombres.movimiento(m.movimiento)}`,
					`${tipo}  ${t("combate.pp")} ${m.pp}/${m.ppMax}`,
				],
				!m.deshabilitado,
				() => void this.elegir({ tipo: "movimiento", indice: i }),
				String(i + 1),
			);
		});
		const activo = p.equipo.find((m) => m.activo);
		const hayCambio = p.equipo.some((m) => !m.activo && !m.debilitado);
		this.boton(
			326,
			240,
			144,
			[t("combate.cambiar")],
			hayCambio,
			() => this.mostrarCambio(),
			"c",
		);
		this.textoPregunta(
			error ??
				t("combate.elige", {
					especie: this.datos.nombres.especie(activo?.especie ?? ""),
				}),
			error ? "#ff8b8b" : "#ffffff",
		);
		// Esc abandona el combate desde el menú principal (cierra el Worker al salir de la escena)
		this.teclas.set("escape", () => this.volverALista());
	}

	private mostrarCambio(error?: string): void {
		const p = this.peticion;
		if (!p) return;
		this.limpiarMenu();
		this.fase = "cambio";
		this.cajaTexto.setText("");
		const forzado = p.tipo === "cambio-forzado";
		p.equipo.forEach((m, i) => {
			const { x, y } = this.posicion(i);
			const nombre = this.datos.nombres.especie(m.especie);
			this.boton(
				x,
				y,
				150,
				[
					`${i + 1} ${nombre}`,
					m.debilitado
						? t("combate.debilitado")
						: `${m.hp}/${m.hpMax} ${t("combate.ps")}`,
				],
				!m.activo && !m.debilitado,
				() => void this.elegir({ tipo: "cambio", indice: i }),
				String(i + 1),
			);
		});
		if (forzado) this.teclas.set("escape", () => this.volverALista());
		else {
			const volver = (): void => this.mostrarMenu();
			this.boton(326, 240, 144, [t("combate.volver")], true, volver, "escape");
		}
		this.textoPregunta(
			error ?? t("combate.eligeCambio"),
			error ? "#ff8b8b" : "#ffffff",
		);
	}

	// -------------------------------------------------------- fin y errores

	private panel(
		titulo: string,
		cuerpo: string,
		colorTitulo: string,
		detalle = "",
		etiquetaBoton = t("combate.salir"),
	): void {
		this.cajaTexto.setText("");
		this.limpiarMenu();
		this.tituloPanel = titulo;
		const alto = cuerpo ? 176 : 100;
		const y0 = Math.round((270 - alto) / 2);
		const objetos = this.panelFinal;
		objetos.push(
			this.add
				.rectangle(0, 0, 480, 270, 0x000000, 0.65)
				.setOrigin(0, 0)
				.setDepth(10),
			this.add
				.rectangle(20, y0, 440, alto, FONDO_UI)
				.setOrigin(0, 0)
				.setStrokeStyle(2, ACENTO)
				.setDepth(11),
			this.add
				.text(240, y0 + 14, titulo, {
					fontFamily: FUENTE,
					fontSize: "22px",
					color: colorTitulo,
				})
				.setOrigin(0.5, 0)
				.setDepth(12),
		);
		if (cuerpo) {
			objetos.push(
				this.add
					.text(34, y0 + 50, cuerpo, {
						fontFamily: FUENTE,
						fontSize: "10px",
						color: "#ffffff",
						wordWrap: { width: 412 },
					})
					.setDepth(12),
			);
		}
		if (detalle) {
			// detalle técnico del motor (puede venir en español): línea pequeña aparte
			objetos.push(
				this.add
					.text(34, y0 + 84, detalle, {
						fontFamily: FUENTE,
						fontSize: "8px",
						color: "#9a9ab0",
						wordWrap: { width: 412 },
					})
					.setDepth(12),
			);
		}
		const volver = (): void => this.salirDelPanel();
		const fondo = this.add
			.rectangle(240, y0 + alto - 32, 220, 24, BOTON)
			.setStrokeStyle(1, ACENTO)
			.setDepth(12)
			.setInteractive({ useHandCursor: true });
		fondo.on("pointerover", () => fondo.setFillStyle(BOTON_SOBRE));
		fondo.on("pointerout", () => fondo.setFillStyle(BOTON));
		fondo.on("pointerdown", volver);
		objetos.push(
			fondo,
			this.add
				.text(240, y0 + alto - 32, etiquetaBoton, {
					fontFamily: FUENTE,
					fontSize: "11px",
					color: "#ffffff",
				})
				.setOrigin(0.5)
				.setDepth(13),
		);
		for (const k of ["escape", "enter"]) this.teclas.set(k, volver);
	}

	private mostrarFin(): void {
		this.fase = "fin";
		const g = this.terminado;
		const [titulo, color] =
			g === "jugador"
				? [t("combate.victoria"), "#7dff9a"]
				: g === "rival"
					? [t("combate.derrota"), "#ff8b8b"]
					: [t("combate.empate"), "#ffd866"];
		this.panel(
			titulo,
			"",
			color,
			"",
			this.expedicion ? t("combate.continuar") : undefined,
		);
	}

	private mostrarError(error: unknown): void {
		this.fase = "error";
		const detalle = (
			error instanceof Error ? error.message : String(error)
		).slice(0, 300);
		this.errorMostrado = {
			titulo: t("combate.error"),
			cuerpo: t("combate.errorCuerpo"),
			detalle,
		};
		this.panel(
			this.errorMostrado.titulo,
			this.errorMostrado.cuerpo,
			"#ff8b8b",
			detalle,
		);
	}

	private volverALista(): void {
		this.scene.start("ListaEspecies");
	}

	/** Botón del panel: en la expedición, un combate terminado sigue su camino; lo demás vuelve a la lista. */
	private salirDelPanel(): void {
		if (this.fase === "fin" && this.expedicion) this.continuarExpedicion();
		else this.volverALista();
	}

	/** Devuelve el resultado al estado de la expedición y pasa al mapa o a la pantalla final. */
	private continuarExpedicion(): void {
		const x = this.expedicion;
		const ganador = this.terminado;
		if (!x || !ganador) return;
		try {
			const resultado = resultadoDeCombate(
				x.estado,
				x.vivos,
				ganador,
				this.equipoFinal ?? [],
				dineroDeNodo(cargarBalance(), x.estado, x.nodoId),
			);
			const estado = resolverCombate(x.estado, resultado);
			this.scene.start(destinoTrasCombate(estado), { estado });
		} catch (e) {
			this.mostrarError(e);
		}
	}

	private tecla(clave: string, repetida: boolean): void {
		if (this.fase === "reproduciendo") {
			if (!repetida) this.saltarMensaje(); // la repetición automática no salta mensajes
		} else this.teclas.get(clave.toLowerCase())?.();
	}

	// ---------------------------------------------------- ganchos de pruebas

	/** Solo con `?test=1`: mismos caminos que la interfaz (`elegir` es el de los botones). */
	private exponerGancho(): void {
		const g = window as unknown as { __santuario?: Record<string, unknown> };
		g.__santuario ??= {};
		g.__santuario.combate = {
			estado: () => ({
				fase: this.fase,
				peticion: this.peticion,
				terminado: this.terminado,
				panel: this.tituloPanel,
				mensajes: [...this.mensajes],
				hpJugador: this.campo.jugador.hp,
				hpRival: this.campo.rival.hp,
				error: this.errorMostrado,
			}),
			/** El siguiente `elegir` rechaza como fallo fatal o como elección ilegal (misma gestión que un rechazo real). */
			forzarFallo: (tipo: "fatal" | "ilegal") => {
				this.falloForzado = tipo;
			},
			elegir: (e: Eleccion) => this.elegir(e),
			registroHash: async () => {
				const registro = (await this.remoto?.registro()) ?? "";
				const h = await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(registro),
				);
				return Array.from(new Uint8Array(h), (b) =>
					b.toString(16).padStart(2, "0"),
				).join("");
			},
		};
	}
}
