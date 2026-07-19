import type { FieldErrors, SuiteResult } from './helpers';

type Suite<T> = (data: T) => SuiteResult;

/**
 * Reactive glue between a vest suite and a Svelte form. The same suite runs on
 * the server (the authority); this drives inline, per-field feedback in the
 * browser and only reveals an error once the user has touched that field or
 * tried to submit.
 *
 * `getServerErrors` is read lazily so a no-JS submit's returned error map still
 * surfaces before the user interacts, then live results take over.
 */
export function createValidator<T>(
	suite: Suite<T>,
	getServerErrors: () => FieldErrors = () => ({})
) {
	let result = $state.raw<SuiteResult | null>(null);
	let touched = $state<Record<string, boolean>>({});
	let submitted = $state(false);

	return {
		/** Re-run the full suite against the latest data. Returns whether it passed. */
		run(data: T): boolean {
			result = suite(data);
			return result.isValid();
		},
		/** Flag a field as touched (call on blur) so its error may surface. */
		touch(field: string): void {
			if (field && !touched[field]) touched = { ...touched, [field]: true };
		},
		/** Reveal every field's error (call on a submit attempt). */
		revealAll(): void {
			submitted = true;
		},
		/** First error for `field`, or undefined while it should stay hidden. */
		error(field: string): string | undefined {
			const shown = submitted || touched[field];
			const serverError = getServerErrors()[field]?.[0];
			if (!shown) {
				// Before any interaction, only a no-JS submit's server error surfaces.
				return result ? undefined : serverError;
			}
			// Prefer the live client result; fall back to a server-only error the
			// client suite can't know about (e.g. a uniqueness clash).
			return result ? (result.getErrors(field)[0] ?? serverError) : serverError;
		},
		/** True once a client run has happened and every rule passes. */
		get valid(): boolean {
			return result ? result.isValid() : false;
		}
	};
}

export type FormValidator<T> = ReturnType<typeof createValidator<T>>;
