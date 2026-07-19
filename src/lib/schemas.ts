import { z } from 'zod';

/** Positive integer id, coerced from route params / form values. */
export const idSchema = z.coerce.number().int().positive();
