import { bolasIniciales } from "@santuario/battle";
import type {
	AccionPartida,
	EstadoPartida,
	EventoSantuario,
} from "@santuario/core";
import {
	crearRng,
	generarIV,
	llamasIniciales,
	miembroDeResidente,
} from "@santuario/core";
import Phaser from "phaser";
import losetasPng from "../assets/santuario/losetas.png?url";
import protagonistaPng from "../assets/santuario/protagonista.png?url";
import { musica } from "../audio/gestor.js";
import { MUSICA } from "../audio/sonidos.js";
import { cargarBalance } from "../expedicion/balancePack.js";
import { cargarProgresion } from "../expedicion/progresionPack.js";
import { t } from "../i18n/index.js";
import { asegurarSprite } from "../oficial/recursos.js";
import {
	bloqueado,
	edificioCercano,
	LADO,
	rectanguloDeEdificio,
	varianteDeLoseta,
} from "../santuario/colisiones.js";
import { MenusGestion } from "../santuario/menusGestion.js";
import { nombreDeEspecie } from "../santuario/nombres.js";
import { type ItemMenu, PanelMenu } from "../santuario/panelMenu.js";
import { type LineaResumen, resumenDeJornada } from "../santuario/resumen.js";
import type { Sesion } from "../santuario/sesion.js";
import {
	obtenerSesion,
	tomarResumenPendiente,
} from "../santuario/sesionGlobal.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";
const VELOCIDAD = 70; // píxeles por segundo
const CAJA = { ancho: 10, alto: 6 }; // pies del protagonista, para las colisiones
const ALCANCE_ARBOL = 34; // distancia al centro del Árbol Cenit para interactuar
const MS_POR_PASO = 140;
const TIPOS_LOSETA = [
	"yerma",
	"tierra",
	"pradera",
	"hierba-alta",
	"agua",
	"arena",
	"roca",
	"camino",
];
const EDIFICIOS_CON_ARTE = [
	"arbol-cenit",
	"lecho-hojas",
	"huerto-bayas",
	"aserradero",
	"cantera",
	"almacen",
];
const URL_EDIFICIOS = import.meta.glob("../assets/santuario/*.png", {
	query: "?url",
	import: "default",
	eager: true,
}) as Record<string, string>;
const urlEdificio = (id: string): string =>
	URL_EDIFICIOS[`../assets/santuario/${id}.png`] as string;

type Direccion = "abajo" | "arriba" | "lado";
const FILA: Record<Direccion, number> = { abajo: 0, arriba: 1, lado: 2 };
const PROFUNDIDAD_UI = 100000;

/** Texto de un recurso del resumen o de la barra, con las bayas juntas. */
const nombreRecurso = (id: string) => t(`recurso.${id}`);

/**
 * El Santuario: la isla se dibuja desde el estado del núcleo (terreno, edificios, residentes),
 * el protagonista camina por ella y el tiempo avanza por jornadas con un resumen al atardecer.
 * Todo cambio pasa por `sesion.despachar`, que guarda sola.
 */
export class SantuarioMundo extends Phaser.Scene {
	private sesion!: Sesion;
	private jugador!: Phaser.GameObjects.Sprite;
	private teclas!: Record<
		"arriba" | "abajo" | "izq" | "der" | "w" | "a" | "s" | "d",
		Phaser.Input.Keyboard.Key
	>;
	private direccion: Direccion = "abajo";
	private tPaso = 0;
	private aviso!: Phaser.GameObjects.Text;
	private hud!: Phaser.GameObjects.Text;
	private recursos!: Phaser.GameObjects.Text;
	private ayuda!: Phaser.GameObjects.Text;
	private avisoGuardado!: Phaser.GameObjects.Text;
	private capaMundo?: Phaser.GameObjects.Container;
	private panel?: Phaser.GameObjects.Container;
	private cerca = false;
	private listo = false;
	/** Evita que una carga lenta pinte sobre una escena ya cerrada. */
	private generacion = 0;
	private lineasPanel: LineaResumen[] = [];
	private menu!: PanelMenu;
	/** Residentes marcados para la expedición mientras se elige el equipo. */
	private elegidos = new Set<string>();
	private gestion!: MenusGestion;

