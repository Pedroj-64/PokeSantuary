import {
	type AccionPartida,
	costeDeSubir,
	type EstadoPartida,
	type IdCeremonia,
	motivoNoPuede,
	motivoNoPuedeSubir,
	nivelDeEdificio,
	nivelesPendientes,
	type SantuarioBalance,
} from "@santuario/core";
import type Phaser from "phaser";
import { t } from "../i18n/index.js";
import { LADO } from "./colisiones.js";
import { nombreDeEspecie } from "./nombres.js";
import {
	decoracionesDisponibles,
	kitsDisponibles,
	lechosPosibles,
	mejorasPosibles,
	type Prueba,
	puedeCamino,
	puedeColocar,
	puedeDecorar,
	puedeMarcar,
	residentesConTerreno,
	tareasPosibles,
} from "./opciones.js";
import type { ItemMenu, PanelMenu } from "./panelMenu.js";

const FUENTE = "monospace";
const PROFUNDIDAD_UI = 100000;

/** Texto de un recurso, con las bayas juntas. */
const nombreRecurso = (id: string) => t(`recurso.${id}`);

/** Lo que los menús de gestión necesitan de la escena del Santuario. */
export interface AnfitrionGestion {
	escena: Phaser.Scene;
	partida(): EstadoPartida;
	balance(): SantuarioBalance;
	/** Aplica una acción; si el núcleo la rechaza, avisa y devuelve false. */
	gestionar(accion: AccionPartida): boolean;
	aviso(texto: string): void;
	ayuda(texto: string): void;
	actualizarHud(): void;
	/** Posición del protagonista en píxeles (donde nace el cursor). */
	jugador(): { x: number; y: number };
	/** Antes de abrir un menú o el cursor: oculta el aviso y la pista de «E». */
	alAbrirMenu(): void;
}

/**
 * Menús de gestión del Santuario (residentes, construir, mejorar, terreno) y el modo
 * cursor para elegir una loseta. La escena solo le pasa las teclas y le pregunta si
 * el cursor está activo.
 */
export class MenusGestion {
	private cursor?: {
		x: number;
		y: number;
		titulo: string;
		probar: (x: number, y: number) => Prueba;
		confirmar: (x: number, y: number) => void;
		cancelar: () => void;
		marco: Phaser.GameObjects.Rectangle;
		texto: Phaser.GameObjects.Text;
	};

	constructor(
		private readonly a: AnfitrionGestion,
		private readonly menu: PanelMenu,
	) {}

	/** ¿Está el modo cursor activo? */
	get cursorActivo(): boolean {
		return this.cursor !== undefined;
	}

	private get balance() {
		return this.a.balance();
	}

	abrir(): void {
		const p = this.a.partida();
		const noche = p.santuario.momento === "noche";
		if (
			(p.santuario.momento !== "dia" && !noche) ||
			p.expedicion ||
			(noche && nivelDeEdificio(p.santuario, "altar") === undefined)
		) {
			this.a.aviso(t("gestion.aviso.soloDia"));
			return;
		}
		this.a.alAbrirMenu();
		this.a.ayuda("");
		// De noche solo se puede ir al Altar (la Fogata de Ascuas es nocturna).
		if (noche) this.menuAltar();
		else this.menuPrincipal();
	}

	cerrar(): void {
		this.menu.cerrar();
		this.a.actualizarHud();
	}

	private menuPrincipal(indice = 0): void {
		const items: ItemMenu[] = [
			{
				texto: t("gestion.principal.residentes"),
				alElegir: () => this.menuResidentes(),
			},
			{
				texto: t("gestion.principal.construir"),
				alElegir: () => this.menuConstruir(),
			},
			{
				texto: t("gestion.principal.mejorar"),
				alElegir: () => this.menuMejoras(),
			},
			{
				texto: t("gestion.principal.terreno"),
				alElegir: () => this.menuTerreno(),
			},
			...this.itemsAltarYGimnasio(),
			{
				texto: t("gestion.principal.cerrar"),
				alElegir: () => this.cerrar(),
			},
		];
		this.menu.mostrar(
			t("gestion.titulo"),
			items,
			t("gestion.pie"),
			() => this.cerrar(),
			indice,
		);
	}

