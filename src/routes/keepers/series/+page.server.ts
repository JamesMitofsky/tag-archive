import { redirect } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { event, series } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// This view is signed-in only; the keeper page owns the sign-in flow.
	if (!locals.user) throw redirect(303, '/keepers');

	// A series groups several events; surface the count and date span for each,
	// ranked by how many events it connects (biggest series first).
	const rows = await db
		.select({
			id: series.id,
			name: series.name,
			eventCount: sql<number>`count(${event.id})`,
			firstDate: sql<string | null>`min(${event.date})`,
			lastDate: sql<string | null>`max(${event.date})`
		})
		.from(series)
		.leftJoin(event, eq(event.seriesId, series.id))
		.groupBy(series.id)
		.orderBy(desc(sql`count(${event.id})`), series.name);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		series: rows
	};
};
