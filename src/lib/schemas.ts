import { z } from 'zod';
import { PROGRAM_AREAS } from '$lib/programAreas';

/** Positive integer id, coerced from route params / form values. */
export const idSchema = z.coerce.number().int().positive();

/** Weekday options for a series' optional default day. Sunday-first. */
export const DAYS_OF_WEEK = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

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

/** Validation for the event create form. */
export const eventSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, 'Title is required')
		.max(200, 'Keep the title under 200 characters'),
	series: optionalText(200, 'series'),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date'),
	time: optionalText(100, 'time'),
	location: optionalText(200, 'location'),
	description: optionalText(2000, 'description'),
	url: z.union([z.literal(''), z.string().url('Enter a valid URL')]),
	hosts: z.array(z.string().trim().min(1)).max(50)
});

export type EventInput = z.infer<typeof eventSchema>;

/** Validation for the series create form. */
export const seriesSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Name is required')
		.max(200, 'Keep the name under 200 characters'),
	description: optionalText(2000, 'description'),
	// Optional defaults events under this series inherit.
	defaultDayOfWeek: z.union([z.literal(''), z.enum(DAYS_OF_WEEK)]),
	defaultTime: optionalText(100, 'time'),
	frequency: optionalText(100, 'frequency')
});

export type SeriesInput = z.infer<typeof seriesSchema>;
