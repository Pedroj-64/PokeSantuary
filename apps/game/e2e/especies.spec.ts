import { expect, type Page, test } from "@playwright/test";

type Gancho = {
	idioma(): string;
	especies(): string[];
	tipos(): string[];
	titulo(): string;
	botonIdioma(): { x: number; y: number };
};

const TITULO = { es: "Ecos del Santuario", en: "Echoes of the Sanctuary" };

const gancho = <T>(p: Page, f: (g: Gancho) => T) =>
	p.evaluate(`(${f.toString()})(window.__santuario)`) as Promise<T>;

async function abrir(page: Page) {
	await page.goto("/?test=1");
	await page.locator('[data-estado="listo"]').waitFor();
}

// errores de página o de consola, recogidos por prueba y comprobados al final
let errores: string[] = [];

test.beforeEach(({ page }) => {
	errores = [];
	page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
	page.on("console", (m) => {
		if (m.type() === "error") errores.push(`console.error: ${m.text()}`);
	});
});

test.afterEach(() => {
	expect(errores).toEqual([]);
});

test.describe("español", () => {
	test.use({ locale: "es-ES" });

	async function comprobarEspanol(page: Page) {
		await abrir(page);
		const especies = await gancho(page, (g) => g.especies());
		expect(especies).toHaveLength(10);
		expect(especies).toContain("Pikachu");
		expect(especies).toContain("Bulbasaur");
		expect((await gancho(page, (g) => g.tipos()))[0]).toBe("Planta/Veneno");
		await expect(page.locator("html")).toHaveAttribute("lang", "es");
		expect(await gancho(page, (g) => g.titulo())).toBe(TITULO.es);
		await expect(page).toHaveTitle(TITULO.es);
		await page.screenshot({ path: "test-results/especies-es.png" });
	}

	async function comprobarIngles(page: Page) {
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		expect(await gancho(page, (g) => g.idioma())).toBe("en");
		expect(await gancho(page, (g) => g.titulo())).toBe(TITULO.en);
		await expect(page).toHaveTitle(TITULO.en);
		expect(await gancho(page, (g) => g.especies())).toHaveLength(10);
		expect((await gancho(page, (g) => g.tipos()))[0]).toBe("Grass/Poison");
		await page.screenshot({ path: "test-results/especies-en.png" });
	}

	test("cambia de idioma con un clic en el botón y persiste", async ({
		page,
	}) => {
		await comprobarEspanol(page);
		const { x, y } = await gancho(page, (g) => g.botonIdioma());
		await page.mouse.click(x, y);
		await comprobarIngles(page);
		await page.reload();
		await page.locator('[data-estado="listo"]').waitFor();
		expect(await gancho(page, (g) => g.idioma())).toBe("en");
		expect(await gancho(page, (g) => g.titulo())).toBe(TITULO.en);
		await expect(page).toHaveTitle(TITULO.en);
	});

	test("cambia de idioma con la tecla L", async ({ page }) => {
		await comprobarEspanol(page);
		await page.keyboard.press("l");
		await comprobarIngles(page);
	});
});

test.describe("inglés", () => {
	test.use({ locale: "en-US" });

	test("arranca en inglés según el navegador", async ({ page }) => {
		await abrir(page);
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		expect(await gancho(page, (g) => g.titulo())).toBe(TITULO.en);
		await expect(page).toHaveTitle(TITULO.en);
	});
});
