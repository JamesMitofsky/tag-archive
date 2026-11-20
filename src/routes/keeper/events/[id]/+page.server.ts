import { error, redirect } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { attachHosts } from '#lib/server/db/queries.ts';
import { loadFeatureImage } from '#lib/server/eventFeatures.ts';
import { event, series } from '#lib/server/db/schema.ts';
import { idSchema } from '#lib/schemas.ts';
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

	const [[item], featureImage] = await Promise.all([
		attachHosts(rows),
		// Keepers see pending rows anyway, so a pending source still shows here.
		loadFeatureImage(id.data, { vettedOnly: false })
	]);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		event: item,
		featureImage
	};
};
