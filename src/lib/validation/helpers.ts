import { create, test, enforce } from 'vest';

/** ISO calendar date, e.g. 2026-07-18. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pragmatic email shape check — mirrors the intent of the old zod `.email()`
 * without RFC pedantry. Good enough as a client hint; better-auth is the
 * authority on whether an address actually receives the code.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True for a syntactically valid absolute http(s) URL. */
export function isHttpUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

/** Trim a raw FormData entry down to a plain string ('' when absent). */
export function str(value: FormDataEntryValue | null): string {
	return String(value ?? '').trim();
}

/** Split a comma-separated field into a clean, de-blanked list. */
export function splitList(raw: string): string[] {
	return raw
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
}

/**
 * Register a boolean assertion under `field`. The suite marks the field invalid
 * with `message` when `passed` is false. Every rule in this codebase reduces to
 * a precomputed predicate so the suites stay framework-agnostic and read the
 * same on the server and in the browser.
 */
export function check(field: string, message: string, passed: boolean): void {
	test(field, message, () => {
		enforce(passed).isTruthy();
	});
}

/** Optional free-text max-length rule, mirroring the old zod `optionalText`. */
export function maxLen(field: string, value: string, max: number, label: string): void {
	check(field, `Keep the ${label} under ${max} characters`, (value ?? '').trim().length <= max);
}

/** Per-field error map from a suite run — `{ field: [messages] }`. */
export type FieldErrors = Record<string, string[]>;

/** Minimal shape shared by every suite run result we consume. */
export interface SuiteResult {
	isValid(): boolean;
	getErrors(): FieldErrors;
	getErrors(field: string): string[];
}

/**
 * Wrap a vest suite body in a cleanly-typed `(data) => SuiteResult` callable.
 * Runs via `runStatic`, vest's stateless mode: each call is independent, so a
 * single suite is safe to share across concurrent server requests and to reuse
 * in the browser. Read the returned run result's `isValid()` / `getErrors()`.
 */
export function defineSuite<T>(body: (data: T) => void): (data: T) => SuiteResult {
	const suite = create(body as (...args: unknown[]) => void);
	return (data: T) => suite.runStatic(data) as unknown as SuiteResult;
}

/** First error message across all fields — the single-string legacy summary. */
export function summary(result: SuiteResult): string | undefined {
	const all = result.getErrors();
	for (const field of Object.keys(all)) {
		if (all[field]?.length) return all[field][0];
	}
	return undefined;
}
