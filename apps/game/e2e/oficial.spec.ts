import { expect, type Page, test } from "@playwright/test";

// 1×1 PNG transparente: basta para comprobar que la textura oficial llega a la escena.
const PNG_1X1 = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	"base64",
);
const GITHUB = "https://raw.githubusercontent.com/**";

type Texturas = { jugador: string; rival: string };
const texturas = (p: Page) =>
	p.evaluate(
		"window.__santuario.combate.estado().texturas",
	) as Promise<Texturas>;
const esperarMenu = (p: Page) =>
	expect
		.poll(() =>
			p.evaluate("window.__santuario.combate?.estado().fase ?? 'sin-gancho'"),
		)
		.toBe("menu");

async function abrirCombate(p: Page, consulta: string) {
	await p.goto(`/?test=1&semilla=s4${consulta}`);
	await p.locator('[data-estado="listo"]').waitFor();
	await p.keyboard.press("b");
	await esperarMenu(p);
}

test("oficial=ninguno: el combate se juega con sustitutos y no pide nada a GitHub", async ({
	page,
}) => {
	const pedidos: string[] = [];
	await page.route(GITHUB, (r) => {
		pedidos.push(r.request().url());
		return r.abort();
	});
	await abrirCombate(page, "&oficial=ninguno");
	const t = await texturas(page);
	expect(t.jugador).toMatch(/^sprite:ninguno:[a-z-]+:espalda$/);
	expect(t.rival).toMatch(/^sprite:ninguno:[a-z-]+:frente$/);
	expect(pedidos).toEqual([]);
});

test("oficial=o1: pide los sprites a PokeAPI/sprites y los usa", async ({
	page,
}) => {
	const pedidos: string[] = [];
	await page.route(GITHUB, (r) => {
		pedidos.push(r.request().url());
		return r.fulfill({
			status: 200,
			contentType: "image/png",
			headers: { "access-control-allow-origin": "*" },
			body: PNG_1X1,
		});
	});
	await abrirCombate(page, "&oficial=o1");
	const t = await texturas(page);
	expect(t.jugador).toMatch(/^sprite:o1:[a-z-]+:espalda$/);
	expect(t.rival).toMatch(/^sprite:o1:[a-z-]+:frente$/);
	expect(pedidos.length).toBeGreaterThanOrEqual(2);
	for (const url of pedidos)
		expect(url).toMatch(
			/^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-v\/black-white\//,
		);
});

test("oficial=o1 sin red: cae al sustituto y el combate sigue", async ({
	page,
}) => {
	await page.route(GITHUB, (r) => r.abort());
	await abrirCombate(page, "&oficial=o1");
	const t = await texturas(page);
	expect(t.jugador).toMatch(/^sprite:ninguno:/);
	expect(t.rival).toMatch(/^sprite:ninguno:/);
});

test("oficial=o1 con un 404: cae al sustituto y el combate sigue", async ({
	page,
}) => {
	await page.route(GITHUB, (r) => r.fulfill({ status: 404, body: "no" }));
	await abrirCombate(page, "&oficial=o1");
	expect((await texturas(page)).rival).toMatch(/^sprite:ninguno:/);
});
