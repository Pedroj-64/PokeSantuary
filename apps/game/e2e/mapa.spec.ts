import { expect, type Page, test } from "@playwright/test";

type EstadoMapa = {
	piso: number;
	actual: string | null;
	visitados: string[];
	elegibles: string[];
	dinero: number;
};

const estado = (p: Page) =>
	p.evaluate(
		"window.__santuario.mapa?.estado() ?? null",
	) as Promise<EstadoMapa | null>;

const centro = (p: Page, id: string) =>
	p.evaluate(
		`window.__santuario.mapa.centro(${JSON.stringify(id)})`,
	) as Promise<{
		x: number;
		y: number;
	}>;

async function abrirMapa(page: Page, semilla: string) {
	await page.goto(`/?test=1&semilla=${semilla}`);
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect.poll(async () => (await estado(page))?.piso).toBe(1);
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

test("E abre el mapa del piso 1 y solo los nodos de entrada son elegibles", async ({
	page,
}) => {
	await abrirMapa(page, "m1");
	const s = (await estado(page)) as EstadoMapa;
	expect(s.actual).toBeNull();
	expect(s.visitados).toEqual([]);
	expect(s.elegibles.length).toBeGreaterThanOrEqual(2);
	for (const id of s.elegibles) expect(id).toMatch(/^0-/);
});

test("pulsar un nodo elegible entra en él; uno no elegible no hace nada", async ({
	page,
}) => {
	await abrirMapa(page, "m1");
	const inicial = (await estado(page)) as EstadoMapa;
	const lejano = await centro(page, "3-0");
	await page.mouse.click(lejano.x, lejano.y);
	await page.waitForTimeout(150);
	expect(await estado(page)).toEqual(inicial);

	const id = inicial.elegibles[0] as string;
	const { x, y } = await centro(page, id);
	await page.mouse.click(x, y);
	await expect.poll(async () => (await estado(page))?.actual).toBe(id);
	const s = (await estado(page)) as EstadoMapa;
	expect(s.visitados).toEqual([id]);
	expect(s.elegibles.length).toBeGreaterThanOrEqual(1);
	for (const sig of s.elegibles) expect(sig).toMatch(/^1-/);
});

test("el teclado recorre el piso hasta el jefe, que no tiene salidas", async ({
	page,
}) => {
	await abrirMapa(page, "m2");
	for (let capa = 0; capa <= 5; capa++) {
		await expect
			.poll(async () => (await estado(page))?.visitados.length)
			.toBe(capa);
		if (capa < 5) await page.keyboard.press("1");
	}
	await page.keyboard.press("1"); // sin salidas: no hace nada
	const s = (await estado(page)) as EstadoMapa;
	expect(s.actual).toBe("5-0");
	expect(s.elegibles).toEqual([]);
});

test("el mismo seed da el mismo mapa y Esc vuelve a la lista", async ({
	page,
}) => {
	await abrirMapa(page, "m3");
	const a = (await estado(page)) as EstadoMapa;
	await page.reload();
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect.poll(async () => (await estado(page))?.piso).toBe(1);
	expect(await estado(page)).toEqual(a);

	await page.keyboard.press("Escape");
	await expect
		.poll(() => page.evaluate("window.__santuario.mapa === undefined"))
		.toBe(true);
	await page.locator('[data-estado="listo"]').waitFor();
});
