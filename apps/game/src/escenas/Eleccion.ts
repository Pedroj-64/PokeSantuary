import {
	aplicarEfecto,
	crearRng,
	type EstadoExpedicion,
	elegirEvento,
	type IdRuna,
	sustituirRuna,
} from "@santuario/core";
import type { Efecto, Evento } from "@santuario/data";
import Phaser from "phaser";
import { efecto } from "../audio/gestor.js";
import { SFX } from "../audio/sonidos.js";
import { cargarEventos } from "../expedicion/eventosPack.js";
import { t } from "../i18n/index.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";

export interface DatosEleccion {
	estado: EstadoExpedicion;
	nodoId: string;
}

type Fase = "opciones" | "sustituir" | "resultado";

/** Manantial, cofre y eventos: se elige una opción y se aplican sus efectos. */
export class Eleccion extends Phaser.Scene {
	private estado!: EstadoExpedicion;
	private nodoId!: string;
	private evento!: Evento;
	private fase: Fase = "opciones";
	/** Acciones de la pantalla actual, por tecla ("1", "2", "3", "Escape"…). */
	private teclas = new Map<string, () => void>();
	private vista: Phaser.GameObjects.GameObject[] = [];

	constructor() {
		super("Eleccion");
	}

	init(datos: DatosEleccion): void {
		this.estado = datos.estado;
		this.nodoId = datos.nodoId;
		this.fase = "opciones";
	}

	create(): void {
		const nodo = this.estado.mapa.capas
			.flat()
			.find((n) => n.id === this.nodoId);
		if (
			nodo?.tipo !== "manantial" &&
			nodo?.tipo !== "cofre" &&
			nodo?.tipo !== "evento"
		) {
			throw new RangeError(`el nodo ${this.nodoId} no es de elección`);
		}
		this.evento = elegirEvento(
			cargarEventos(),
			this.estado.semilla,
			this.estado.piso,
			this.nodoId,
			nodo.tipo,
		);
		alPulsarTecla(this, (ev) => this.teclas.get(ev.key)?.());
		this.mostrarOpciones();
		this.exponerGancho();
	}

	/** Borra la pantalla anterior y sus atajos. */
	private limpiar(): void {
		for (const o of this.vista) o.destroy();
		this.vista = [];
		this.teclas.clear();
	}

	private texto(
		x: number,
		y: number,
		contenido: string,
		extra: Phaser.Types.GameObjects.Text.TextStyle = {},
	): Phaser.GameObjects.Text {
		const obj = this.add.text(x, y, contenido, {
			fontFamily: FUENTE,
			fontSize: "11px",
			color: "#ffffff",
			wordWrap: { width: 440 },
			...extra,
		});
		this.vista.push(obj);
		return obj;
	}

	private boton(
		y: number,
		etiqueta: string,
		accion: () => void,
	): Phaser.GameObjects.Text {
		const b = this.texto(20, y, etiqueta, {
			backgroundColor: "#2d2d52",
			padding: { x: 6, y: 4 },
			fixedWidth: 440,
		});
		b.setInteractive({ useHandCursor: true })
			.on("pointerover", () => b.setBackgroundColor("#44447a"))
			.on("pointerout", () => b.setBackgroundColor("#2d2d52"))
			.on("pointerdown", accion);
		return b;
	}

	private mostrarOpciones(): void {
		this.limpiar();
		this.fase = "opciones";
		this.texto(20, 20, t(this.evento.titulo), {
			fontSize: "16px",
			color: "#ffd866",
		});
		this.texto(20, 56, t(this.evento.texto), { color: "#9ad1ff" });
		this.evento.opciones.forEach((op, i) => {
			const elegir = (): void => this.resolver(i);
			this.boton(120 + i * 36, `[${i + 1}] ${t(op.texto)}`, elegir);
			this.teclas.set(String(i + 1), elegir);
		});
	}

	/** Aplica los efectos de la opción en orden; si no caben runas, pregunta cuál sustituir. */
	private resolver(indice: number): void {
		void efecto(this.evento.nodo === "cofre" ? SFX.cofreAbrir : SFX.aceptar);
		const antes = this.estado;
		const efectos = this.evento.opciones[indice]?.efectos ?? [];
		const rng = crearRng(
			`${antes.semilla}:p${antes.piso}:${this.nodoId}:efecto:${indice}`,
		);
		const seguir = (desde: number, estado: EstadoExpedicion): void => {
			for (let i = desde; i < efectos.length; i++) {
				const r = aplicarEfecto(estado, efectos[i] as Efecto, rng);
				estado = r.estado;
				if (r.ofreceSustituir !== undefined) {
					this.estado = estado;
					this.preguntarSustitucion(r.ofreceSustituir, () =>
						seguir(i + 1, this.estado),
					);
					return;
				}
			}
			this.estado = estado;
			this.mostrarResultado(antes);
		};
		seguir(0, antes);
	}

	private preguntarSustitucion(nueva: IdRuna, continuar: () => void): void {
		this.limpiar();
		this.fase = "sustituir";
		this.texto(20, 20, t("eleccion.runaLlena", { runa: t(`runa.${nueva}`) }), {
			color: "#ffd866",
		});
		this.estado.runas.forEach((r, i) => {
			const cambiar = (): void => {
				this.estado = sustituirRuna(this.estado, r, nueva);
				continuar();
			};
			this.boton(70 + i * 32, `[${i + 1}] ${t(`runa.${r}`)}`, cambiar);
			this.teclas.set(String(i + 1), cambiar);
		});
		this.teclas.set("Escape", continuar);
		this.texto(20, 240, t("eleccion.conservar"), { color: "#9ad1ff" });
	}

	private mostrarResultado(antes: EstadoExpedicion): void {
		this.limpiar();
		this.fase = "resultado";
		const despues = this.estado;
		const lineas: string[] = [];
		const dDinero = despues.dinero - antes.dinero;
		if (dDinero !== 0) lineas.push(t("eleccion.dinero", { n: dDinero }));
		if (despues.equipo.some((m, i) => m.psPct !== antes.equipo[i]?.psPct))
			lineas.push(t("eleccion.ps"));
		for (const r of despues.runas)
			if (!antes.runas.includes(r)) {
				lineas.push(t("eleccion.runaNueva", { runa: t(`runa.${r}`) }));
				void efecto(SFX.runaObtenida);
			}
		if (lineas.length === 0) lineas.push(t("eleccion.nada"));
		this.texto(20, 20, t(this.evento.titulo), {
			fontSize: "16px",
			color: "#ffd866",
		});
		this.texto(20, 70, lineas.join("\n"), { color: "#7dff9a" });
		const salir = (): void => {
			this.scene.start("Mapa", { estado: this.estado });
		};
		this.boton(220, t("combate.continuar"), salir);
		this.teclas.set("Enter", salir);
	}

	/** Solo con `?test=1`: mismos caminos que la interfaz. */
	private exponerGancho(): void {
		if (new URLSearchParams(location.search).get("test") !== "1") return;
		const g = window as unknown as { __santuario?: Record<string, unknown> };
		g.__santuario ??= {};
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			delete g.__santuario?.eleccion;
		});
		g.__santuario.eleccion = {
			estado: () => ({
				fase: this.fase,
				evento: this.evento.id,
				opciones: this.evento.opciones.length,
				dinero: this.estado.dinero,
				equipo: this.estado.equipo.map((m) => m.psPct),
				runas: [...this.estado.runas],
			}),
			elegir: (i: number) => this.teclas.get(String(i + 1))?.(),
			continuar: () => this.teclas.get("Enter")?.(),
		};
	}
}