	private nombreEdificio = (tipo: string) => t(`edificio.${tipo}`);

	private textoCoste(coste: Record<string, number>): string {
		return Object.entries(coste)
			.map(([r, n]) => `${n} ${nombreRecurso(r)}`)
			.join(", ");
	}

	private textoTarea(uid: string): string {
		const s = this.a.partida().santuario;
		const r = s.residentes.find((x) => x.uid === uid);
		if (!r) return "";
		const tarea = r.tarea;
		const edificio =
			"edificio" in tarea
				? s.edificios.find((e) => e.uid === tarea.edificio)?.tipo
				: undefined;
		return t(`gestion.tareaActual.${tarea.tipo}`, {
			edificio: edificio ? this.nombreEdificio(edificio) : "",
		});
	}

	private menuResidentes(indice = 0): void {
		const items: ItemMenu[] = this.a
			.partida()
			.santuario.residentes.map((r) => ({
				texto: t("gestion.fila", {
					nombre: nombreDeEspecie(r.especie),
					tarea: this.textoTarea(r.uid),
					lecho: t(r.lecho ? "gestion.lecho.con" : "gestion.lecho.sin"),
				}),
				alElegir: () => this.menuResidente(r.uid, indice),
			}));
		this.menu.mostrar(
			t("gestion.principal.residentes"),
			items,
			t("gestion.pie"),
			() => this.menuPrincipal(0),
			indice,
		);
	}

	private menuResidente(uid: string, volverA: number): void {
		const r = this.a.partida().santuario.residentes.find((x) => x.uid === uid);
		if (!r) {
			this.menuResidentes();
			return;
		}
		const items: ItemMenu[] = [
			{
				texto: t("gestion.residente.tarea"),
				alElegir: () => this.menuTareas(uid, volverA),
			},
			{
				texto: t("gestion.residente.lecho"),
				alElegir: () => this.menuLechos(uid, volverA),
			},
			{
				texto: t("gestion.residente.sinLecho"),
				activo: r.lecho !== undefined,
				alElegir: () => {
					if (this.a.gestionar({ tipo: "asignarLecho", uid }))
						this.menuResidente(uid, volverA);
				},
			},
		];
		this.menu.mostrar(
			`${nombreDeEspecie(r.especie)}  ·  ${this.textoTarea(uid)}`,
			items,
			t("gestion.pie"),
			() => this.menuResidentes(volverA),
		);
	}

	private menuTareas(uid: string, volverA: number): void {
		const items: ItemMenu[] = tareasPosibles(
			this.a.partida().santuario,
			uid,
			this.balance,
		).map((o) => ({
			texto: t(o.etiqueta.clave, {
				edificio: this.nombreEdificio(o.etiqueta.params?.edificio ?? ""),
			}),
			alElegir: () => {
				if (this.a.gestionar({ tipo: "asignarTarea", uid, tarea: o.tarea }))
					this.menuResidente(uid, volverA);
			},
		}));
		this.menu.mostrar(
			t("gestion.residente.tarea"),
			items,
			t("gestion.pie"),
			() => this.menuResidente(uid, volverA),
		);
	}

	private menuLechos(uid: string, volverA: number): void {
		const s = this.a.partida().santuario;
		const lechos = lechosPosibles(s, uid, this.balance);
		const items: ItemMenu[] =
			lechos.length === 0
				? [{ texto: t("gestion.vacio"), activo: false, alElegir: () => {} }]
				: lechos.map((edificio, i) => ({
						texto: t("gestion.lecho.opcion", {
							edificio: this.nombreEdificio(
								s.edificios.find((e) => e.uid === edificio)?.tipo ?? "",
							),
							n: i + 1,
						}),
						alElegir: () => {
							if (this.a.gestionar({ tipo: "asignarLecho", uid, edificio }))
								this.menuResidente(uid, volverA);
						},
					}));
		this.menu.mostrar(
			t("gestion.residente.lecho"),
			items,
			t("gestion.pie"),
			() => this.menuResidente(uid, volverA),
		);
	}

