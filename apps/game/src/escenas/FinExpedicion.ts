import { type EstadoExpedicion, liquidar } from "@santuario/core";
import Phaser from "phaser";
import { cargarDatosCombate } from "../combate/datosPack.js";
import { t } from "../i18n/index.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";

export interface DatosFin {
	estado: EstadoExpedicion;
}

/** Pantalla final de una expedición terminada: resultado, equipo y dinero conservado. */
export class FinExpedicion extends Phaser.Scene {
	private estado!: EstadoExpedicion;

	constructor() {
		super("FinExpedicion");
	}

	init(datos: DatosFin): void {
		this.estado = datos.estado;
	}

	create(): void {
		const e = this.estado;
		const victoria = e.estado === "victoria";
		const { dineroConservado } = liquidar(e);
		const nombres = cargarDatosCombate().nombres;
		const centro = { fontFamily: FUENTE, color: "#ffffff" };

		this.add
			.text(240, 50, t(victoria ? "fin.victoria" : "fin.derrota"), {
				...centro,
				fontSize: "22px",
				color: victoria ? "#7dff9a" : "#ff8b8b",
			})
			.setOrigin(0.5, 0);
		this.add
			.text(240, 100, t("fin.dinero", { n: dineroConservado }), {
				...centro,
				fontSize: "12px",
				color: "#ffd866",
			})
			.setOrigin(0.5, 0);
		if (e.pendientesPurificar.length > 0) {
			this.add
				.text(
					240,
					116,
					t("fin.sombrios", { n: e.pendientesPurificar.length }),
					{
						...centro,
						fontSize: "10px",
						color: "#c9a0ff",
					},
				)
				.setOrigin(0.5, 0);
		}
		e.equipo.forEach((m, i) => {
			this.add
				.text(
					240,
					134 + i * 16,
					`${nombres.especie(m.especie)}  ${m.psPct === 0 ? t("fin.debilitado") : `${m.psPct}%`}`,
					{
						...centro,
						fontSize: "11px",
						color: m.psPct === 0 ? "#ff8b8b" : "#9ad1ff",
					},
				)
				.setOrigin(0.5, 0);
		});
		let volviendo = false;
		/** Si la expedición salió del Santuario, se liquida allí y se vuelve; si no, a la lista de especies. */
		const volver = async (): Promise<void> => {
			if (volviendo) return;
			volviendo = true;
			const enlace = await import("../santuario/enlace.js");
			if (enlace.esDeSantuario()) {
				enlace.volverAlSantuario(e);
				this.scene.start("Santuario");
			} else this.scene.start("ListaEspecies");
		};
		this.add
			.text(240, 232, t("fin.volver"), {
				...centro,
				fontSize: "11px",
				color: "#1b1b2f",
				backgroundColor: "#9ad1ff",
				padding: { x: 6, y: 4 },
			})
			.setOrigin(0.5, 0)
			.setInteractive({ useHandCursor: true })
			.on("pointerdown", () => void volver());
		alPulsarTecla(this, (ev) => {
			if (ev.key === "Enter" || ev.key === "Escape") void volver();
		});

		if (new URLSearchParams(location.search).get("test") === "1") {
			const g = window as unknown as { __santuario?: Record<string, unknown> };
			g.__santuario ??= {};
			g.__santuario.fin = {
				estado: () => ({ resultado: e.estado, dineroConservado }),
			};
		}
	}
}
