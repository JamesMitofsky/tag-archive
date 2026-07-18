import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { series } from '$lib/server/db/schema';
import { seriesSchema } from '$lib/schemas';
import type { Actions, PageServerLoad } from './$types';

/** Raw (unvalidated) create-form values echoed back so a failed submit keeps input. */
export type SeriesFormValues = {
	name: string;
	description: string;
	defaultDayOfWeek: string;
	defaultTime: string;
	frequency: string;
};

export const load: PageServerLoad = async ({ locals }) => {
	// The create form is signed-in only; bounce guests back to the keeper page.
	if (!locals.user) throw redirect(303, '/cloud-keeper');

	return {
		user: { email: locals.user.email, role: locals.user.role }
	};
};

export const actions: Actions = {
	createSeries: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { seriesError: 'Sign in to add a series' });

		const form = await request.formData();
		const raw = {
			name: String(form.get('name') ?? ''),
			description: String(form.get('description') ?? ''),
			defaultDayOfWeek: String(form.get('defaultDayOfWeek') ?? ''),
			defaultTime: String(form.get('defaultTime') ?? ''),
			frequency: String(form.get('frequency') ?? '')
		};
		const parsed = seriesSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, {
				seriesError: parsed.error.issues[0].message,
				values: raw
			});
		}

		// `name` is unique — reject a duplicate banner instead of erroring on insert.
		const [existing] = await db
			.select({ id: series.id })
			.from(series)
			.where(eq(series.name, parsed.data.name))
			.limit(1);
		if (existing) {
			return fail(400, {
				seriesError: 'A series with that name already exists',
				values: { ...raw, name: parsed.data.name }
			});
		}

		// id is an INTEGER PRIMARY KEY (rowid alias) — omit it and SQLite assigns the next one.
		// Empty optional fields are stored as NULL, not "".
		await db.insert(series).values({
			name: parsed.data.name,
			description: parsed.data.description || null,
			defaultDayOfWeek: parsed.data.defaultDayOfWeek || null,
			defaultTime: parsed.data.defaultTime || null,
			frequency: parsed.data.frequency || null
		});

		// Land back on the series list so the new banner shows.
		throw redirect(303, '/cloud-keeper/series');
	}
};