	private menuConstruir(indice = 0): void {
		const items: ItemMenu[] = kitsDisponibles(
			this.a.partida().santuario,
			this.balance,
		).map((k) => ({
			texto: `${t("gestion.kit", {
				edificio: this.nombreEdificio(k.tipo),
				coste: this.textoCoste(k.coste),
			})}${k.asequible ? "" : `  [${t("gestion.faltan")}]`}`,
			activo: k.asequible,
			alElegir: () => this.iniciarColocacion(k.tipo),
		}));
		this.menu.mostrar(
			t("gestion.principal.construir"),
			items.length
				? items
				: [{ texto: t("gestion.vacio"), activo: false, alElegir: () => {} }],
			t("gestion.pie"),
			() => this.menuPrincipal(1),
			indice,
		);
	}

	private menuMejoras(indice = 0): void {
		const items: ItemMenu[] = mejorasPosibles(
			this.a.partida().santuario,
			this.balance,
		).map((m) => ({
			texto: `${t("gestion.mejora", {
				edificio: this.nombreEdificio(m.tipo),
				nivel: m.nivel,
				siguiente: m.nivel + 1,
				coste: this.textoCoste(m.coste),
			})}${m.asequible ? "" : `  [${t("gestion.faltan")}]`}`,
			activo: m.asequible,
			alElegir: () => {
				if (this.a.gestionar({ tipo: "mejorarEdificio", uid: m.uid }))
					this.menuMejoras(indice);
			},
		}));
		this.menu.mostrar(
			t("gestion.principal.mejorar"),
			items.length
				? items
				: [{ texto: t("gestion.vacio"), activo: false, alElegir: () => {} }],
			t("gestion.pie"),
			() => this.menuPrincipal(2),
			indice,
		);
	}

	// ------------------------------------------------------------------ cursor

	/** Inicia el modo cursor: una vista previa verde o roja que se mueve por la isla. */
	private iniciarCursor(o: {
		titulo: string;
		ancho?: number;
		alto?: number;
		probar: (x: number, y: number) => Prueba;
		confirmar: (x: number, y: number) => void;
		cancelar: () => void;
	}): void {
		this.menu.cerrar();
		this.a.alAbrirMenu();
		const marco = this.a.escena.add
			.rectangle(
				0,
				0,
				(o.ancho ?? 1) * LADO,
				(o.alto ?? 1) * LADO,
				0x7dff9a,
				0.4,
			)
			.setOrigin(0, 0)
			.setStrokeStyle(1, 0xffffff)
			.setDepth(PROFUNDIDAD_UI - 2);
		const texto = this.a.escena.add
			.text(240, 240, "", {
				fontFamily: FUENTE,
				fontSize: "10px",
				color: "#ffffff",
				backgroundColor: "#12122b",
				padding: { x: 4, y: 3 },
			})
			.setOrigin(0.5, 1)
			.setScrollFactor(0)
			.setDepth(PROFUNDIDAD_UI);
		this.cursor = {
			x: Math.floor(this.a.jugador().x / LADO),
			y: Math.floor((this.a.jugador().y - 4) / LADO),
			titulo: o.titulo,
			probar: o.probar,
			confirmar: o.confirmar,
			cancelar: o.cancelar,
			marco,
			texto,
		};
		this.a.ayuda("");
		this.actualizarCursor();
	}

	private actualizarCursor(): void {
		const c = this.cursor;
		if (!c) return;
		const r = c.probar(c.x, c.y);
		c.marco.setPosition(c.x * LADO, c.y * LADO);
		c.marco.setFillStyle(r.ok ? 0x7dff9a : 0xff8b8b, 0.4);
		c.texto.setText(
			`${c.titulo}\n${r.ok ? t("gestion.colocar.ayuda") : r.motivo}`,
		);
	}

