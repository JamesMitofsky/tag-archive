import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv(env));
const { sendOtpEmail, sendAccountCreatedEmail, WORDMARK_SRC } = await import('./email');

type SentBody = {
	html: string;
	attachments: { filename: string; content: string; content_type: string; content_id: string }[];
};

const fetchMock = vi.fn(async () => new Response('{"id":"test"}', { status: 200 }));

beforeEach(() => {
	for (const key of Object.keys(env)) delete env[key];
	env.RESEND_API_KEY = 're_test';
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function sentBody(): SentBody {
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
	return JSON.parse(init.body as string) as SentBody;
}

// The wordmark travels with the message, so it shows whatever origin sent the
// email and whether or not the reader's client fetches remote images.
describe.each([
	['sendOtpEmail', () => sendOtpEmail('keeper@archive.test', '123456')],
	[
		'sendAccountCreatedEmail',
		() => sendAccountCreatedEmail('keeper@archive.test', 'https://archive.test/keeper')
	]
])('%s', (_, send) => {
	it('attaches the wordmark inline, under the cid the HTML shows', async () => {
		await send();
		const body = sentBody();

		expect(body.html).toContain(`src="${WORDMARK_SRC}"`);
		expect(body.attachments).toHaveLength(1);
		const [logo] = body.attachments;
		expect(`cid:${logo.content_id}`).toBe(WORDMARK_SRC);
		expect(logo.content_type).toBe('image/png');

		// The base64 content decodes to the PNG itself, not a data URI.
		const bytes = Buffer.from(logo.content, 'base64');
		expect(bytes.subarray(0, 8)).toEqual(
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
		);
	});

	it('links no image from a web origin', async () => {
		await send();
		expect(sentBody().html).not.toMatch(/<img[^>]+src="https?:/);
	});
});
