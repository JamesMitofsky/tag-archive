import { redirect } from '@sveltejs/kit';
import { desc, eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachHosts } from '$lib/server/db/queries';
import { event, series } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// This view is signed-in only; the keeper page owns the sign-in flow.
	if (!locals.user) throw redirect(303, '/keeper');

	// Join the series in and flatten its name to `series` (see EventWithMeta).
	const rows = await db
		.select({ ...getTableColumns(event), series: series.name })
		.from(event)
		.leftJoin(series, eq(event.seriesId, series.id))
		.orderBy(desc(event.date), desc(event.id));
	// Re-expand host names from the join table onto each event.
	const events = await attachHosts(rows);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		events,
		// Optional search seed, e.g. arriving from a series card (?q=Series Name).
		q: url.searchParams.get('q') ?? ''
	};
};
