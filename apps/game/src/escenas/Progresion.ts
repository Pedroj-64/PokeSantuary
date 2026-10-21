import {
	type EstadoExpedicion,
	type EventoProgresion,
	elegirOlvido,
} from "@santuario/core";
import Phaser from "phaser";
import { cargarDatosCombate } from "../combate/datosPack.js";
import { t } from "../i18n/index.js";
import { type ItemMenu, PanelMenu } from "../santuario/panelMenu.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";

export interface DatosProgresion {
	estado: EstadoExpedicion;
	eventos: EventoProgresion[];
	/** Escena a la que se pasa al terminar, con sus datos. */
	siguiente: { escena: string; datos: object };
}

/**
 * Tras ganar un combate: cuenta lo que pasó (subidas de nivel, movimientos nuevos)
 * y pregunta qué movimiento olvidar cuando un miembro ya sabe cuatro.
 * Las evoluciones se anuncian en cuanto el pack tenga las especies evolucionadas.
 */
export class Progresion extends Phaser.Scene {
	private estado!: EstadoExpedicion;
	private eventos: EventoProgresion[] = [];
	private siguiente!: DatosProgresion["siguiente"];
	private menu!: PanelMenu;
	private cerrada = false;

	constructor() {
		super("Progresion");
	}

	init(datos: DatosProgresion): void {
		this.estado = datos.estado;
		this.eventos = datos.eventos;
		this.siguiente = datos.siguiente;
		this.cerrada = false;
	}

	create(): void {
		this.menu = new PanelMenu(this);
		const nombres = cargarDatosCombate().nombres;
		const lineas = this.eventos.flatMap((e) => {
			const especie = nombres.especie(e.especie);
			if (e.tipo === "subeNivel")
				return [t("progresion.sube", { especie, n: e.a })];
			if (e.tipo === "aprende")
				return [
					t("progresion.aprende", {
						especie,
						movimiento: nombres.movimiento(e.movimiento),
					}),
				];
			return [];
		});
		this.add.text(20, 14, t("progresion.titulo"), {
			fontFamily: FUENTE,
			fontSize: "14px",
			color: "#ffd866",
		});
		this.add.text(20, 40, lineas.slice(0, 14).join("\n"), {
			fontFamily: FUENTE,
			fontSize: "10px",
			color: "#ffffff",
			lineSpacing: 3,
		});
		this.add
			.text(240, 258, t("combate.continuar"), {
				fontFamily: FUENTE,
				fontSize: "11px",
				color: "#9ad1ff",
			})
			.setOrigin(0.5, 1)
			.setInteractive({ useHandCursor: true })
			.on("pointerdown", () => this.pendientes());
		alPulsarTecla(this, (ev) => {
			if (this.menu.abierto) this.menu.tecla(ev.key);
			else if (ev.key === "Enter") this.pendientes();
		});
	}

	/** Pregunta el siguiente movimiento pendiente, o sigue su camino si no queda ninguno. */
	private pendientes(): void {
		if (this.cerrada) return;
		const nombres = cargarDatosCombate().nombres;
		const indice = this.estado.equipo.findIndex(
			(m) => (m.pendientesMovimiento ?? []).length > 0,
		);
		const miembro = this.estado.equipo[indice];
		const nuevo = miembro?.pendientesMovimiento?.[0];
		if (miembro === undefined || nuevo === undefined) {
			this.cerrada = true;
			this.scene.start(this.siguiente.escena, this.siguiente.datos);
			return;
		}
		const resolver = (olvidar?: string): void => {
			this.estado = elegirOlvido(this.estado, indice, nuevo, olvidar);
			this.menu.cerrar();
			this.pendientes();
		};
		const items: ItemMenu[] = (miembro.movimientos ?? []).map((m) => ({
			texto: t("progresion.olvidar", { movimiento: nombres.movimiento(m) }),
			alElegir: () => resolver(m),
		}));
		items.push({
			texto: t("progresion.noAprender", {
				movimiento: nombres.movimiento(nuevo),
			}),
			alElegir: () => resolver(undefined),
		});
		this.menu.mostrar(
			t("progresion.pregunta", {
				especie: nombres.especie(miembro.especie),
				movimiento: nombres.movimiento(nuevo),
			}),
			items,
			t("progresion.pie"),
			() => resolver(undefined),
		);
	}
}
