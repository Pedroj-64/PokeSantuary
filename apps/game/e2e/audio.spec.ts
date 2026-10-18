import { expect, type Page, test } from "@playwright/test";

type RegistroAudio = {
	musica: string | null;
	efectos: string[];
	silenciado: boolean;
};

const audio = (p: Page) =>
	p.evaluate(
		"window.__santuario.audio ?? null",
	) as Promise<RegistroAudio | null>;

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

test("la música cambia con la escena: mapa, combate y vuelta a la lista en silencio", async ({
	page,
}) => {
	await page.goto("/?test=1&semilla=x4");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect.poll(async () => (await audio(page))?.musica).toBe("mapa");
	await page.keyboard.press("1");
	await expect.poll(async () => (await audio(page))?.musica).toBe("combate");
	await page.keyboard.press("Escape");
	await expect.poll(async () => (await audio(page))?.musica).toBeNull();
});

test("M silencia y vuelve a activar el sonido, y se recuerda al recargar", async ({
	page,
}) => {
	await page.goto("/?test=1&semilla=x4");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect.poll(async () => (await audio(page))?.musica).toBe("mapa");
	expect((await audio(page))?.silenciado).toBe(false);
	await page.keyboard.press("m");
	await expect.poll(async () => (await audio(page))?.silenciado).toBe(true);
	await page.reload();
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect.poll(async () => (await audio(page))?.silenciado).toBe(true);
	await page.keyboard.press("m");
	await expect.poll(async () => (await audio(page))?.silenciado).toBe(false);
});

test("elegir un nodo dispara el efecto de aceptar", async ({ page }) => {
	await page.goto("/?test=1&semilla=x4");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect.poll(async () => (await audio(page))?.musica).toBe("mapa");
	await page.keyboard.press("1");
	await expect
		.poll(async () => (await audio(page))?.efectos)
		.toContain("menu-aceptar");
});

test("un movimiento suena según su tipo y el daño dispara el golpe", async ({
	page,
}) => {
	await page.goto("/?test=1&semilla=x4");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect.poll(async () => (await audio(page))?.musica).toBe("mapa");
	await page.keyboard.press("1");
	await expect
		.poll(() =>
			page.evaluate("window.__santuario.combate?.estado().fase ?? null"),
		)
		.toBe("menu");
	await page.evaluate(
		`window.__santuario.combate.elegir({ tipo: "movimiento", indice: 0 })`,
	);
	await expect
		.poll(async () => (await audio(page))?.efectos.join(","))
		.toMatch(/mov-[a-z]+/);
	await expect
		.poll(async () => (await audio(page))?.efectos)
		.toContain("golpe");
});
