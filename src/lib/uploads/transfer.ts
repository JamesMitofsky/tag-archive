import type { PresignedPut } from '#lib/images/types.ts';

/**
 * Getting one file from the browser into the bucket, whatever kind of file it
 * is: the presigned PUT with its progress and stall watchdog, the slots that
 * bound how many run at once, and how the archive's endpoints and the bucket
 * answer a failure. Shared by the photograph uploader (#lib/images/upload)
 * and the track uploader (#lib/albums/upload), which differ only in what they
 * ask for and what they do with a file before and after it goes up.
 */

/** Why an upload request failed, as the server (or the bucket) answered it. */
export class UploadError extends Error {
	/** The HTTP status; 0 when no answer came back at all. */
	readonly status: number;
	/**
	 * The "tap the tag again" refusal: the visitor's access has lapsed, which is
	 * about the session, not this file. Any 401 means that here. The endpoints
	 * answer it as `{ message, code: 'locked' }`, the edge gate in front of them
	 * likewise, but the same gate in hooks.server.ts (the only one under
	 * `vite dev`) as a plain `{ message }`, and nothing else on these paths
	 * answers 401.
	 */
	readonly locked: boolean;

	constructor(message: string, status: number, locked = false) {
		super(message);
		this.name = 'UploadError';
		this.status = status;
		this.locked = locked;
	}
}

export const UNREACHABLE = 'The archive could not be reached. Check your connection.';
export const INTERRUPTED = 'The upload was interrupted. Check your connection.';

/** How long a PUT may go without sending a byte before it counts as interrupted. */
export const STALL_MS = 2 * 60 * 1000;

/**
 * PUT `body` to an upload URL, reporting bytes sent. XMLHttpRequest rather
 * than fetch, which can't report upload progress.
 *
 * `target.headers` are part of the URL's signature and are sent exactly as
 * given — except Content-Length, which the browser always derives from the
 * body (and refuses to have set). It must still match the signed size, so a
 * mismatch is refused here rather than as a 403 from the bucket.
 *
 * A PUT that makes no progress for `STALL_MS` is given up on as interrupted:
 * a connection can stall without ever failing, and the form waits on every
 * upload, so a stalled one would otherwise hold it up with no way forward.
 */
export function putWithProgress(
	target: PresignedPut,
	body: Blob,
	opts: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {}
): Promise<void> {
	const { onProgress, signal } = opts;
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);

		const headers = Object.entries(target.headers);
		const length = headers.find(([name]) => name.toLowerCase() === 'content-length')?.[1];
		if (length !== undefined && Number(length) !== body.size) {
			return reject(new UploadError('This upload link was issued for a different file', 0));
		}

		const xhr = new XMLHttpRequest();
		const abort = () => xhr.abort();
		let stalled = false;
		let watchdog: ReturnType<typeof setTimeout> | undefined;
		const watch = () => {
			clearTimeout(watchdog);
			watchdog = setTimeout(() => {
				stalled = true;
				xhr.abort();
			}, STALL_MS);
		};
		const settle = (outcome: () => void) => {
			clearTimeout(watchdog);
			signal?.removeEventListener('abort', abort);
			outcome();
		};

		xhr.open('PUT', target.url);
		for (const [name, value] of headers) {
			if (name.toLowerCase() !== 'content-length') xhr.setRequestHeader(name, value);
		}
		xhr.upload.onprogress = (event) => {
			watch();
			onProgress?.(event.loaded, event.lengthComputable ? event.total : body.size);
		};
		xhr.onload = () =>
			settle(() => {
				if (xhr.status >= 200 && xhr.status < 300) {
					onProgress?.(body.size, body.size);
					resolve();
				} else {
					reject(storageError(xhr.status, xhr.responseText));
				}
			});
		// A network failure and a refused CORS preflight look the same from here.
		xhr.onerror = () => settle(() => reject(new UploadError(INTERRUPTED, 0)));
		xhr.onabort = () =>
			settle(() =>
				reject(
					stalled
						? new UploadError(INTERRUPTED, 0)
						: (signal?.reason ?? new DOMException('Upload aborted', 'AbortError'))
				)
			);

		signal?.addEventListener('abort', abort, { once: true });
		watch();
		xhr.send(body);
	});
}

