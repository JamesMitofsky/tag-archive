import { error, redirect } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachHosts } from '$lib/server/db/queries';
import { event, series } from '$lib/server/db/schema';
import { idSchema } from '$lib/schemas';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Cloud Keeper is behind sign-in; bounce anonymous visitors to the gate.
	if (!locals.user) throw redirect(302, '/keeper');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Event not found');

	// Same shape as the list load: flatten the series name, re-expand hosts.
	const rows = await db
		.select({ ...getTableColumns(event), series: series.name })
		.from(event)
		.leftJoin(series, eq(event.seriesId, series.id))
		.where(eq(event.id, id.data))
		.limit(1);
	if (rows.length === 0) throw error(404, 'Event not found');

	const [item] = await attachHosts(rows);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		event: item
	};
};
