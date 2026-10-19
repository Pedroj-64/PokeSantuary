import { expect, type Page, test } from "@playwright/test";

type EstadoSantuario = {
	x: number;
	y: number;
	direccion: string;
	cercaDelArbol: boolean;
	jornada: number;
	momento: string;
	armonia: number;
	recursos: Record<string, number>;
	residentes: {
		uid: string;
		especie: string;
		estado: string;
		tarea: { tipo: string; edificio?: string };
		lecho: string | null;
	}[];
	edificios: {
		uid: string;
		tipo: string;
		obraRestante: number;
		nivel: number;
	}[];
	menu: boolean;
	colocando: boolean;
	panel: boolean;
	lineasPanel: string[];
	guardadoOk: boolean;
	aviso: string;
};

const estado = (p: Page) =>
	p.evaluate(
		"window.__santuario.santuario?.estado() ?? null",
	) as Promise<EstadoSantuario | null>;

async function entrar(page: Page, semilla = "m2") {
	await page.goto(`/?test=1&semilla=${semilla}`);
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("s");
	await expect.poll(async () => (await estado(page)) !== null).toBe(true);
}

let errores: string[] = [];
test.beforeEach(({ page }) => {
	errores = [];
	page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
	page.on("console", (m) => {
		if (m.type() === "error" && !m.text().includes("404"))
			errores.push(`console.error: ${m.text()}`);
	});
});
test.afterEach(() => expect(errores).toEqual([]));

test.use({ locale: "es-ES" });

test("el protagonista camina con las flechas y mira hacia donde va", async ({
	page,
}) => {
	await entrar(page);
	const antes = (await estado(page)) as EstadoSantuario;
	await page.keyboard.down("ArrowRight");
	await page.waitForTimeout(600);
	await page.keyboard.up("ArrowRight");
	const despues = (await estado(page)) as EstadoSantuario;
	expect(despues.x).toBeGreaterThan(antes.x + 20);
	expect(despues.y).toBe(antes.y);
	expect(despues.direccion).toBe("lado");
});

test("los edificios bloquean el paso y junto al Árbol se puede salir a la Fisura", async ({
	page,
}) => {
	await entrar(page);
	// salir a la Fisura solo se puede de día
	await page.keyboard.press("Enter");
	await expect.poll(async () => (await estado(page))?.momento).toBe("dia");
	const arbol = (await page.evaluate(
		"window.__santuario.santuario.arbol()",
	)) as { x: number; y: number };
	expect(
		await page.evaluate(
			`window.__santuario.santuario.colocar(${arbol.x}, ${arbol.y})`,
		),
	).toBe(true);
	await expect.poll(async () => (await estado(page))?.cercaDelArbol).toBe(true);
	// empujar contra el tronco no lo atraviesa
	await page.keyboard.down("ArrowUp");
	await page.waitForTimeout(700);
	await page.keyboard.up("ArrowUp");
	expect(((await estado(page)) as EstadoSantuario).y).toBeGreaterThanOrEqual(
		arbol.y - 4,
	);
	await page.keyboard.press("e");
	await expect
		.poll(() => page.evaluate("window.__santuario.mapa?.estado().piso ?? 0"))
		.toBe(1);
});

test("Esc vuelve a la lista de especies", async ({ page }) => {
	await entrar(page);
	await page.keyboard.press("Escape");
	await expect
		.poll(() => page.evaluate("window.__santuario.santuario === undefined"))
		.toBe(true);
});

test("empieza con tres residentes en el Alba de la jornada 1", async ({
	page,
}) => {
	await entrar(page, "m-inicio");
	const s = (await estado(page)) as EstadoSantuario;
	expect(s.jornada).toBe(1);
	expect(s.momento).toBe("alba");
	expect(s.residentes.map((r) => r.especie)).toEqual([
		"bulbasaur",
		"charmander",
		"squirtle",
	]);
});

test("Enter recorre alba, día, atardecer con resumen, noche y la jornada siguiente", async ({
	page,
}) => {
	await entrar(page, "m-jornada");
	await page.keyboard.press("Enter");
	await expect.poll(async () => (await estado(page))?.momento).toBe("dia");
	await page.keyboard.press("Enter"); // pasar el día: se resuelve el Atardecer
	await expect.poll(async () => (await estado(page))?.panel).toBe(true);
	expect(((await estado(page)) as EstadoSantuario).momento).toBe("noche");
	// con el panel abierto, Enter solo lo cierra
	await page.keyboard.press("Enter");
	await expect.poll(async () => (await estado(page))?.panel).toBe(false);
	expect(((await estado(page)) as EstadoSantuario).momento).toBe("noche");
	await page.keyboard.press("Enter"); // dormir
	await expect
		.poll(async () => (await estado(page))?.jornada, {
			message: `aviso: ${(await estado(page))?.aviso}`,
		})
		.toBe(2);
	expect(((await estado(page)) as EstadoSantuario).momento).toBe("alba");
});