	tecla(k: string): void {
		const c = this.cursor;
		if (!c) return;
		const { ancho, alto } = this.a.partida().santuario.terreno;
		const mover = (dx: number, dy: number) => {
			c.x = Math.max(0, Math.min(ancho - 1, c.x + dx));
			c.y = Math.max(0, Math.min(alto - 1, c.y + dy));
			this.actualizarCursor();
		};
		if (k === "arrowleft" || k === "a") mover(-1, 0);
		else if (k === "arrowright" || k === "d") mover(1, 0);
		else if (k === "arrowup" || k === "w") mover(0, -1);
		else if (k === "arrowdown" || k === "s") mover(0, 1);
		else if (k === "escape") {
			const cancelar = c.cancelar;
			this.terminarCursor();
			cancelar();
		} else if (k === "enter" || k === " ") {
			const r = c.probar(c.x, c.y);
			if (r.ok) c.confirmar(c.x, c.y);
			else this.a.aviso(r.motivo);
		}
	}

	private terminarCursor(): void {
		this.cursor?.marco.destroy();
		this.cursor?.texto.destroy();
		this.cursor = undefined;
	}

	private iniciarColocacion(tipo: string): void {
		const def = this.balance.edificios.find((d) => d.id === tipo);
		this.iniciarCursor({
			titulo: t("gestion.colocar.titulo", {
				edificio: this.nombreEdificio(tipo),
			}),
			ancho: def?.tamano.w,
			alto: def?.tamano.h,
			probar: (x, y) =>
				puedeColocar(this.a.partida().santuario, tipo, x, y, this.balance),
			confirmar: (x, y) => {
				if (!this.a.gestionar({ tipo: "colocarKit", edificio: tipo, x, y }))
					return;
				this.terminarCursor();
				this.menuConstruir();
			},
			cancelar: () => this.menuConstruir(),
		});
	}

	// ----------------------------------------------------------------- terreno

	private nombreAccion = (accion: string) => t(`especialidad.${accion}`);

	private menuTerreno(indice = 0): void {
		const items: ItemMenu[] = [
			{
				texto: t("gestion.terreno.marcar"),
				alElegir: () => this.menuMarcar(),
			},
			{
				texto: t("gestion.terreno.camino"),
				alElegir: () => this.iniciarCamino(),
			},
			{
				texto: t("gestion.terreno.decorar"),
				alElegir: () => this.menuDecorar(),
			},
		];
		this.menu.mostrar(
			t("gestion.principal.terreno"),
			items,
			t("gestion.pie"),
			() => this.menuPrincipal(3),
			indice,
		);
	}

	/** Residentes libres con Especialidad de terreno y los que ya tienen una marca (para quitarla). */
	private menuMarcar(indice = 0): void {
		const s = this.a.partida().santuario;
		const libres = residentesConTerreno(s);
		const conMarca = s.residentes.filter(
			(r) => r.tarea.tipo === "especialidad",
		);
		const nombre = (uid: string) => {
			const r = s.residentes.find((x) => x.uid === uid);
			return r ? nombreDeEspecie(r.especie) : uid;
		};
		const items: ItemMenu[] = [
			...libres.map((l, i) => ({
				texto: `${nombre(l.uid)}  (${l.acciones.map(this.nombreAccion).join(", ")})`,
				alElegir: () => this.menuAccionesDe(l.uid, l.acciones, i),
			})),
			...conMarca.map((r) => ({
				texto: t("gestion.terreno.quitar", { nombre: nombre(r.uid) }),
				alElegir: () => {
					if (this.a.gestionar({ tipo: "desmarcarAccion", uid: r.uid }))
						this.menuMarcar(indice);
				},
			})),
		];
		this.menu.mostrar(
			t("gestion.terreno.marcar"),
			items.length
				? items
				: [{ texto: t("gestion.vacio"), activo: false, alElegir: () => {} }],
			t("gestion.pie"),
			() => this.menuTerreno(0),
			indice,
		);
	}

	private menuAccionesDe(
		uid: string,
		acciones: string[],
		volverA: number,
	): void {
		const items: ItemMenu[] = acciones.map((accion) => ({
			texto: this.nombreAccion(accion),
			alElegir: () => this.iniciarMarca(uid, accion, volverA),
		}));
		this.menu.mostrar(
			t("gestion.terreno.accion"),
			items,
			t("gestion.pie"),
			() => this.menuMarcar(volverA),
		);
	}

