import {
	type EstadoExpedicion,
	elegibles,
	entrar,
	type TipoNodo,
} from "@santuario/core";
import Phaser from "phaser";
import iconosPng from "../assets/iconos-nodo.png?url";
import { cargarDatosCombate } from "../combate/datosPack.js";
import { posicionesNodos } from "../expedicion/dibujoMapa.js";
import { t } from "../i18n/index.js";

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
		for (const [i, tecla] of ["ONE", "TWO", "THREE"].entries()) {
			const id = ids[i];
			if (id !== undefined)
				this.input.keyboard?.on(`keydown-${tecla}`, () => this.elegir(id));
		}
		this.input.keyboard?.on("keydown-ESC", () =>
			this.scene.start("ListaEspecies"),
		);
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

	private elegir(id: string): void {
		this.scene.restart({ estado: entrar(this.estado, id) } satisfies DatosMapa);
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
			}),
			elegir: (id: string) => this.elegir(id),
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