test("el progreso se guarda: al recargar la página sigue la misma jornada", async ({
	page,
}) => {
	await entrar(page, "m-guardado");
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	await expect.poll(async () => (await estado(page))?.panel).toBe(true);
	await page.evaluate("window.__santuario.santuario.guardada()");
	const antes = (await estado(page)) as EstadoSantuario;
	await page.reload();
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("s");
	await expect.poll(async () => (await estado(page)) !== null).toBe(true);
	const despues = (await estado(page)) as EstadoSantuario;
	expect(despues.momento).toBe(antes.momento);
	expect(despues.jornada).toBe(antes.jornada);
	expect(despues.recursos).toEqual(antes.recursos);
	expect(despues.guardadoOk).toBe(true);
});

test("carga diferida: la escena del Santuario solo se pide al entrar", async ({
	page,
}) => {
	const pedidos: string[] = [];
	page.on("request", (r) => pedidos.push(r.url()));
	await page.goto("/?test=1&semilla=m-diferida");
	await page.locator('[data-estado="listo"]').waitFor();
	expect(pedidos.some((u) => u.includes("SantuarioMundo"))).toBe(false);
	await page.keyboard.press("s");
	await expect.poll(async () => (await estado(page)) !== null).toBe(true);
	expect(pedidos.some((u) => u.includes("SantuarioMundo"))).toBe(true);
});

const pulsar = async (page: Page, ...teclas: string[]) => {
	for (const k of teclas) await page.keyboard.press(k);
};
const actual = async (page: Page) => (await estado(page)) as EstadoSantuario;

test("gestión: se construye un lecho, un residente lo levanta y luego duerme en él", async ({
	page,
}) => {
	await entrar(page, "m-gestion");
	// de noche o de madrugada la gestión no está disponible
	await pulsar(page, "g");
	expect((await actual(page)).menu).toBe(false);
	await pulsar(page, "Enter"); // comenzar el día
	await expect.poll(async () => (await actual(page)).momento).toBe("dia");

	// G → Construir → primer kit (lecho de hojas) → colocar donde está el protagonista
	await pulsar(page, "g");
	await expect.poll(async () => (await actual(page)).menu).toBe(true);
	await pulsar(page, "ArrowDown", "Enter", "Enter");
	await expect.poll(async () => (await actual(page)).colocando).toBe(true);
	await pulsar(page, "Enter");
	await expect.poll(async () => (await actual(page)).colocando).toBe(false);
	let s = await actual(page);
	const lecho = s.edificios.find((e) => e.tipo === "lecho-hojas");
	expect(lecho?.obraRestante).toBeGreaterThan(0);
	expect(s.recursos.madera).toBe(8); // 10 - 2 del kit
	expect(s.menu).toBe(true); // vuelve al menú de construir
	await pulsar(page, "Escape", "Escape"); // atrás y cerrar
	await expect.poll(async () => (await actual(page)).menu).toBe(false);

	// G → Residentes → el primero → Cambiar tarea → Construir lecho
	await pulsar(page, "g", "Enter", "Enter", "Enter");
	await pulsar(page, "ArrowDown", "Enter"); // 0 = descansar, 1 = construir el lecho
	await expect
		.poll(async () => (await actual(page)).residentes[0]?.tarea.tipo)
		.toBe("construir");
	await pulsar(page, "Escape", "Escape", "Escape");
	await expect.poll(async () => (await actual(page)).menu).toBe(false);

	// pasar el día: la obra (2) la termina un constructor (2 por jornada)
	await pulsar(page, "Enter"); // pasar el día
	await expect.poll(async () => (await actual(page)).panel).toBe(true);
	await pulsar(page, "Enter", "Enter"); // cerrar resumen y dormir
	await expect.poll(async () => (await actual(page)).jornada).toBe(2);
	await pulsar(page, "Enter", "Enter"); // el panel del Alba (visitantes) y comenzar el día
	await expect.poll(async () => (await actual(page)).momento).toBe("dia");
	s = await actual(page);
	expect(s.edificios.find((e) => e.tipo === "lecho-hojas")?.obraRestante).toBe(
		0,
	);

	// G → Residentes → el primero → Asignar lecho → el lecho
	await pulsar(page, "g", "Enter", "Enter", "ArrowDown", "Enter", "Enter");
	await expect
		.poll(async () => (await actual(page)).residentes[0]?.lecho)
		.not.toBeNull();
});

test("gestión: Esc cancela la colocación sin gastar materiales ni construir nada", async ({
	page,
}) => {
	await entrar(page, "m-gestion-2");
	await pulsar(page, "Enter", "g", "ArrowDown", "Enter");
	// el huerto de bayas cuesta 6 madera y 4 piedra: con 10 y 6 se puede; el almacén
	// y el resto también; cancelar la colocación no gasta nada
	await pulsar(page, "Enter");
	await expect.poll(async () => (await actual(page)).colocando).toBe(true);
	await pulsar(page, "Escape");
	await expect.poll(async () => (await actual(page)).colocando).toBe(false);
	const s = await actual(page);
	expect(s.recursos.madera).toBe(10);
	expect(s.edificios.filter((e) => e.tipo !== "arbol-cenit")).toEqual([]);
});
