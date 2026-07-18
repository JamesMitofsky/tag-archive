import { z } from 'zod';
import { PROGRAM_AREAS } from '$lib/programAreas';

/** Positive integer id, coerced from route params / form values. */
export const idSchema = z.coerce.number().int().positive();

// Optional text field: empty string is allowed and later stored as NULL.
const optionalText = (max: number, label: string) =>
	z.string().trim().max(max, `Keep the ${label} under ${max} characters`);

/** Validation for the artefact create/edit form. */
export const artefactSchema = z.object({
	artefact: z
		.string()
		.trim()
		.min(1, 'Title is required')
		.max(200, 'Keep the title under 200 characters'),
	event: optionalText(200, 'event'),
	date: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')]),
	description: optionalText(2000, 'description'),
	location: optionalText(200, 'location'),
	fileUrls: z.array(z.string().url('Enter a valid file URL')).max(50),
	programArea: z.array(z.enum(PROGRAM_AREAS)),
	provenance: z.array(z.string().trim().min(1)).max(50)
});

export type ArtefactInput = z.infer<typeof artefactSchema>;
