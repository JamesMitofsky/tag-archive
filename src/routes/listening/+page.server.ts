import { redirect } from '@sveltejs/kit';
import { LOCKED_PATH } from '#lib/access/paths.ts';
import type { ArtefactCardItem } from '#lib/components/ArtefactCard.svelte';
import { grantFiles } from '#lib/server/access.ts';
import { loadListenerArtefacts } from '#lib/server/listeners.ts';
import type { PageServerLoad } from './$types';

// A listener's page (see #lib/roles): the artefacts an admin chose for their
// account, and all their pass opens (see `passOpens` in #lib/access/gate). The
// gate lets anyone with a pass this far; who sees what is settled here, by the
// session, which only SvelteKit can read.
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	// Rendered for one account: no cache anywhere may keep a copy.
	setHeaders({ 'cache-control': 'private, no-store' });

	// A keeper sees the whole archive, and so does anyone in from the garden.
	if (locals.user) throw redirect(303, '/');
	if (!locals.listener) throw redirect(303, locals.pass ? '/' : LOCKED_PATH);

	const rows = await loadListenerArtefacts(locals.listener.id);
	const artefacts: ArtefactCardItem[] = await Promise.all(
		rows.map(async (row) => ({
			// What a card draws and nothing more: no storage location, no audit
			// columns naming who entered the artefact.
			id: row.id,
			artefact: row.artefact,
			event: row.event,
			date: row.date,
			description: row.description,
			programArea: row.programArea,
			provenance: row.provenance,
			fileUrls: await grantFiles(row.fileUrls)
		}))
	);
	return { artefacts };
};
