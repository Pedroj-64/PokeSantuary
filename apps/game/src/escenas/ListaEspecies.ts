import especiesCrudo from "@packs/kanto/especies.json?raw";
import { EspecieSchema } from "@santuario/data";
import Phaser from "phaser";
import { z } from "zod";
import {
	alCambiarIdioma,
	cambiarIdioma,
	type Idioma,
	idiomaActual,
	t,
} from "../i18n/index.js";

type Especie = z.infer<typeof EspecieSchema>;

// Pendiente: fuente pixel propia en la Fase 5 (hoy monoespaciada del sistema).
const FUENTE = "monospace";

/** Datos validados al cargar; si fallan, se muestra el error en pantalla. */
function cargarEspecies(): { especies: Especie[] } | { error: string } {
	try {
		const r = z.array(EspecieSchema).safeParse(JSON.parse(especiesCrudo));
		return r.success ? { especies: r.data } : { error: r.error.message };
	} catch (e) {
		return { error: String(e) };
	}
}

export class ListaEspecies extends Phaser.Scene {
	private dibujados: Phaser.GameObjects.GameObject[] = [];
	private nombres: string[] = [];

	constructor() {
		super("ListaEspecies");
	}

	create(): void {
		const datos = cargarEspecies();
		const dibujar = () => this.dibujar(datos);
		dibujar();

		const quitar = alCambiarIdioma(dibujar);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, quitar);
		this.input.keyboard?.on("keydown-L", alternarIdioma);

		if (new URLSearchParams(location.search).get("test") === "1") {
			(window as unknown as { __santuario: unknown }).__santuario = {
				idioma: () => idiomaActual(),
				especies: () => [...this.nombres],
			};
		}
		this.game.canvas.parentElement?.setAttribute("data-estado", "listo");
	}

	private dibujar(datos: ReturnType<typeof cargarEspecies>): void {
		for (const o of this.dibujados) o.destroy();
		this.dibujados = [];
		this.nombres = [];
		const idioma = idiomaActual();
		const texto = (
			x: number,
			y: number,
			s: string,
			tam: number,
			color = "#ffffff",
		) =>
			this.dibujados.push(
				this.add.text(x, y, s, {
					fontFamily: FUENTE,
					fontSize: `${tam}px`,
					color,
				}),
			);

		texto(12, 8, t("titulo"), 16, "#ffd866");

		if ("error" in datos) {
			texto(
				12,
				40,
				`${t("errorDatos")}:\n${datos.error.slice(0, 400)}`,
				8,
				"#ff6b6b",
			);
			return;
		}

		texto(
			12,
			30,
			`${t("subtitulo")} - ${t("cantidadEspecies").replace("{n}", String(datos.especies.length))}`,
			10,
			"#9ad1ff",
		);
		datos.especies.forEach((e, i) => {
			const nombre = e.nombre[idioma];
			this.nombres.push(nombre);
			const dex = String(e.dex).padStart(3, "0");
			texto(
				12,
				52 + i * 18,
				`${dex}  ${nombre.padEnd(12)} ${e.tipos.join("/")}`,
				11,
			);
		});

		const boton = this.add
			.text(468, 8, t("botonIdioma"), {
				fontFamily: FUENTE,
				fontSize: "10px",
				color: "#1b1b2f",
				backgroundColor: "#ffd866",
				padding: { x: 4, y: 3 },
			})
			.setOrigin(1, 0)
			.setInteractive({ useHandCursor: true });
		boton.on("pointerdown", alternarIdioma);
		this.dibujados.push(boton);
	}
}

function alternarIdioma(): void {
	const siguiente: Idioma = idiomaActual() === "es" ? "en" : "es";
	cambiarIdioma(siguiente);
}
