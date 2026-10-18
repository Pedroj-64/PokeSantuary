import {
	type Articulo,
	comprarArticulo,
	cuantos,
	type EstadoExpedicion,
	modificadores,
	ofertaTienda,
} from "@santuario/core";
import Phaser from "phaser";
import { cargarBalance } from "../expedicion/balancePack.js";
import { t } from "../i18n/index.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";

export interface DatosTienda {
	estado: EstadoExpedicion;
	nodoId: string;
}

/** Tienda Kecleon: ofertas deterministas por nodo, precios con el recargo del piso. */
export class Tienda extends Phaser.Scene {
	private estado!: EstadoExpedicion;
	private nodoId!: string;
	private oferta: Articulo[] = [];
	private catalogo: Articulo[] = [];
	private teclas = new Map<string, () => void>();
	private vista: Phaser.GameObjects.GameObject[] = [];

	constructor() {
		super("Tienda");
	}

	init(datos: DatosTienda): void {
		this.estado = datos.estado;
		this.nodoId = datos.nodoId;
	}

	create(): void {
		const e = this.estado;
		this.catalogo = cargarBalance().catalogoTienda;
		this.oferta = ofertaTienda(
			e.semilla,
			e.piso,
			this.nodoId,
			// MT y objetos aún no tienen uso (Fase 3): solo se venden bolas y bayas.
			this.catalogo.filter((a) => a.tipo === "ball" || a.tipo === "baya"),
			modificadores(e.runas).opcionesTiendaExtra,
		);
		alPulsarTecla(this, (ev) => this.teclas.get(ev.key)?.());
		this.dibujar();
		this.exponerGancho();
	}

	private texto(
		y: number,
		contenido: string,
		extra: Phaser.Types.GameObjects.Text.TextStyle = {},
	): Phaser.GameObjects.Text {
		const obj = this.add.text(20, y, contenido, {
			fontFamily: FUENTE,
			fontSize: "11px",
			color: "#ffffff",
			...extra,
		});
		this.vista.push(obj);
		return obj;
	}

	private dibujar(): void {
		for (const o of this.vista) o.destroy();
		this.vista = [];
		this.teclas.clear();
		const e = this.estado;
		this.texto(16, t("nodo.tienda"), { fontSize: "16px", color: "#ffd866" });
		this.texto(44, t("mapa.dinero", { n: e.dinero }), { color: "#ffd866" });
		this.oferta.forEach((a, i) => {
			const alcanza = e.dinero >= a.precio;
			const fila = this.texto(
				70 + i * 28,
				`[${i + 1}] ${t(`articulo.${a.id}`)}  ${a.precio}  (${t("tienda.tienes", { n: cuantos(e, a.id) })})`,
				{
					backgroundColor: alcanza ? "#2d2d52" : "#3a3a46",
					color: alcanza ? "#ffffff" : "#8a8a96",
					padding: { x: 6, y: 4 },
					fixedWidth: 440,
				},
			);
			if (!alcanza) return;
			const comprar = (): void => this.comprar(a.id);
			fila.setInteractive({ useHandCursor: true }).on("pointerdown", comprar);
			this.teclas.set(String(i + 1), comprar);
		});
		const salir = (): void => {
			this.scene.start("Mapa", { estado: this.estado });
		};
		this.texto(236, t("tienda.salir"), { color: "#9ad1ff" })
			.setInteractive({ useHandCursor: true })
			.on("pointerdown", salir);
		this.teclas.set("Enter", salir);
		this.teclas.set("Escape", salir);
	}

	/** Compra con el precio BASE del catálogo: `comprar` ya aplica el recargo del piso. */
	private comprar(id: string): void {
		const base = this.catalogo.find((a) => a.id === id);
		if (base === undefined) return;
		this.estado = comprarArticulo(this.estado, base);
		this.dibujar();
	}

	/** Solo con `?test=1`: mismos caminos que la interfaz. */
	private exponerGancho(): void {
		if (new URLSearchParams(location.search).get("test") !== "1") return;
		const g = window as unknown as { __santuario?: Record<string, unknown> };
		g.__santuario ??= {};
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			delete g.__santuario?.tienda;
		});
		g.__santuario.tienda = {
			estado: () => ({
				dinero: this.estado.dinero,
				mochila: { ...this.estado.mochila },
				oferta: this.oferta.map((a) => ({ id: a.id, precio: a.precio })),
				comprables: [...this.teclas.keys()].filter((k) => /^\d$/.test(k)),
			}),
			comprar: (i: number) => this.teclas.get(String(i + 1))?.(),
			salir: () => this.teclas.get("Enter")?.(),
		};
	}
}
