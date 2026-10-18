import type { DatosCombate } from "@santuario/battle";
import {
	type EstadoExpedicion,
	elegibles,
	entrar,
	esNodoDeCombate,
	type TipoNodo,
	totalBayas,
	usarBayaAlMasHerido,
} from "@santuario/core";
import Phaser from "phaser";
import iconosPng from "../assets/iconos-nodo.png?url";
import { cargarDatosCombate } from "../combate/datosPack.js";
import { posicionesNodos } from "../expedicion/dibujoMapa.js";
import { t } from "../i18n/index.js";
import { alPulsarTecla } from "../teclado.js";
import type { DatosEleccion } from "./Eleccion.js";
import type { DatosTienda } from "./Tienda.js";

const FUENTE = "monospace";
const ICONOS = "iconos-nodo";
const ANCHO = 480;
const ALTO = 270;

const ACENTO = 0xffd866;
const ARISTA = 0x44447a;
const ARISTA_RECORRIDA = 0x8a8ab8;

/** Orden de los fotogramas en `iconos-nodo.png` (tira de 9 iconos de 16×16). */
const FOTOGRAMA: Record<TipoNodo, number> = {
	salvaje: 0,
	entrenador: 1,
	alfa: 2,
	sombrio: 3,
	tienda: 4,
	manantial: 5,
	evento: 6,
	cofre: 7,
	jefe: 8,
};

export interface DatosMapa {
	estado: EstadoExpedicion;
}

/** Mapa de nodos del piso: se elige a qué nodo contiguo ir. */
export class Mapa extends Phaser.Scene {
	private estado!: EstadoExpedicion;
	private posiciones: Record<string, { x: number; y: number }> = {};
	private etiqueta?: Phaser.GameObjects.Text;

	constructor() {
		super("Mapa");
	}

	init(datos: DatosMapa): void {
		this.estado = datos.estado;
	}

	preload(): void {
		if (!this.textures.exists(ICONOS))
			this.load.spritesheet(ICONOS, iconosPng, {
				frameWidth: 16,
				frameHeight: 16,
			});
	}

	create(): void {
		const e = this.estado;
		this.posiciones = posicionesNodos(e.mapa, ANCHO, ALTO);
		const posible = new Set(elegibles(e));
		const visitados = new Set(e.visitados);

		this.dibujarAristas(posible, visitados);
		for (const nodo of e.mapa.capas.flat()) {
			const { x, y } = this.posiciones[nodo.id] as { x: number; y: number };
			const icono = this.add.sprite(x, y, ICONOS, FOTOGRAMA[nodo.tipo]);
			const nombre = t(`nodo.${nodo.tipo}`);
			if (posible.has(nodo.id)) {
				const aro = this.add.circle(x, y, 12).setStrokeStyle(1, ACENTO);
				this.tweens.add({
					targets: aro,
					alpha: { from: 0.35, to: 1 },
					duration: 600,
					yoyo: true,
					repeat: -1,
				});
				icono
					.setInteractive({
						hitArea: new Phaser.Geom.Rectangle(-6, -6, 28, 28),
						hitAreaCallback: Phaser.Geom.Rectangle.Contains,
						useHandCursor: true,
					})
					.on("pointerdown", () => this.elegir(nodo.id))
					.on("pointerover", () => this.etiqueta?.setText(nombre))
					.on("pointerout", () => this.etiqueta?.setText(t("mapa.ayuda")));
			} else if (visitados.has(nodo.id)) {
				icono.setAlpha(0.45);
			} else {
				icono.setAlpha(0.7).setTint(0xb0b0c8);
			}
			if (nodo.id === e.actual) {
				this.add.circle(x, y, 12).setStrokeStyle(1, 0xffffff);
			}
		}

		this.dibujarHud();
		this.etiqueta = this.add
			.text(ANCHO / 2, ALTO - 8, t("mapa.ayuda"), {
				fontFamily: FUENTE,
				fontSize: "10px",
				color: "#9ad1ff",
			})
			.setOrigin(0.5, 1);

		const ids = elegibles(e);
		alPulsarTecla(this, (ev) => {
			const id = ids[Number(ev.key) - 1];
			if (id !== undefined) this.elegir(id);
			else if (ev.key.toLowerCase() === "b") this.darBaya();
			else if (ev.key === "Escape") this.scene.start("ListaEspecies");
		});
		this.exponerGancho();
	}

	private dibujarAristas(posible: Set<string>, visitados: Set<string>): void {
		const g = this.add.graphics();
		for (const nodo of this.estado.mapa.capas.flat()) {
			const a = this.posiciones[nodo.id] as { x: number; y: number };
			for (const id of nodo.siguientes) {
				const b = this.posiciones[id] as { x: number; y: number };
				const desdeAqui = nodo.id === this.estado.actual && posible.has(id);
				const recorrida = visitados.has(nodo.id) && visitados.has(id);
				g.lineStyle(
					desdeAqui ? 2 : 1,
					desdeAqui ? ACENTO : recorrida ? ARISTA_RECORRIDA : ARISTA,
				);
				g.lineBetween(a.x, a.y, b.x, b.y);
			}
		}
	}

