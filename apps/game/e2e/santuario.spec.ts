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
	residentes: { uid: string; especie: string; estado: string }[];
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
