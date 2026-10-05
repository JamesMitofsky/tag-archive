/**
 * Client half of the anonymous draft session (server half:
 * $lib/server/drafts). An anonymous visitor on /contribute needs a fresh draft
 * session to upload or submit; this obtains one — via one Cloudflare Turnstile
 * check — and renews it shortly before it lapses, so a form left open for hours
 * still submits.
 *
 * Turnstile runs in `interaction-only` mode: invisible unless Cloudflare decides
 * it needs the visitor to click, in which case the widget appears in the
 * container the page provides. Without a site key (local dev) the token step
 * is skipped and the dev server waves the request through.
 */

type TurnstileApi = {
	render(container: HTMLElement, options: Record<string, unknown>): string;
	execute(widgetId: string): void;
	reset(widgetId: string): void;
	remove(widgetId: string): void;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
		__tagTurnstileReady?: () => void;
	}
}

const SCRIPT_SRC =
	'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tagTurnstileReady';
/** Renew this long before expiry, so a renewal never races an in-flight write. */
const RENEW_MARGIN_MS = 5 * 60 * 1000;

let scriptLoading: Promise<TurnstileApi> | null = null;

/** Load Cloudflare's script once per page, resolving when its API is ready. */
function loadTurnstile(): Promise<TurnstileApi> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	scriptLoading ??= new Promise<TurnstileApi>((resolve, reject) => {
		window.__tagTurnstileReady = () => resolve(window.turnstile!);
		const script = document.createElement('script');
		script.src = SCRIPT_SRC;
		script.async = true;
		script.onerror = () => {
			scriptLoading = null;
			reject(new Error('Could not load the human check. Check your connection and try again.'));
		};
		document.head.appendChild(script);
	});
	return scriptLoading;
}

/** A user-facing message from a failed SvelteKit endpoint response. */
async function responseMessage(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.json()) as { message?: string };
		return body.message || fallback;
	} catch {
		return fallback;
	}
}

export type DraftSession = {
	/** Resolve once a fresh draft session exists; `renew` forces a new one. */
	ensure(options?: { renew?: boolean }): Promise<void>;
	destroy(): void;
};

export function createDraftSession({
	siteKey,
	expiresAt,
	container
}: {
	siteKey: string | null;
	/** Current session expiry from the page load, or null when there is none. */
	expiresAt: number | null;
	/** Where the Turnstile widget appears if it needs an interaction. */
	container: () => HTMLElement | undefined;
}): DraftSession {
	let expires = expiresAt;
	let inFlight: Promise<void> | null = null;
	let widgetId: string | null = null;
	let waiting: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null;

	async function token(): Promise<string | null> {
		if (!siteKey) return null;
		const turnstile = await loadTurnstile();
		const el = container();
		if (!el) throw new Error('The human check could not start.');

		const result = new Promise<string>((resolve, reject) => (waiting = { resolve, reject }));
		if (widgetId === null) {
			widgetId = turnstile.render(el, {
				sitekey: siteKey,
				appearance: 'interaction-only',
				execution: 'execute',
				callback: (t: string) => waiting?.resolve(t),
				'error-callback': () =>
					waiting?.reject(new Error('Could not confirm you are human — please try again.'))
			});
		} else {
			// Tokens are single-use: start a fresh challenge for each session.
			turnstile.reset(widgetId);
		}
		turnstile.execute(widgetId);
		return result;
	}

	async function obtain(): Promise<void> {
		const res = await fetch('/api/drafts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: await token() })
		});
		if (!res.ok)
			throw new Error(await responseMessage(res, 'Could not start your upload session.'));
		expires = ((await res.json()) as { expiresAt: number }).expiresAt;
	}

	return {
		ensure({ renew = false } = {}) {
			if (!renew && expires !== null && Date.now() < expires - RENEW_MARGIN_MS) {
				return Promise.resolve();
			}
			inFlight ??= obtain().finally(() => (inFlight = null));
			return inFlight;
		},
		destroy() {
			if (widgetId !== null) window.turnstile?.remove(widgetId);
			widgetId = null;
		}
	};
}