	constructor() {
		super("SantuarioMundo");
	}

	preload(): void {
		if (!this.textures.exists("losetas"))
			this.load.spritesheet("losetas", losetasPng, {
				frameWidth: LADO,
				frameHeight: LADO,
			});
		if (!this.textures.exists("protagonista"))
			this.load.spritesheet("protagonista", protagonistaPng, {
				frameWidth: LADO,
				frameHeight: LADO,
			});
		for (const id of EDIFICIOS_CON_ARTE)
			if (!this.textures.exists(id)) this.load.image(id, urlEdificio(id));
	}

	create(): void {
		this.listo = false;
		this.panel = undefined;
		this.capaMundo = undefined;
		this.menu = new PanelMenu(this);
		this.menu.alElegirInactivo(() => this.mostrarAviso(t("gestion.faltan")));
		this.gestion = new MenusGestion(
			{
				escena: this,
				partida: () => this.p,
				balance: () => this.sesion.ctx.balance,
				gestionar: (a) => this.gestionar(a),
				aviso: (x) => this.mostrarAviso(x),
				ayuda: (x) => this.ayuda.setText(x),
				actualizarHud: () => this.actualizarHud(),
				jugador: () => this.jugador,
				alAbrirMenu: () => {
					this.aviso.setVisible(false);
					this.cerca = false;
				},
			},
			this.menu,
		);
		this.cerca = false;
		const gen = ++this.generacion;
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			++this.generacion;
		});
		this.cameras.main.setBackgroundColor(0x12122b);
		this.crearTeclado();
		this.crearHud();
		this.ayuda.setText(t("santuario.cargando"));
		alPulsarTecla(this, (ev) => this.alTecla(ev.key));
		void musica(MUSICA.mapa);
		void this.abrir(gen);
	}

	private crearTeclado(): void {
		const k = this.input.keyboard;
		if (!k) throw new Error("el teclado no está disponible");
		const c = k.createCursorKeys();
		const wasd = k.addKeys("W,A,S,D") as Record<
			"W" | "A" | "S" | "D",
			Phaser.Input.Keyboard.Key
		>;
		this.teclas = {
			arriba: c.up,
			abajo: c.down,
			izq: c.left,
			der: c.right,
			w: wasd.W,
			a: wasd.A,
			s: wasd.S,
			d: wasd.D,
		};
	}

	private crearHud(): void {
		const base = { fontFamily: FUENTE, fontSize: "10px" };
		for (const [y, alto] of [
			[0, 32],
			[250, 20],
		] as const)
			this.add
				.rectangle(0, y, 480, alto, 0x12122b, 0.78)
				.setOrigin(0, 0)
				.setScrollFactor(0)
				.setDepth(PROFUNDIDAD_UI - 1);
		const fija = (o: Phaser.GameObjects.Text) =>
			o.setScrollFactor(0).setDepth(PROFUNDIDAD_UI);
		this.hud = fija(this.add.text(8, 6, "", { ...base, color: "#ffd866" }));
		this.recursos = fija(
			this.add.text(8, 19, "", { ...base, color: "#d9c89a" }),
		);
		this.ayuda = fija(
			this.add
				.text(240, 264, "", { ...base, color: "#9ad1ff" })
				.setOrigin(0.5, 1),
		);
		this.aviso = fija(
			this.add
				.text(240, 240, "", {
					...base,
					color: "#1b1b2f",
					backgroundColor: "#7dff9a",
					padding: { x: 4, y: 3 },
				})
				.setOrigin(0.5, 1)
				.setVisible(false),
		);
		this.avisoGuardado = fija(
			this.add.text(472, 6, "", { ...base, color: "#ff8b8b" }).setOrigin(1, 0),
		);
	}

	/** Carga (o crea) la partida y dibuja la isla; un guardado ilegible muestra el error y deja volver. */
	private async abrir(gen: number): Promise<void> {
		try {
			const { sesion, avisos } = await obtenerSesion();
			if (gen !== this.generacion) return;
			this.sesion = sesion;
			this.avisoGuardado.setText(
				avisos
					.map((a) =>
						t(`santuario.aviso.${a === "sin-guardado" ? "sinGuardado" : a}`),
					)
					.join("\n"),
			);
			this.listo = true;
			this.cameras.main.setZoom(1);
			this.repintar();
			void musica(MUSICA.mapa);
			this.exponerGancho();
			this.mostrarResumenPendiente();
		} catch (e) {
			if (gen !== this.generacion) return;
			this.ayuda.setText(t("santuario.error.volver"));
			this.hud.setText(t("santuario.error.titulo"));
			this.recursos.setText(e instanceof Error ? e.message : String(e));
		}
	}

	private get p(): EstadoPartida {
		return this.sesion.partida();
	}

	// ----------------------------------------------------------------- dibujo

	/** Redibuja el mundo entero desde el estado (es barato: una isla de 40×30 losetas). */
	private repintar(): void {
		const { santuario: s } = this.p;
		const b = this.sesion.ctx.balance;
		this.capaMundo?.destroy();
		const capa = this.add.container(0, 0).setDepth(0);
		this.capaMundo = capa;
		const { ancho, alto, losetas } = s.terreno;
		this.cameras.main.setBounds(0, 0, ancho * LADO, alto * LADO);

		for (let y = 0; y < alto; y++)
			for (let x = 0; x < ancho; x++) {
				const l = losetas[y * ancho + x];
				if (l === undefined) continue;
				capa.add(
					this.add
						.image(
							x * LADO,
							y * LADO,
							"losetas",
							TIPOS_LOSETA.indexOf(l.tipo) * 4 + varianteDeLoseta(x, y),
						)
						.setOrigin(0, 0)
						.setDepth(0),
				);
				if (l.objeto !== undefined)
					capa.add(this.dibujarObjeto(l.objeto, x, y, l.encendido));
			}

		for (const e of s.edificios) {
			const r = rectanguloDeEdificio(e, b);
			const enObra = e.obraRestante > 0;
			const profundidad = (r.y + r.alto) * LADO;
			if (EDIFICIOS_CON_ARTE.includes(e.tipo)) {
				capa.add(
					this.add
						.image(r.x * LADO, r.y * LADO, e.tipo)
						.setOrigin(0, 0)
						.setAlpha(enObra ? 0.5 : 1)
						.setDepth(profundidad),
				);
			} else {
				capa.add(
					this.add
						.rectangle(
							r.x * LADO,
							r.y * LADO,
							r.ancho * LADO,
							r.alto * LADO,
							0x7a5232,
							enObra ? 0.5 : 1,
						)
						.setOrigin(0, 0)
						.setDepth(profundidad),
				);
			}
			if (enObra)
				capa.add(
					this.add
						.text(
							(r.x + r.ancho / 2) * LADO,
							r.y * LADO - 2,
							`${e.obraRestante}`,
							{ fontFamily: FUENTE, fontSize: "9px", color: "#ffd866" },
						)
						.setOrigin(0.5, 1)
						.setDepth(PROFUNDIDAD_UI - 1),
				);
		}

		for (const m of s.accionesMarcadas)
			capa.add(
				this.add
					.rectangle(
						m.x * LADO + 1,
						m.y * LADO + 1,
						LADO - 2,
						LADO - 2,
						0xffd866,
						0.3,
					)
					.setOrigin(0, 0)
					.setStrokeStyle(1, 0xffd866)
					.setDepth((m.y + 1) * LADO),
			);

		this.crearJugadorSiHaceFalta();
		void this.dibujarResidentes(capa);
		this.actualizarHud();
	}

	/** Objetos del terreno con formas sencillas hasta que haya arte propio. */
	private dibujarObjeto(
		objeto: string,
		x: number,
		y: number,
		encendido: boolean,
	): Phaser.GameObjects.GameObject {
		const cx = x * LADO + LADO / 2;
		const cy = y * LADO + LADO / 2;
		const dep = (y + 1) * LADO;
		switch (objeto) {
			case "arbol":
				return this.add.circle(cx, cy - 2, 7, 0x3f9e5f).setDepth(dep);
			case "arbol-joven":
				return this.add.circle(cx, cy, 4, 0x67c77f).setDepth(dep);
			case "brote":
				return this.add.rectangle(cx, cy + 2, 2, 5, 0x67c77f).setDepth(dep);
			case "tocon":
				return this.add.rectangle(cx, cy + 2, 8, 5, 0x573823).setDepth(dep);
			case "flor":
				return this.add.circle(cx, cy, 2, 0xf95587).setDepth(dep);
			case "farol":
				return this.add
					.rectangle(cx, cy, 4, 9, encendido ? 0xffd866 : 0x6b7190)
					.setDepth(dep);
			case "fogata":
				return this.add
					.circle(cx, cy + 2, 4, encendido ? 0xee8130 : 0x4a4f68)
					.setDepth(dep);
			default:
				return this.add.rectangle(cx, cy, 8, 8, 0x9aa0b8).setDepth(dep);
		}
	}

	/** Un sprite pequeño (la silueta del sustituto) por residente, cerca del Árbol Cenit. */
	private async dibujarResidentes(
		capa: Phaser.GameObjects.Container,
	): Promise<void> {
		const gen = this.generacion;
		const { santuario: s } = this.p;
		const b = this.sesion.ctx.balance;
		const arbol = s.edificios.find((e) => e.tipo === "arbol-cenit");
		if (!arbol) return;
		const r = rectanguloDeEdificio(arbol, b);
		const cx = (r.x + r.ancho / 2) * LADO;
		const cy = (r.y + r.alto) * LADO + 14;
		for (const [i, res] of s.residentes.entries()) {
			const rng = crearRng(`${s.semilla}:sitio:${res.uid}`);
			let pos = { x: cx, y: cy };
			for (let intento = 0; intento < 12; intento++) {
				const ang = rng.siguiente() * Math.PI * 2;
				const rad = 18 + rng.siguiente() * 40 + i * 2;
				const q = { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad };
				if (!bloqueado(s, b, q.x - 6, q.y - 4, 12, 8)) {
					pos = q;
					break;
				}
			}
			const textura = await asegurarSprite(
				this,
				res.especie,
				"frente",
				res.tipos[0],
			);
			if (gen !== this.generacion || capa !== this.capaMundo) return;
			const sprite = this.add
				.image(pos.x, pos.y, textura)
				.setOrigin(0.5, 1)
				.setScale(0.25)
				.setDepth(pos.y)
				.setAlpha(res.estado === "visitante" ? 0.75 : 1);
			capa.add(sprite);
			this.tweens.add({
				targets: sprite,
				y: pos.y - 2,
				duration: 500 + (i % 3) * 120,
				yoyo: true,
				repeat: -1,
			});
		}
	}

	private crearJugadorSiHaceFalta(): void {
		if (this.jugador?.active) return;
		const { santuario: s } = this.p;
		const arbol = s.edificios.find((e) => e.tipo === "arbol-cenit");
		const r = arbol
			? rectanguloDeEdificio(arbol, this.sesion.ctx.balance)
			: undefined;
		const x = r ? (r.x + r.ancho / 2) * LADO : 320;
		const y = r ? (r.y + r.alto + 2) * LADO : 240;
		this.jugador = this.add.sprite(x, y, "protagonista", 0).setOrigin(0.5, 1);
		this.cameras.main.startFollow(this.jugador, true, 0.15, 0.15);
	}

	private actualizarHud(): void {
		const { santuario: s } = this.p;
		this.hud.setText(
			t("santuario.hud", {
				jornada: s.jornada,
				momento: t(`momento.${s.momento}`),
				armonia: s.armonia,
			}),
		);
		const bayas = Object.entries(s.recursos)
			.filter(([k]) => k.startsWith("baya:"))
			.reduce((suma, [, v]) => suma + v, 0);
		const r = s.recursos;
		this.recursos.setText(
			[
				`${nombreRecurso("madera")} ${r.madera ?? 0}`,
				`${nombreRecurso("piedra")} ${r.piedra ?? 0}`,
				`${nombreRecurso("baya")} ${bayas}`,
				`${nombreRecurso("mineral")} ${r.mineral ?? 0}`,
				`${nombreRecurso("pokedolares")} ${r.pokedolares ?? 0}`,
			].join("  ·  "),
		);
		const clave =
			s.momento === "alba" ? "alba" : s.momento === "noche" ? "noche" : "dia";
		if (!this.panel) this.ayuda.setText(t(`santuario.ayuda.${clave}`));
	}

	// --------------------------------------------------------------- entrada

	private alTecla(tecla: string): void {
		const k = tecla.toLowerCase();
		if (!this.listo) {
			if (k === "escape") this.scene.start("ListaEspecies");
			return;
		}
		if (this.gestion.cursorActivo) {
			this.gestion.tecla(k);
			return;
		}
		if (this.menu.tecla(tecla)) return;
		if (this.panel) {
			if (k === "enter" || k === " ") this.cerrarPanel();
			return;
		}
		if (k === "enter" || k === " ") this.avanzarMomento();
		else if (k === "g") this.gestion.abrir();
		else if (k === "e" && this.cerca) this.alPulsarArbol();
		else if (k === "escape") this.scene.start("ListaEspecies");
	}

	/** Enter: alba → día, día → atardecer (y resumen), noche → alba (y resumen). */
	private avanzarMomento(): void {
		const momento = this.p.santuario.momento;
		const accion =
			momento === "alba"
				? ({ tipo: "comenzarDia" } as const)
				: momento === "dia"
					? ({ tipo: "pasarDia" } as const)
					: ({ tipo: "dormir" } as const);
		const antes = this.p.santuario.recursos;
		let eventos: EventoSantuario[];
		try {
			eventos = this.sesion.despachar(accion);
		} catch (e) {
			this.mostrarAviso(e instanceof Error ? e.message : String(e));
			return;
		}
		this.repintar();
		if (accion.tipo !== "comenzarDia") {
			const nombre = (uid: string) => {
				const r = this.p.santuario.residentes.find((x) => x.uid === uid);
				return r ? nombreDeEspecie(r.especie) : uid;
			};
			this.abrirPanel(
				resumenDeJornada(eventos, antes, this.p.santuario.recursos, nombre),
			);
		}
		this.vigilarGuardado();
	}

	private vigilarGuardado(): void {
		void this.sesion.guardada().then(() => {
			if (!this.sesion.guardadoOk())
				this.avisoGuardado.setText(t("santuario.aviso.errorGuardado"));
		});
	}

	/** Aplica una acción de gestión; si el núcleo la rechaza, avisa con su motivo. */
	private gestionar(accion: AccionPartida): boolean {
		try {
			this.sesion.despachar(accion);
		} catch (e) {
			this.mostrarAviso(e instanceof Error ? e.message : String(e));
			return false;
		}
		this.repintar();
		this.vigilarGuardado();
		return true;
	}

	private abrirPanel(lineas: LineaResumen[]): void {
		this.lineasPanel = lineas;
		const textos = lineas.length
			? lineas.map((l) => this.textoDeLinea(l))
			: [t("santuario.resumen.vacio")];
		const alto = 40 + textos.length * 13;
		const y0 = Math.max(20, 135 - alto / 2);
		const fondo = this.add
			.rectangle(240, y0, 360, alto, 0x12122b, 0.95)
			.setOrigin(0.5, 0)
			.setStrokeStyle(1, 0xffd866);
		const titulo = this.add
			.text(240, y0 + 8, t("santuario.resumen.titulo"), {
				fontFamily: FUENTE,
				fontSize: "11px",
				color: "#ffd866",
			})
			.setOrigin(0.5, 0);
		const cuerpo = this.add.text(70, y0 + 28, textos.join("\n"), {
			fontFamily: FUENTE,
			fontSize: "10px",
			color: "#ffffff",
			lineSpacing: 3,
			wordWrap: { width: 340 },
		});
		const pie = this.add
			.text(240, y0 + alto - 4, t("santuario.resumen.cerrar"), {
				fontFamily: FUENTE,
				fontSize: "9px",
				color: "#9ad1ff",
			})
			.setOrigin(0.5, 1);
		this.panel = this.add
			.container(0, 0, [fondo, titulo, cuerpo, pie])
			.setScrollFactor(0)
			.setDepth(PROFUNDIDAD_UI + 1);
		this.ayuda.setText("");
	}

	private cerrarPanel(): void {
		this.panel?.destroy();
		this.panel = undefined;
		this.actualizarHud();
	}

	/** Texto de una línea del resumen: sustituye ids por nombres legibles. */
	private textoDeLinea(l: LineaResumen): string {
		const params: Record<string, string | number> = { ...(l.params ?? {}) };
		if (typeof params.recurso === "string")
			params.recurso = nombreRecurso(params.recurso);
		if (typeof params.edificio === "string")
			params.edificio = t(`edificio.${params.edificio}`);
		if (typeof params.habitat === "string")
			params.habitat = t(`habitat.${params.habitat}.nombre`);
		if (typeof params.especie === "string")
			params.especie = nombreDeEspecie(params.especie);
		if (typeof params.motivo === "string")
			params.motivo = t(`santuario.motivo.${params.motivo}`);
		return t(l.clave, params);
	}

	private mostrarAviso(texto: string): void {
		this.aviso.setText(texto).setVisible(true);
		this.time.delayedCall(2500, () => this.aviso.setVisible(false));
	}

	// ------------------------------------------------------------- movimiento

	update(_: number, dt: number): void {
		if (
			!this.listo ||
			this.panel ||
			this.menu.abierto ||
			this.gestion.cursorActivo
		)
			return;
		const seg = dt / 1000;
		const ti = this.teclas;
		const dx =
			(ti.der.isDown || ti.d.isDown ? 1 : 0) -
			(ti.izq.isDown || ti.a.isDown ? 1 : 0);
		const dy =
			(ti.abajo.isDown || ti.s.isDown ? 1 : 0) -
			(ti.arriba.isDown || ti.w.isDown ? 1 : 0);
		if (dx !== 0 || dy !== 0) {
			const norma = Math.hypot(dx, dy);
			this.mover((dx / norma) * VELOCIDAD * seg, 0);
			this.mover(0, (dy / norma) * VELOCIDAD * seg);
			this.direccion =
				dy !== 0 && Math.abs(dy) >= Math.abs(dx)
					? dy > 0
						? "abajo"
						: "arriba"
					: "lado";
			if (dx !== 0) this.jugador.setFlipX(dx < 0);
			this.tPaso += dt;
		} else this.tPaso = 0;
		const paso =
			this.tPaso === 0 ? 0 : 1 + (Math.floor(this.tPaso / MS_POR_PASO) % 2);
		this.jugador.setFrame(FILA[this.direccion] * 3 + paso);
		this.jugador.setDepth(this.jugador.y);

		const { santuario: s } = this.p;
		const b = this.sesion.ctx.balance;
		const arbol = edificioCercano(
			s,
			b,
			"arbol-cenit",
			this.jugador.x,
			this.jugador.y,
		);
		const cerca =
			s.momento === "dia" &&
			arbol !== undefined &&
			arbol.distancia <=
				ALCANCE_ARBOL +
					(rectanguloDeEdificio(arbol.edificio, b).ancho * LADO) / 2;
		if (cerca !== this.cerca) {
			this.cerca = cerca;
			this.aviso
				.setText(
					t(this.p.expedicion ? "santuario.continuar" : "santuario.salir"),
				)
				.setVisible(cerca);
		}
	}

	/** Mueve al protagonista en un eje si la caja de los pies no choca con nada. */
	private mover(dx: number, dy: number): void {
		const nx = this.jugador.x + dx;
		const ny = this.jugador.y + dy;
		if (
			!bloqueado(
				this.p.santuario,
				this.sesion.ctx.balance,
				nx - CAJA.ancho / 2,
				ny - CAJA.alto,
				CAJA.ancho,
				CAJA.alto,
			)
		) {
			this.jugador.x = nx;
			this.jugador.y = ny;
		}
	}

	/** E junto al Árbol: continuar la expedición en curso o elegir el equipo para una nueva. */
	private alPulsarArbol(): void {
		const x = this.p.expedicion;
		if (x) {
			this.irALaExpedicion(x);
			return;
		}
		const descansados = this.p.santuario.residentes.filter(
			(r) => r.estado === "descansado",
		);
		if (descansados.length === 0) {
			this.mostrarAviso(t("equipo.vacio"));
			return;
		}
		this.aviso.setVisible(false);
		this.cerca = false;
		this.ayuda.setText("");
		this.elegidos = new Set();
		this.menuEquipo();
	}

	private menuEquipo(indice = 0): void {
		const descansados = this.p.santuario.residentes.filter(
			(r) => r.estado === "descansado",
		);
		const items: ItemMenu[] = descansados.map((r, i) => ({
			texto: `${this.elegidos.has(r.uid) ? "[x]" : "[ ]"} ${nombreDeEspecie(r.especie)}`,
			alElegir: () => {
				if (this.elegidos.has(r.uid)) this.elegidos.delete(r.uid);
				else if (this.elegidos.size < 6) this.elegidos.add(r.uid);
				this.menuEquipo(i);
			},
		}));
		items.push({
			texto: t("equipo.salir", { n: this.elegidos.size }),
			activo: this.elegidos.size >= 1,
			alElegir: () => this.salirConEquipo(),
		});
		this.menu.mostrar(
			t("equipo.titulo"),
			items,
			t("gestion.pie"),
			() => this.gestion.cerrar(),
			indice,
		);
	}

	private salirConEquipo(): void {
		const s = this.p.santuario;
		const balance = cargarBalance();
		const catalogo = cargarProgresion().catalogo;
		const uids = [...this.elegidos];
		const miembros = uids.map((uid) => {
			const r = s.residentes.find((q) => q.uid === uid);
			if (r === undefined) throw new Error(`residente desconocido '${uid}'`);
			return {
				...miembroDeResidente(r, 0, catalogo),
				naturaleza: r.naturaleza,
				// Los IV no se guardan: salen siempre iguales de la semilla y el uid del residente.
				iv: generarIV(crearRng(`${s.semilla}:iv:${uid}`)),
			};
		});
		const ok = this.gestionar({
			tipo: "salirAExpedicion",
			uids,
			miembros,
			semilla: `${s.semilla}:exp:${s.jornada}`,
			dinero: balance.dineroInicial,
			mochila: bolasIniciales(balance),
			llamas: llamasIniciales(balance.farol, {
				rangoRama: 0,
				farolTenue: false,
			}),
		});
		if (!ok) return;
		this.menu.cerrar();
		const x = this.p.expedicion;
		if (x) this.irALaExpedicion(x);
	}

	/** Mapa si la expedición sigue en curso; si ya terminó (se cerró el juego en el último combate), su pantalla final. */
	private irALaExpedicion(x: NonNullable<EstadoPartida["expedicion"]>): void {
		this.scene.start(x.estado === "en-curso" ? "Mapa" : "FinExpedicion", {
			estado: x,
		});
	}

	/** Al volver de una expedición, el resumen de lo que trajo y del Atardecer. */
	private mostrarResumenPendiente(): void {
		const r = tomarResumenPendiente();
		if (!r) return;
		const nombre = (uid: string) => {
			const q = this.p.santuario.residentes.find((x) => x.uid === uid);
			return q ? nombreDeEspecie(q.especie) : uid;
		};
		this.abrirPanel(
			resumenDeJornada(
				r.eventos,
				r.recursosAntes,
				this.p.santuario.recursos,
				nombre,
			),
		);
	}

	// ---------------------------------------------------------------- pruebas

	/** Solo con `?test=1`: mismos caminos que la interfaz. */
	private exponerGancho(): void {
		if (new URLSearchParams(location.search).get("test") !== "1") return;
		const g = window as unknown as { __santuario?: Record<string, unknown> };
		g.__santuario ??= {};
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			delete g.__santuario?.santuario;
		});
		const b = () => this.sesion.ctx.balance;
		g.__santuario.santuario = {
			estado: () => ({
				x: Math.round(this.jugador.x),
				y: Math.round(this.jugador.y),
				direccion: this.direccion,
				cercaDelArbol: this.cerca,
				jornada: this.p.santuario.jornada,
				momento: this.p.santuario.momento,
				armonia: this.p.santuario.armonia,
				recursos: { ...this.p.santuario.recursos },
				residentes: this.p.santuario.residentes.map((r) => ({
					uid: r.uid,
					especie: r.especie,
					estado: r.estado,
					hambre: r.hambre,
					animo: r.animo,
					tarea: r.tarea,
					lecho: r.lecho ?? null,
				})),
				edificios: this.p.santuario.edificios.map((e) => ({
					uid: e.uid,
					tipo: e.tipo,
					x: e.x,
					y: e.y,
					nivel: e.nivel,
					obraRestante: e.obraRestante,
				})),
				menu: this.menu.abierto,
				colocando: this.gestion.cursorActivo,
				marcas: this.p.santuario.accionesMarcadas.length,
				panel: this.panel !== undefined,
				lineasPanel: this.lineasPanel.map((l) => l.clave),
				guardadoOk: this.sesion.guardadoOk(),
				aviso: this.aviso.visible ? this.aviso.text : "",
			}),
			/** Coloca al protagonista (en píxeles) si el sitio es transitable. */
			colocar: (x: number, y: number) => {
				if (
					bloqueado(
						this.p.santuario,
						b(),
						x - CAJA.ancho / 2,
						y - CAJA.alto,
						CAJA.ancho,
						CAJA.alto,
					)
				)
					return false;
				this.jugador.setPosition(x, y);
				return true;
			},
			arbol: () => {
				const a = this.p.santuario.edificios.find(
					(e) => e.tipo === "arbol-cenit",
				);
				if (!a) return null;
				const r = rectanguloDeEdificio(a, b());
				return { x: (r.x + r.ancho / 2) * LADO, y: (r.y + r.alto) * LADO + 8 };
			},
			/** Tipo y objeto de una loseta de la isla. */
			loseta: (x: number, y: number) => {
				const l =
					this.p.santuario.terreno.losetas[
						y * this.p.santuario.terreno.ancho + x
					];
				return l ? { tipo: l.tipo, objeto: l.objeto ?? null } : null;
			},
			/** Espera a que todo lo despachado esté guardado. */
			guardada: () => this.sesion.guardada(),
		};
	}
}
