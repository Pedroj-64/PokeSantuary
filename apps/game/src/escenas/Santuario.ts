import Phaser from "phaser";
import { t } from "../i18n/index.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";
const CLAVE_MUNDO = "SantuarioMundo";

/**
 * Entrada al Santuario. La escena de verdad (con el núcleo de gestión, los datos del
 * pack y el guardado) se carga bajo demanda para no engordar la carga inicial; aquí solo
 * se espera a que llegue y se salta a ella. Volver al Santuario reutiliza la ya cargada.
 */
export class Santuario extends Phaser.Scene {
	private generacion = 0;

	constructor() {
		super("Santuario");
	}

	create(): void {
		const gen = ++this.generacion;
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			++this.generacion;
		});
		const mensaje = this.add
			.text(240, 135, t("santuario.cargando"), {
				fontFamily: FUENTE,
				fontSize: "10px",
				color: "#9ad1ff",
			})
			.setOrigin(0.5);
		alPulsarTecla(this, (ev) => {
			if (ev.key === "Escape") this.scene.start("ListaEspecies");
		});
		void this.cargar(gen, mensaje);
	}

	private async cargar(
		gen: number,
		mensaje: Phaser.GameObjects.Text,
	): Promise<void> {
		try {
			if (!this.scene.manager.keys[CLAVE_MUNDO]) {
				const { SantuarioMundo } = await import("./SantuarioMundo.js");
				if (!this.scene.manager.keys[CLAVE_MUNDO])
					this.scene.manager.add(CLAVE_MUNDO, SantuarioMundo);
			}
			// Si el jugador salió con Esc mientras cargaba, no se salta.
			if (gen === this.generacion) this.scene.start(CLAVE_MUNDO);
		} catch (e) {
			if (gen !== this.generacion) return;
			mensaje.setText(
				`${t("santuario.error.titulo")}\n${e instanceof Error ? e.message : String(e)}\n${t("santuario.error.volver")}`,
			);
		}
	}
}
