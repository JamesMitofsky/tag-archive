import { isActionFailure, isRedirect, type Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('$lib/server/db/testing');
	useTestDatabaseUrl();
	process.env.BETTER_AUTH_SECRET = 'test-secret';
	process.env.R2_PUBLIC_URL = 'https://bucket.test';
});
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { migrateTestDatabase } = await import('$lib/server/db/testing');
const { db } = await import('$lib/server/db');
const { artefact, event, submissionContact, user } = await import('$lib/server/db/schema');
const { DRAFT_COOKIE, mintDraftToken, submissionPrefix } = await import('$lib/server/drafts');
const { approveProposed } = await import('$lib/server/db/queries');
const { UNDATED } = await import('$lib/partialDate');
const { actions } = await import('./+page.server');

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.org' };

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values({ ...ADMIN, name: 'Admin' });
	await db.insert(event).values([
		{ id: 1, title: 'Vetted Concert', date: '2024-06-01' },
		{ id: 2, title: 'Pending Picnic', date: '2024-07-01', proposedAddition: true }
	]);
});

function cookieJar(token?: string): Cookies {
	const store = new Map<string, string>(token ? [[DRAFT_COOKIE, token]] : []);
	return {
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => void store.set(name, value)
	} as unknown as Cookies;
}

/** A fresh anonymous draft session: its cookies and its upload URL prefix. */
function anonymousDraft() {
	const { token, draft } = mintDraftToken();
	return {
		cookies: cookieJar(token),
		upload: (name: string) => `https://bucket.test/${submissionPrefix(draft.id)}${name}.webp`
	};
}

type ActionName = keyof typeof actions;
async function run(
	name: ActionName,
	fields: Record<string, string | string[]>,
	{ cookies = cookieJar(), signedIn = false } = {}
) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const v of Array.isArray(value) ? value : [value]) body.append(key, v);
	}
	const event = {
		request: new Request('http://localhost/contribute', { method: 'POST', body }),
		locals: signedIn ? { user: ADMIN } : {},
		cookies,
		getClientAddress: () => '198.51.100.7'
	};
	try {
		// The action types expect a full RequestEvent; these fields are all it reads.
		return await actions[name](event as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

const minimal = (fileUrls: string[]) => ({
	artefact: 'Garden program',
	date: '2023-07',
	fileUrls
});

async function row(id: number) {
	const [found] = await db.select().from(artefact).where(eq(artefact.id, id));
	return found;
}

describe('createArtefact (anonymous)', () => {
	it('refuses without a draft session', async () => {
		const result = await run('createArtefact', minimal(['https://bucket.test/x.webp']));
		expect(isActionFailure(result) && result.status).toBe(401);
	});

	it("refuses images outside the visitor's own draft space", async () => {
		const { cookies } = anonymousDraft();
		const someoneElse = anonymousDraft().upload('theirs');
		for (const url of [
			someoneElse,
			'https://bucket.test/root-upload.webp',
			'https://evil.test/x.webp'
		]) {
			const result = await run('createArtefact', minimal([url]), { cookies });
			expect(isActionFailure(result) && result.status).toBe(400);
		}
	});

	it('lands a proposed, unattributed artefact — location optional, undated allowed', async () => {
		const { cookies, upload } = anonymousDraft();
		const result = await run(
			'createArtefact',
			{ ...minimal([upload('page-1')]), date: UNDATED, event: 'Vetted Concert' },
			{ cookies }
		);
		const submitted = (result as { submitted: { id: number; token: string } }).submitted;
		const created = await row(submitted.id);
		expect(created).toMatchObject({
			proposedAddition: true,
			createdBy: null,
			location: null,
			date: null,
			eventId: 1
		});
	});

	it('only links an anonymous submission to vetted events', async () => {
		const { cookies, upload } = anonymousDraft();
		const result = await run(
			'createArtefact',
			{ ...minimal([upload('p')]), event: 'Pending Picnic' },
			{ cookies }
		);
		const { id } = (result as { submitted: { id: number } }).submitted;
		expect((await row(id)).eventId).toBeNull();
	});
});

describe('connect (optional contact side path)', () => {
	async function submit() {
		const { cookies, upload } = anonymousDraft();
		const result = await run('createArtefact', minimal([upload('c')]), { cookies });
		return (result as { submitted: { id: number; token: string } }).submitted;
	}

	it('stores contact details for the submission the token belongs to', async () => {
		const { id, token } = await submit();
		const result = await run('connect', {
			artefactId: String(id),
			token,
			name: 'Ada',
			email: 'Ada@Example.org'
		});
		expect(result).toMatchObject({ connected: true });
		const [contact] = await db
			.select()
			.from(submissionContact)
			.where(eq(submissionContact.artefactId, id));
		expect(contact).toMatchObject({ name: 'Ada', email: 'ada@example.org' });
	});

	it("refuses a token for a different artefact, so nobody can attach to another's submission", async () => {
		const first = await submit();
		const second = await submit();
		const result = await run('connect', {
			artefactId: String(second.id),
			token: first.token,
			name: 'Mallory'
		});
		expect(isActionFailure(result) && result.status).toBe(403);
	});

	it('requires at least a name or an email', async () => {
		const { id, token } = await submit();
		const result = await run('connect', { artefactId: String(id), token, name: '', email: '' });
		expect(isActionFailure(result) && result.status).toBe(400);
	});

	it('closes once a keeper has reviewed the submission', async () => {
		const { id, token } = await submit();
		await approveProposed('artefact', id, ADMIN.id);
		const result = await run('connect', { artefactId: String(id), token, name: 'Late' });
		expect(isActionFailure(result) && result.status).toBe(410);
	});
});

describe('createArtefact (signed-in admin)', () => {
	it('requires a location', async () => {
		const result = await run('createArtefact', minimal(['https://bucket.test/a.webp']), {
			signedIn: true
		});
		expect(isActionFailure(result) && result.status).toBe(400);
	});

	it('lands vetted and attributed, then redirects to the new artefact', async () => {
		const result = await run(
			'createArtefact',
			{ ...minimal(['https://bucket.test/a.webp']), location: 'Binder' },
			{ signedIn: true }
		);
		expect(isRedirect(result)).toBe(true);
		const id = Number((result as { location: string }).location.split('/').pop());
		expect(await row(id)).toMatchObject({ proposedAddition: false, createdBy: ADMIN.id });
	});
});
