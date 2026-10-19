import type Phaser from "phaser";

const FUENTE = "monospace";
const PROFUNDIDAD = 100002;
const MAX_VISIBLES = 10;

export interface ItemMenu {
	texto: string;
	/** Un item inactivo se ve atenuado y al elegirlo se avisa en lugar de actuar. */
	activo?: boolean;
	alElegir: () => void;
}

/**
 * Menú de lista vertical para la interfaz del Santuario: flechas o W/S para moverse,
 * Enter para elegir y Esc para ir atrás. Se queda fijo en pantalla (no se mueve con la cámara).
 */
export class PanelMenu {
	private contenedor?: Phaser.GameObjects.Container;
	private items: ItemMenu[] = [];
	private indice = 0;
	private filas: Phaser.GameObjects.Text[] = [];
	private titulo = "";
	private pie = "";
	private alCancelar: () => void = () => {};
	private alInactivo: (item: ItemMenu) => void = () => {};

	constructor(private readonly escena: Phaser.Scene) {}

	get abierto(): boolean {
		return this.contenedor !== undefined;
	}

	/** Lo que se hace al elegir un item inactivo (la escena muestra un aviso). */
	alElegirInactivo(f: (item: ItemMenu) => void): void {
		this.alInactivo = f;
	}

	/** Muestra (o sustituye) el menú. `alCancelar` se llama con Esc. */
	mostrar(
		titulo: string,
		items: ItemMenu[],
		pie: string,
		alCancelar: () => void,
		indiceInicial = 0,
	): void {
		this.titulo = titulo;
		this.items = items;
		this.pie = pie;
		this.alCancelar = alCancelar;
		this.indice = Math.max(0, Math.min(indiceInicial, items.length - 1));
		this.dibujar();
	}

	cerrar(): void {
		this.contenedor?.destroy();
		this.contenedor = undefined;
		this.filas = [];
		this.items = [];
	}

	/** Procesa una tecla; devuelve `true` si el menú la consumió. */
	tecla(tecla: string): boolean {
		if (!this.abierto) return false;
		const k = tecla.toLowerCase();
		if (k === "arrowup" || k === "w") this.mover(-1);
		else if (k === "arrowdown" || k === "s") this.mover(1);
		else if (k === "enter" || k === " ") this.elegir();
		else if (k === "escape") this.alCancelar();
		return true;
	}

	private mover(delta: number): void {
		if (this.items.length === 0) return;
		this.indice = (this.indice + delta + this.items.length) % this.items.length;
		this.pintarFilas();
	}

	private elegir(): void {
		const item = this.items[this.indice];
		if (!item) return;
		if (item.activo === false) this.alInactivo(item);
		else item.alElegir();
	}

	private dibujar(): void {
		this.contenedor?.destroy();
		const visibles = Math.min(this.items.length, MAX_VISIBLES);
		const alto = 52 + Math.max(1, visibles) * 13;
		const y0 = Math.max(24, Math.floor(135 - alto / 2));
		const fondo = this.escena.add
			.rectangle(240, y0, 400, alto, 0x12122b, 0.96)
			.setOrigin(0.5, 0)
			.setStrokeStyle(1, 0xffd866);
		const titulo = this.escena.add
			.text(240, y0 + 7, this.titulo, {
				fontFamily: FUENTE,
				fontSize: "11px",
				color: "#ffd866",
			})
			.setOrigin(0.5, 0);
		const pie = this.escena.add
			.text(240, y0 + alto - 5, this.pie, {
				fontFamily: FUENTE,
				fontSize: "9px",
				color: "#9ad1ff",
			})
			.setOrigin(0.5, 1);
		this.filas = [];
		for (let i = 0; i < visibles; i++) {
			this.filas.push(
				this.escena.add.text(52, y0 + 26 + i * 13, "", {
					fontFamily: FUENTE,
					fontSize: "10px",
					color: "#ffffff",
				}),
			);
		}
		this.contenedor = this.escena.add
			.container(0, 0, [fondo, titulo, pie, ...this.filas])
			.setScrollFactor(0)
			.setDepth(PROFUNDIDAD);
		this.pintarFilas();
	}

	/** Ventana de MAX_VISIBLES filas que sigue a la selección. */
	private pintarFilas(): void {
		const n = this.filas.length;
		if (n === 0) return;
		const desde = Math.max(
			0,
			Math.min(this.indice - Math.floor(n / 2), this.items.length - n),
		);
		for (let i = 0; i < n; i++) {
			const item = this.items[desde + i];
			const fila = this.filas[i];
			if (!fila || !item) continue;
			const elegido = desde + i === this.indice;
			fila.setText(`${elegido ? "> " : "  "}${item.texto}`);
			fila.setColor(
				item.activo === false ? "#6b7190" : elegido ? "#ffd866" : "#ffffff",
			);
		}
	}
}
