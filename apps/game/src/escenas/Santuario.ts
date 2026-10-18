import { expedicionInicial } from "@santuario/battle";
import Phaser from "phaser";
import losetasPng from "../assets/santuario/losetas.png?url";
import protagonistaPng from "../assets/santuario/protagonista.png?url";
import { musica } from "../audio/gestor.js";
import { MUSICA } from "../audio/sonidos.js";
import { cargarDatosCombate } from "../combate/datosPack.js";
import { cargarBalance } from "../expedicion/balancePack.js";
import { t } from "../i18n/index.js";
import {
	bloqueado,
	crearMundo,
	edificioCercano,
	LADO,
	type Mundo,
} from "../santuario/mundoProvisional.js";
import { obtenerSemilla } from "../semilla.js";
import { alPulsarTecla } from "../teclado.js";

const FUENTE = "monospace";
const VELOCIDAD = 70; // píxeles por segundo
const CAJA = { ancho: 10, alto: 6 }; // pies del protagonista, para las colisiones
const ALCANCE_ARBOL = 34; // distancia al centro del Árbol Cenit para interactuar
const MS_POR_PASO = 140;

const EDIFICIOS = [
	"arbol-cenit",
	"lecho-hojas",
	"huerto-bayas",
	"aserradero",
	"cantera",
	"almacen",
] as const;
const URL_EDIFICIOS = import.meta.glob("../assets/santuario/*.png", {
	query: "?url",
	import: "default",
	eager: true,
}) as Record<string, string>;
const urlEdificio = (id: string): string =>
	URL_EDIFICIOS[`../assets/santuario/${id}.png`] as string;

type Direccion = "abajo" | "arriba" | "lado";
const FILA: Record<Direccion, number> = { abajo: 0, arriba: 1, lado: 2 };

/** Prototipo caminable del Santuario: isla provisional, protagonista y el Árbol Cenit como puerta a la Fisura. */
export class Santuario extends Phaser.Scene {
	private mundo!: Mundo;
	private jugador!: Phaser.GameObjects.Sprite;
	private teclas!: {
		arriba: Phaser.Input.Keyboard.Key;
		abajo: Phaser.Input.Keyboard.Key;
		izq: Phaser.Input.Keyboard.Key;
		der: Phaser.Input.Keyboard.Key;
		w: Phaser.Input.Keyboard.Key;
		a: Phaser.Input.Keyboard.Key;
		s: Phaser.Input.Keyboard.Key;
		d: Phaser.Input.Keyboard.Key;
	};
	private direccion: Direccion = "abajo";
	private tPaso = 0;
	private aviso!: Phaser.GameObjects.Text;
	private cerca = false;

	constructor() {
		super("Santuario");
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
		for (const id of EDIFICIOS)
			if (!this.textures.exists(id)) this.load.image(id, urlEdificio(id));
	}

	create(): void {
		this.mundo = crearMundo(obtenerSemilla());
		const m = this.mundo;
		this.cameras.main.setBackgroundColor(0x12122b);
		this.cameras.main.setBounds(0, 0, m.ancho * LADO, m.alto * LADO);

		for (let y = 0; y < m.alto; y++)
			for (let x = 0; x < m.ancho; x++) {
				const i = y * m.ancho + x;
				this.add
					.image(
						x * LADO,
						y * LADO,
						"losetas",
						(m.losetas[i] as number) * 4 + (m.variantes[i] as number),
					)
					.setOrigin(0, 0)
					.setDepth(0);
			}
		for (const e of m.edificios)
			this.add
				.image(e.x * LADO, e.y * LADO, e.tipo)
				.setOrigin(0, 0)
				.setDepth((e.y + e.alto) * LADO);

		this.jugador = this.add
			.sprite(m.inicio.x, m.inicio.y, "protagonista", 0)
			.setOrigin(0.5, 1);
		this.cameras.main.startFollow(this.jugador, true, 0.15, 0.15);
		this.cameras.main.setZoom(1);

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

		this.add
			.text(8, 6, t("santuario.titulo"), {
				fontFamily: FUENTE,
				fontSize: "10px",
				color: "#ffd866",
			})
			.setScrollFactor(0)
			.setDepth(100000);
		this.aviso = this.add
			.text(240, 258, "", {
				fontFamily: FUENTE,
				fontSize: "10px",
				color: "#1b1b2f",
				backgroundColor: "#7dff9a",
				padding: { x: 4, y: 3 },
			})
			.setOrigin(0.5, 1)
			.setScrollFactor(0)
			.setDepth(100000)
			.setVisible(false);

		alPulsarTecla(this, (ev) => {
			const tecla = ev.key.toLowerCase();
			if (tecla === "e" && this.cerca) this.salirALaFisura();
			else if (tecla === "escape") this.scene.start("ListaEspecies");
		});
		void musica(MUSICA.mapa);
		this.exponerGancho();
	}

	update(_: number, dt: number): void {
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

		const arbol = edificioCercano(
			this.mundo,
			"arbol-cenit",
			this.jugador.x,
			this.jugador.y,
		);
		const cerca =
			arbol !== undefined &&
			arbol.distancia <= ALCANCE_ARBOL + (arbol.edificio.ancho * LADO) / 2;
		if (cerca !== this.cerca) {
			this.cerca = cerca;
			this.aviso.setText(t("santuario.salir")).setVisible(cerca);
		}
	}

	/** Mueve al protagonista en un eje si la caja de los pies no choca con nada. */
	private mover(dx: number, dy: number): void {
		const nx = this.jugador.x + dx;
		const ny = this.jugador.y + dy;
		if (
			!bloqueado(
				this.mundo,
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

	private salirALaFisura(): void {
		const { sets } = cargarDatosCombate();
		this.scene.start("Mapa", {
			estado: expedicionInicial(obtenerSemilla(), sets, cargarBalance()),
		});
	}

	/** Solo con `?test=1`: mismos caminos que la interfaz. */
	private exponerGancho(): void {
		if (new URLSearchParams(location.search).get("test") !== "1") return;
		const g = window as unknown as { __santuario?: Record<string, unknown> };
		g.__santuario ??= {};
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			delete g.__santuario?.santuario;
		});
		g.__santuario.santuario = {
			estado: () => ({
				x: Math.round(this.jugador.x),
				y: Math.round(this.jugador.y),
				direccion: this.direccion,
				cercaDelArbol: this.cerca,
			}),
			/** Coloca al protagonista (en píxeles) si el sitio es transitable. */
			colocar: (x: number, y: number) => {
				if (
					bloqueado(
						this.mundo,
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
				const a = this.mundo.edificios.find((e) => e.tipo === "arbol-cenit");
				return a
					? { x: (a.x + a.ancho / 2) * LADO, y: (a.y + a.alto) * LADO + 8 }
					: null;
			},
		};
	}
}