	private iniciarMarca(uid: string, accion: string, volverA: number): void {
		const r = this.a.partida().santuario.residentes.find((x) => x.uid === uid);
		const nivel = r?.especialidades[accion] ?? 1;
		const lado = nivel >= 3 ? 3 : nivel === 2 ? 2 : 1;
		this.iniciarCursor({
			titulo: t("gestion.terreno.marcando", {
				accion: this.nombreAccion(accion),
				nombre: r ? nombreDeEspecie(r.especie) : uid,
			}),
			ancho: lado,
			alto: lado,
			probar: (x, y) =>
				puedeMarcar(
					this.a.partida().santuario,
					uid,
					accion,
					x,
					y,
					this.balance,
				),
			confirmar: (x, y) => {
				if (!this.a.gestionar({ tipo: "marcarAccion", uid, accion, x, y }))
					return;
				this.terminarCursor();
				this.menuMarcar(volverA);
			},
			cancelar: () => this.menuAccionesDe(uid, [accion], volverA),
		});
	}

	private iniciarCamino(): void {
		this.iniciarCursor({
			titulo: t("gestion.terreno.trazando"),
			probar: (x, y) =>
				puedeCamino(this.a.partida().santuario, x, y, this.balance),
			confirmar: (x, y) => {
				// se puede seguir trazando: el cursor se queda y se prueba de nuevo
				if (this.a.gestionar({ tipo: "colocarCamino", x, y }))
					this.actualizarCursor();
			},
			cancelar: () => this.menuTerreno(1),
		});
	}

	private menuDecorar(indice = 0): void {
		const items: ItemMenu[] = decoracionesDisponibles(
			this.a.partida().santuario,
			this.balance,
		).map((d, i) => ({
			texto: `${t(`decoracion.${d.id}`)}  (${this.textoCoste(d.coste)}, +${d.puntos})${
				d.asequible ? "" : `  [${t("gestion.faltan")}]`
			}`,
			activo: d.asequible,
			alElegir: () => this.iniciarDecoracion(d.id, i),
		}));
		this.menu.mostrar(
			t("gestion.terreno.decorar"),
			items,
			t("gestion.pie"),
			() => this.menuTerreno(2),
			indice,
		);
	}

	private iniciarDecoracion(id: string, volverA: number): void {
		this.iniciarCursor({
			titulo: t("gestion.terreno.colocando", {
				decoracion: t(`decoracion.${id}`),
			}),
			probar: (x, y) =>
				puedeDecorar(this.a.partida().santuario, id, x, y, this.balance),
			confirmar: (x, y) => {
				if (!this.a.gestionar({ tipo: "colocarDecoracion", id, x, y })) return;
				this.terminarCursor();
				this.menuDecorar(volverA);
			},
			cancelar: () => this.menuDecorar(volverA),
		});
	}

	// ------------------------------------------------------- Altar y Gimnasio

	/** Entradas del menú principal para los edificios que ya están terminados. */
	private itemsAltarYGimnasio(): ItemMenu[] {
		const s = this.a.partida().santuario;
		const items: ItemMenu[] = [];
		if (nivelDeEdificio(s, "altar") !== undefined)
			items.push({
				texto: t("gestion.principal.altar"),
				alElegir: () => this.menuAltar(),
			});
		if (nivelDeEdificio(s, "gimnasio") !== undefined)
			items.push({
				texto: t("gestion.principal.gimnasio"),
				alElegir: () => this.menuGimnasio(),
			});
		return items;
	}

	private menuAltar(indice = 0): void {
		const noche = this.a.partida().santuario.momento === "noche";
		const items: ItemMenu[] = [
			{
				texto: t("altar.ceremonias"),
				alElegir: () => this.menuCeremonias(),
			},
			{
				texto: t("altar.codigos"),
				// Los Códigos son permanentes y se eligen de día, con la gestión.
				activo: !noche,
				alElegir: () => this.menuCodigos(),
			},
		];
		this.menu.mostrar(
			t("gestion.principal.altar"),
			items,
			t("gestion.pie"),
			() => (noche ? this.cerrar() : this.menuPrincipal(4)),
			indice,
		);
	}

