/**
 * Test-only stand-in for SvelteKit's shallow routing (`goto` with
 * `shallow: true`, and `page.state`), for components rendered without a
 * running app, where the real `goto` refuses to run. Real history entries, so
 * `history.back()` pops them with a genuine popstate, and `page.state` follows
 * only a task later, so a component's own popstate listener still sees the
 * entry it left, as in the app: SvelteKit 3 starts its router after the page
 * has mounted, so its popstate listener runs after a component's. A microtask
 * would not do: the browser runs those between listeners, so this one, added
 * first, would have updated `page.state` before any component's ran.
 *
 *   vi.mock('$app/navigation', async () => {
 *     const nav = await import('#lib/testing/shallow-routing.svelte.ts');
 *     return { goto: nav.goto, onNavigate: nav.onNavigate, afterNavigate: nav.afterNavigate };
 *   });
 *   vi.mock('$app/state', async () => {
 *     const { page } = await import('#lib/testing/shallow-routing.svelte.ts');
 *     return { page };
 *   });
 */
export const page = $state<{ state: App.PageState }>({ state: {} });

const KEY = 'shallow-routing-test-state';

/** Shallow navigations only: a component test has no routes to go to. */
export async function goto(
	_url: string | URL,
	{
		shallow,
		replace,
		state = {}
	}: { shallow?: boolean; replace?: boolean; state?: App.PageState } = {}
): Promise<void> {
	if (!shallow) throw new Error('The shallow-routing stand-in only takes shallow navigations');
	if (replace) history.replaceState({ [KEY]: state }, '');
	else history.pushState({ [KEY]: state }, '');
	page.state = state;
}

/** No navigations happen in a component test. */
export function onNavigate() {}
export function afterNavigate() {}

window.addEventListener('popstate', (event: PopStateEvent) => {
	setTimeout(() => {
		page.state = (event.state as Record<string, App.PageState> | null)?.[KEY] ?? {};
	});
});
