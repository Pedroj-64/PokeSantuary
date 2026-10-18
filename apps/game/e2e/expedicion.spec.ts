import { expect, type Page, test } from "@playwright/test";

type EstadoMapa = {
	piso: number;
	actual: string | null;
	visitados: string[];
	elegibles: string[];
	dinero: number;
	equipo: number[];
};
type EstadoCombate = {
	fase: string;
	peticion: {
		tipo: string;
		movimientos: { deshabilitado: boolean }[];
		equipo: { activo: boolean; debilitado: boolean }[];
	} | null;
};

const mapa = (p: Page) =>
	p.evaluate(
		"window.__santuario.mapa?.estado() ?? null",
	) as Promise<EstadoMapa | null>;
const combate = (p: Page) =>
	p.evaluate(
		"window.__santuario.combate?.estado() ?? { fase: 'sin-gancho' }",
	) as Promise<EstadoCombate>;

/** Juega con la política fija: primer movimiento con PP y, si toca cambiar, el primer miembro vivo. */
async function jugarHastaElFinal(p: Page) {
	for (let i = 0; i < 200; i++) {
		await expect
			.poll(async () => (await combate(p)).fase)
			.toMatch(/^(menu|cambio|fin|error)$/);
		const s = await combate(p);
		if (s.fase === "fin") return;
		if (s.fase === "error") throw new Error("error en el combate");
		const e =
			s.fase === "menu"
				? {
						tipo: "movimiento",
						indice: s.peticion?.movimientos.findIndex((m) => !m.deshabilitado),
					}
				: {
						tipo: "cambio",
						indice: s.peticion?.equipo.findIndex(
							(m) => !m.activo && !m.debilitado,
						),
					};
		await p.evaluate(`window.__santuario.combate.elegir(${JSON.stringify(e)})`);
	}
	throw new Error("el combate no terminó");
}

/** Abre una expedición con esa semilla y entra en el primer nodo elegible (siempre de combate). */
async function entrarEnElPrimerCombate(
	page: Page,
	semilla: string,
	preparar?: string,
) {
	await page.goto(`/?test=1&semilla=${semilla}`);
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect.poll(async () => (await mapa(page))?.piso).toBe(1);
	if (preparar !== undefined) {
		await page.evaluate(`window.__santuario.mapa.preparar(${preparar})`);
		await page.waitForTimeout(100);
	}
	await page.keyboard.press("1");
	await expect.poll(async () => (await combate(page)).fase).toBe("menu");
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

/*
 * Semillas con la política fija de arriba sobre el primer nodo del piso 1 (el
 * rival juega con su IA real): `x4` gana el primer combate con el primero del
 * equipo a 91 % y `x17` lo gana dejando a dos miembros debilitados. La derrota
 * se fuerza con un Geodude solo y a 1 % de PS, porque con los niveles
 * del balance actual el primer nodo casi nunca se pierde. Si el motor, los sets,
 * la IA o el balance cambian, estas semillas dejan de valer a propósito: se
 * buscan de nuevo simulando `x1`…`x80` con `prepararCombate` y la política fija.
 */
test("ganar un combate vuelve al mapa con los PS y el dinero actualizados", async ({
	page,
}) => {
	await entrarEnElPrimerCombate(page, "x4");
	await jugarHastaElFinal(page);
	await page.keyboard.press("Enter");
	await expect.poll(async () => (await mapa(page))?.visitados.length).toBe(1);
	const s = (await mapa(page)) as EstadoMapa;
	expect(s.equipo).toEqual([91, 100, 100]);
	expect(s.dinero).toBeGreaterThanOrEqual(30 + 5);
	expect(s.dinero).toBeLessThanOrEqual(30 + 10);
	expect(s.elegibles.length).toBeGreaterThanOrEqual(1);
});

test("perder el combate termina la expedición y se conserva la mitad del dinero", async ({
	page,
}) => {
	await entrarEnElPrimerCombate(page, "x1", `{ equipo: [["geodude", 1]] }`);
	await jugarHastaElFinal(page);
	await page.keyboard.press("Enter");
	await expect
		.poll(() => page.evaluate("window.__santuario.fin?.estado() ?? null"))
		.toEqual({ resultado: "derrota", dineroConservado: 15 });
	await page.keyboard.press("Enter");
	await page.locator('[data-estado="listo"]').waitFor();
});

test("un miembro debilitado no vuelve a salir al combate siguiente", async ({
	page,
}) => {
	await entrarEnElPrimerCombate(page, "x17");
	await jugarHastaElFinal(page);
	await page.keyboard.press("Enter");
	await expect.poll(async () => (await mapa(page))?.visitados.length).toBe(1);
	expect((await mapa(page))?.equipo).toEqual([0, 0, 100]);
	// siguiente nodo de combate entre los elegibles
	const siguiente = await page.evaluate(
		`window.__santuario.mapa.estado().elegibles.find((id) => ["salvaje","entrenador","alfa","sombrio"].includes(window.__santuario.mapa.tipoDe(id)))`,
	);
	expect(siguiente).toBeTruthy();
	await page.evaluate(
		`window.__santuario.mapa.elegir(${JSON.stringify(siguiente)})`,
	);
	await expect.poll(async () => (await combate(page)).fase).toBe("menu");
	expect((await combate(page)).peticion?.equipo).toHaveLength(1);
});
