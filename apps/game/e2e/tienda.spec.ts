import { expect, type Page, test } from "@playwright/test";

type EstadoTienda = {
	dinero: number;
	mochila: Record<string, number>;
	oferta: { id: string; precio: number }[];
	comprables: string[];
};

const tienda = (p: Page) =>
	p.evaluate(
		"window.__santuario.tienda?.estado() ?? null",
	) as Promise<EstadoTienda | null>;

async function abrirTienda(page: Page, cambios = "{}") {
	await page.goto("/?test=1&semilla=m2");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect
		.poll(() => page.evaluate("window.__santuario.mapa?.nodos().length ?? 0"))
		.toBeGreaterThan(0);
	await page.evaluate(`window.__santuario.mapa.preparar(${cambios})`);
	await page.waitForTimeout(100);
	const id = (await page.evaluate(
		`window.__santuario.mapa.nodos().find((n) => n.tipo === "tienda")?.id ?? null`,
	)) as string | null;
	expect(id, "el mapa de m2 no tiene tienda").not.toBeNull();
	await page.evaluate(`window.__santuario.mapa.irA(${JSON.stringify(id)})`);
	await expect
		.poll(async () => (await tienda(page))?.oferta.length)
		.toBeGreaterThan(0);
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

test("comprar un artículo descuenta su precio y suma una unidad", async ({
	page,
}) => {
	await abrirTienda(page, "{ dinero: 200 }");
	const antes = (await tienda(page)) as EstadoTienda;
	const primero = antes.oferta[0] as { id: string; precio: number };
	await page.keyboard.press("1");
	await expect
		.poll(async () => (await tienda(page))?.dinero)
		.toBe(200 - primero.precio);
	const despues = (await tienda(page)) as EstadoTienda;
	expect(despues.mochila[primero.id]).toBe(
		(antes.mochila[primero.id] ?? 0) + 1,
	);
});

test("sin dinero suficiente el artículo no se puede comprar", async ({
	page,
}) => {
	await abrirTienda(page, "{ dinero: 0 }");
	expect(((await tienda(page)) as EstadoTienda).comprables).toEqual([]);
	await page.keyboard.press("1");
	await page.waitForTimeout(100);
	expect(((await tienda(page)) as EstadoTienda).dinero).toBe(0);
});

test("la runa F añade una opción extra a la oferta y Enter vuelve al mapa", async ({
	page,
}) => {
	await abrirTienda(page, "{ dinero: 50 }");
	const sin = ((await tienda(page)) as EstadoTienda).oferta.length;
	await page.keyboard.press("Enter");
	await expect
		.poll(() => page.evaluate("window.__santuario.mapa?.estado().piso ?? 0"))
		.toBe(1);
	await page.evaluate(`window.__santuario.mapa.preparar({ runas: ["F"] })`);
	await page.waitForTimeout(100);
	const id = (await page.evaluate(
		`window.__santuario.mapa.nodos().find((n) => n.tipo === "tienda")?.id`,
	)) as string;
	await page.evaluate(`window.__santuario.mapa.irA(${JSON.stringify(id)})`);
	await expect
		.poll(async () => (await tienda(page))?.oferta.length)
		.toBe(sin + 1);
});
