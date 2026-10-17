import { z } from "zod";

// Identificador en minúsculas con guiones, compartido por todos los esquemas.
export const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
