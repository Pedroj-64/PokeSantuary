import { z } from "zod";

const caja = z.object({
	x: z.number().int().nonnegative(),
	y: z.number().int().nonnegative(),
	w: z.number().int().positive(),
	h: z.number().int().positive(),
});

// Atlas en formato "JSON Hash" de Phaser (this.load.atlas), solo los campos que se emiten.
export const AtlasSchema = z
	.object({
		frames: z.record(
			z.string().min(1),
			z
				.object({
					frame: caja.strict(),
					rotated: z.literal(false),
					trimmed: z.literal(false),
					spriteSourceSize: caja.strict(),
					sourceSize: z
						.object({ w: z.number().int(), h: z.number().int() })
						.strict(),
				})
				.strict(),
		),
		meta: z
			.object({
				image: z.string().min(1),
				size: z
					.object({
						w: z.number().int().positive(),
						h: z.number().int().positive(),
					})
					.strict(),
			})
			.strict(),
	})
	.strict();
export type Atlas = z.infer<typeof AtlasSchema>;