/**
 * Hands out at most `limit` slots at a time. An upload holds one while it asks
 * for a URL and PUTs to it — asking only once a slot is free, so a URL never
 * waits out its expiry in a queue. Urgent waiters go first: a display copy's
 * PUT is what finishes a photograph, so it doesn't queue behind every
 * original still waiting to start.
 */
export type Limiter = {
	/**
	 * Wait for a slot; resolves with the function that gives it back (call it
	 * exactly once, when done). Rejects and leaves the queue if `signal` aborts
	 * first.
	 */
	acquire(opts?: { urgent?: boolean; signal?: AbortSignal }): Promise<() => void>;
};

export function createLimiter(limit: number): Limiter {
	// At least one: a limit below that (or NaN) would hand out nothing, ever,
	// and every upload sharing the limiter would wait forever.
	const cap = limit >= 1 ? Math.floor(limit) : 1;
	const waiting: Record<'urgent' | 'normal', Array<() => void>> = { urgent: [], normal: [] };
	let active = 0;

	function next() {
		while (active < cap) {
			const start = waiting.urgent.shift() ?? waiting.normal.shift();
			if (!start) return;
			active += 1;
			start();
		}
	}

	return {
		acquire({ urgent = false, signal } = {}) {
			return new Promise((resolve, reject) => {
				if (signal?.aborted) return reject(signal.reason);
				const lane = waiting[urgent ? 'urgent' : 'normal'];
				const onAbort = () => {
					const index = lane.indexOf(start);
					if (index < 0) return;
					lane.splice(index, 1);
					reject(signal!.reason);
				};
				const start = () => {
					signal?.removeEventListener('abort', onAbort);
					let released = false;
					resolve(() => {
						if (released) return;
						released = true;
						active -= 1;
						next();
					});
				};
				lane.push(start);
				signal?.addEventListener('abort', onAbort, { once: true });
				next();
			});
		}
	};
}

/** No bound at all, for an upload not sharing slots with any other. */
export const UNLIMITED: Limiter = {
	async acquire({ signal } = {}) {
		signal?.throwIfAborted();
		return () => {};
	}
};

/** POST JSON to one of the archive's endpoints and read its JSON answer. */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal
		});
	} catch {
		// An abort is the caller's own doing, not a connection problem.
		if (signal?.aborted) throw signal.reason;
		throw new UploadError(UNREACHABLE, 0);
	}

	try {
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw serverError(res.status, text, `Upload failed (HTTP ${res.status})`);
		}
		return (await res.json()) as T;
	} catch (e) {
		if (signal?.aborted) throw signal.reason;
		if (e instanceof UploadError) throw e;
		throw new UploadError('The archive sent an answer the uploader did not expect', res.status);
	}
}

/** An `UploadError` carrying the server's own `{ message }` when it sent one. */
function serverError(status: number, text: string, fallback: string): UploadError {
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		// Not JSON: an HTML error page from a proxy, or the bucket's XML.
	}
	const fields = (typeof parsed === 'object' && parsed ? parsed : {}) as { message?: unknown };
	const message = typeof fields.message === 'string' && fields.message ? fields.message : fallback;
	return new UploadError(message, status, status === 401);
}

/**
 * A failed PUT. The dev proxy and the access gate answer JSON like the rest
 * of the API; the bucket answers S3's XML (`<Error><Code>…</Code>…`), whose
 * code is worth keeping for whoever has to work out what went wrong.
 */
function storageError(status: number, text: string): UploadError {
	const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
	return serverError(
		status,
		text,
		`Storage refused the upload (${code ?? `HTTP ${status}`}). Try again.`
	);
}