	private menuCeremonias(indice = 0): void {
		const s = this.a.partida().santuario;
		const b = this.balance;
		const ids = Object.keys(b.ceremonias) as IdCeremonia[];
		const items: ItemMenu[] = ids.map((id, i) => {
			const motivo = motivoNoPuede(
				s,
				id,
				b.ceremonias,
				s.ceremonias ?? {},
				true,
			);
			return {
				texto: `${t(`ceremonia.${id}`)}  (${this.textoCoste(b.ceremonias[id].coste)})${
					motivo === undefined ? "" : `  [${t(`ceremonia.motivo.${motivo}`)}]`
				}`,
				activo: motivo === undefined,
				alElegir: () => {
					if (!this.a.gestionar({ tipo: "celebrarCeremonia", id })) return;
					this.a.aviso(t("ceremonia.hecha", { nombre: t(`ceremonia.${id}`) }));
					this.menuCeremonias(i);
				},
			};
		});
		this.menu.mostrar(
			t("altar.ceremonias"),
			items,
			t("gestion.pie"),
			() => this.menuAltar(0),
			indice,
		);
	}

	private menuCodigos(indice = 0): void {
		const s = this.a.partida().santuario;
		const b = this.balance;
		const nivelAltar = nivelDeEdificio(s, "altar") ?? 0;
		const pendientes = nivelesPendientes(
			nivelAltar,
			s.codigos ?? {},
			b.codigos,
		);
		const items: ItemMenu[] = b.codigos
			.filter((d) => d.nivel <= nivelAltar)
			.map((d, i) => {
				const elegido = s.codigos?.[d.nivel];
				return {
					texto:
						elegido === undefined
							? t("altar.codigo.sinElegir", { n: d.nivel })
							: t("altar.codigo.elegido", {
									n: d.nivel,
									codigo: t(`codigo.${d[elegido].id}`),
								}),
					// Uno ya elegido es permanente: se muestra pero no se cambia.
					activo: pendientes.includes(d.nivel),
					alElegir: () => this.menuCodigo(d.nivel, i),
				};
			});
		this.menu.mostrar(
			t("altar.codigos"),
			items.length
				? items
				: [{ texto: t("gestion.vacio"), activo: false, alElegir: () => {} }],
			t("gestion.pie"),
			() => this.menuAltar(1),
			indice,
		);
	}

	private menuCodigo(nivel: number, volverA: number): void {
		const def = this.balance.codigos.find((d) => d.nivel === nivel);
		if (def === undefined) {
			this.menuCodigos();
			return;
		}
		const items: ItemMenu[] = (["A", "B"] as const).map((opcion) => ({
			texto: t(`codigo.${def[opcion].id}`),
			alElegir: () => {
				if (!this.a.gestionar({ tipo: "elegirCodigo", nivel, opcion })) return;
				this.menuCodigos(volverA);
			},
		}));
		this.menu.mostrar(
			t("altar.codigo.titulo", { n: nivel }),
			items,
			t("altar.codigo.pie"),
			() => this.menuCodigos(volverA),
		);
	}

	private menuGimnasio(): void {
		const s = this.a.partida().santuario;
		const b = this.balance;
		const nivel = s.nivelGimnasio ?? 0;
		// Sable aún no es vecino: no hay descuento ni niveles 4 y 5.
		const opciones = { sableVecino: false };
		const motivo = motivoNoPuedeSubir(nivel, s.recursos, b.gimnasio, opciones);
		const titulo = t("gimnasio.subir", { n: nivel + 1 });
		const subir: ItemMenu = {
			texto:
				motivo === "maximo" || motivo === "sable"
					? `${titulo}  [${t(`gimnasio.motivo.${motivo}`)}]`
					: `${titulo}  (${this.textoCoste({ ...costeDeSubir(nivel, b.gimnasio, opciones) })})${
							motivo === undefined ? "" : `  [${t("gestion.faltan")}]`
						}`,
			activo: motivo === undefined,
			alElegir: () => {
				if (this.a.gestionar({ tipo: "subirGimnasio" })) this.menuGimnasio();
			},
		};
		this.menu.mostrar(
			t("gimnasio.titulo", { n: nivel }),
			[subir],
			t("gestion.pie"),
			() => this.menuPrincipal(5),
		);
	}
}
