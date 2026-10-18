import {
	capturar,
	type EstadoExpedicion,
	equipoLleno,
	sustituirMiembro,
} from "@santuario/core";
import Phaser from "phaser";
import { cargarDatosCombate } from "../combate/datosPack.js";
import { t } from "../i18n/index.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";

export interface DatosCaptura {
	estado: EstadoExpedicion;
	especie: string;
	psPct: number;
}

/** Tras capturar: el Pokémon se une al equipo o, si está lleno, se elige a quién soltar. */
export class Captura extends Phaser.Scene {
	private estado!: EstadoExpedicion;
	private especie = "";
	private psPct = 100;
	private teclas = new Map<string, () => void>();

	constructor() {
		super("Captura");
	}

	init(datos: DatosCaptura): void {
		this.estado = datos.estado;
		this.especie = datos.especie;
		this.psPct = datos.psPct;
		this.teclas = new Map();
	}

	create(): void {
		const nombres = cargarDatosCombate().nombres;
		const nuevo = nombres.especie(this.especie);
		const texto = (y: number, s: string, extra = {}) =>
			this.add.text(20, y, s, {
				fontFamily: FUENTE,
				fontSize: "11px",
				color: "#ffffff",
				...extra,
			});
		const fila = (y: number, s: string, accion: () => void, tecla: string) => {
			texto(y, s, {
				backgroundColor: "#2d2d52",
				padding: { x: 6, y: 4 },
				fixedWidth: 440,
			})
				.setInteractive({ useHandCursor: true })
				.on("pointerdown", accion);
			this.teclas.set(tecla, accion);
		};
		const salir = (): void => {
			this.scene.start("Mapa", { estado: this.estado });
		};
		alPulsarTecla(this, (ev) => this.teclas.get(ev.key)?.());

		if (!equipoLleno(this.estado)) {
			this.estado = capturar(this.estado, this.especie, this.psPct);
			texto(20, t("captura.seUne", { especie: nuevo }), {
				fontSize: "16px",
				color: "#7dff9a",
			});
			fila(220, t("combate.continuar"), salir, "Enter");
		} else {
			texto(20, t("captura.lleno", { especie: nuevo }), { color: "#ffd866" });
			this.estado.equipo.forEach((m, i) => {
				fila(
					50 + i * 28,
					t("captura.soltar", {
						n: i + 1,
						especie: nombres.especie(m.especie),
						ps: m.psPct,
					}),
					() => {
						this.estado = sustituirMiembro(
							this.estado,
							i,
							this.especie,
							this.psPct,
						);
						salir();
					},
					String(i + 1),
				);
			});
			fila(230, t("captura.dejar", { especie: nuevo }), salir, "Escape");
		}
		this.exponerGancho();
	}

	/** Solo con `?test=1`: mismos caminos que la interfaz. */
	private exponerGancho(): void {
		if (new URLSearchParams(location.search).get("test") !== "1") return;
		const g = window as unknown as { __santuario?: Record<string, unknown> };
		g.__santuario ??= {};
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			delete g.__santuario?.captura;
		});
		g.__santuario.captura = {
			estado: () => ({
				especie: this.especie,
				equipo: this.estado.equipo.map((m) => m.especie),
			}),
			pulsar: (tecla: string) => this.teclas.get(tecla)?.(),
		};
	}
}
