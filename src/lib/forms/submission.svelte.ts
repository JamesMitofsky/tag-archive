import { afterNavigate } from '$app/navigation';

/** What an anonymous submission hands back: the new row's id and its contact token. */
export type Submission = { id: number; token: string };

/**
 * The submission a contribute page is thanking the visitor for, read from its
 * action result (`form.submitted`).
 *
 * Held across the moment SvelteKit clears `form` before applying each new
 * result: without that, the thank-you would be torn down and rebuilt on every
 * answer to its contact form, losing what was typed there. Let go on a real
 * navigation back to the page (the nav's Cloud Keeper mark, a link to the same
 * form): that clears `form` too, but means "start again", and only a
 * navigation runs `afterNavigate` — applying an action's result does not.
 *
 * Call during component initialization (it registers `afterNavigate`).
 */
export function latchedSubmission(getForm: () => unknown) {
	const current = $derived.by(() => {
		const form = getForm();
		if (form && typeof form === 'object' && 'submitted' in form && form.submitted) {
			return form.submitted as Submission;
		}
		return undefined;
	});
	let held = $state<Submission | undefined>();

	$effect.pre(() => {
		if (current) held = current;
	});
	afterNavigate(({ type }) => {
		// 'enter' is the page's own first load, whose result `current` already reads.
		if (type !== 'enter' && !current) held = undefined;
	});

	return {
		/** The submission to thank them for, if any. Read during SSR too (no effects there). */
		get value(): Submission | undefined {
			return current ?? held;
		}
	};
}