	private dibujarHud(): void {
		const e = this.estado;
		const estilo = { fontFamily: FUENTE, fontSize: "10px", color: "#ffffff" };
		this.add.text(8, 6, t("mapa.piso", { n: e.piso }), {
			...estilo,
			color: "#ffd866",
		});
		this.add.text(8, 20, t("mapa.dinero", { n: e.dinero }), estilo);
		const bolas = Object.entries(e.mochila)
			.filter(([id]) => id.endsWith("-ball"))
			.reduce((n, [, c]) => n + c, 0);
		this.add.text(
			8,
			34,
			t("mapa.mochila", { bolas, bayas: totalBayas(e) }),
			estilo,
		);
		this.add.text(
			8,
			48,
			t("mapa.runas", {
				lista: e.runas.length > 0 ? e.runas.join(" ") : t("mapa.sinRunas"),
			}),
			estilo,
		);
		const nombres = cargarDatosCombate().nombres;
		e.equipo.forEach((m, i) => {
			this.add.text(
				150 + i * 112,
				6,
				`${nombres.especie(m.especie)}\n${m.psPct}%`,
				{ ...estilo, color: m.psPct === 0 ? "#ff8b8b" : "#7dff9a" },
			);
		});
	}

	/** Tecla B: una baya al miembro más herido. */
	private darBaya(): void {
		const siguiente = usarBayaAlMasHerido(this.estado);
		if (siguiente !== this.estado)
			this.scene.restart({ estado: siguiente } satisfies DatosMapa);
	}

	private elegir(id: string): void {
		const estado = entrar(this.estado, id);
		const nodo = estado.mapa.capas.flat().find((n) => n.id === id);
		if (nodo && esNodoDeCombate(nodo.tipo)) {
			this.scene.start("Combate", {
				estado,
				nodoId: id,
			} satisfies DatosCombate);
		} else if (
			nodo &&
			(nodo.tipo === "manantial" ||
				nodo.tipo === "cofre" ||
				nodo.tipo === "evento")
		) {
			this.scene.start("Eleccion", {
				estado,
				nodoId: id,
			} satisfies DatosEleccion);
		} else if (nodo?.tipo === "tienda") {
			this.scene.start("Tienda", {
				estado,
				nodoId: id,
			} satisfies DatosTienda);
		} else {
			this.scene.restart({ estado } satisfies DatosMapa);
		}
	}

	/** Solo con `?test=1`: mismos caminos que la interfaz. */
	private exponerGancho(): void {
		if (new URLSearchParams(location.search).get("test") !== "1") return;
		const g = window as unknown as { __santuario?: Record<string, unknown> };
		g.__santuario ??= {};
		g.__santuario.mapa = {
			estado: () => ({
				piso: this.estado.piso,
				actual: this.estado.actual,
				visitados: [...this.estado.visitados],
				elegibles: elegibles(this.estado),
				dinero: this.estado.dinero,
				mochila: { ...this.estado.mochila },
				runas: [...this.estado.runas],
				equipo: this.estado.equipo.map((m) => m.psPct),
			}),
			/** Tipo de un nodo del mapa (para que las pruebas elijan uno de combate). */
			tipoDe: (id: string) =>
				this.estado.mapa.capas.flat().find((n) => n.id === id)?.tipo,
			elegir: (id: string) => this.elegir(id),
			/** Todos los nodos con su tipo. */
			nodos: () =>
				this.estado.mapa.capas.flat().map((n) => ({ id: n.id, tipo: n.tipo })),
			/** Salta a un nodo de elección sin pasar por las capas anteriores. */
			irA: (id: string) =>
				this.scene.start(
					this.estado.mapa.capas.flat().find((n) => n.id === id)?.tipo ===
						"tienda"
						? "Tienda"
						: "Eleccion",
					{
						estado: {
							...this.estado,
							actual: id,
							visitados: [...this.estado.visitados, id],
						},
						nodoId: id,
					},
				),
			/** Solo para pruebas: cambia dinero y runas del estado y repinta el mapa. */
			preparar: (cambios: {
				dinero?: number;
				runas?: string[];
				mochila?: Record<string, number>;
				equipo?: (string | [string, number])[];
			}) => {
				const { equipo, ...resto } = cambios;
				this.scene.restart({
					estado: {
						...this.estado,
						...resto,
						...(equipo && {
							equipo: equipo.map((m) =>
								Array.isArray(m)
									? { especie: m[0], psPct: m[1] }
									: { especie: m, psPct: 100 },
							),
						}),
					},
				});
			},
			/** Centro de un nodo en coordenadas de página. */
			centro: (id: string) => {
				const c = this.game.canvas.getBoundingClientRect();
				const k = c.width / this.scale.width;
				const p = this.posiciones[id] as { x: number; y: number };
				return { x: c.left + p.x * k, y: c.top + p.y * k };
			},
		};
	}
}
