import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { series } from '$lib/server/db/schema';
import { createSeriesSuite, parseSeriesForm } from '$lib/validation/series';
import { summary } from '$lib/validation/helpers';
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
	if (!locals.user) throw redirect(303, '/keeper');

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
		const data = parseSeriesForm(form);
		const result = createSeriesSuite()(data);
		if (!result.isValid()) {
			return fail(400, {
				seriesError: summary(result),
				errors: result.getErrors(),
				values: raw
			});
		}

		// `name` is unique — reject a duplicate banner instead of erroring on insert.
		const [existing] = await db
			.select({ id: series.id })
			.from(series)
			.where(eq(series.name, data.name))
			.limit(1);
		if (existing) {
			return fail(400, {
				seriesError: 'A series with that name already exists',
				errors: { name: ['A series with that name already exists'] },
				values: { ...raw, name: data.name }
			});
		}

		// id is an INTEGER PRIMARY KEY (rowid alias) — omit it and SQLite assigns the next one.
		// Empty optional fields are stored as NULL, not "".
		await db.insert(series).values({
			name: data.name,
			description: data.description || null,
			defaultDayOfWeek: data.defaultDayOfWeek || null,
			defaultTime: data.defaultTime || null,
			frequency: data.frequency || null
		});

		// Land back on the series list so the new banner shows.
		throw redirect(303, '/keeper/series');
	}
};
