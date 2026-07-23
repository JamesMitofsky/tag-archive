import { error, redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { event, series } from '$lib/server/db/schema';
import { idSchema } from '$lib/schemas';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/keeper');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Series not found');

	const [item] = await db.select().from(series).where(eq(series.id, id.data)).limit(1);
	if (!item) throw error(404, 'Series not found');

	const events = await db
		.select({
			id: event.id,
			title: event.title,
			date: event.date,
			time: event.time,
			location: event.location
		})
		.from(event)
		.where(eq(event.seriesId, id.data))
		.orderBy(desc(event.date), desc(event.id));

	return {
		user: { email: locals.user.email, role: locals.user.role },
		series: item,
		events
	};
};
