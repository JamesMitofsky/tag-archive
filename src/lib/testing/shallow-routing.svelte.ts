/**
 * Test-only stand-in for SvelteKit's shallow routing (`goto(…, { shallow: true })`
 * and `page.state`), for components rendered without a running app, where the
 * real `goto` refuses to run. Real history entries, so `history.back()` pops
 * them with a genuine popstate, and `page.state` is updated before any
 * component's own popstate listener runs, as SvelteKit's router does:
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

/** Shallow navigations only: a real one has no page to go to in a component test. */
export async function goto(
	_url: string | URL,
	opts: { shallow?: boolean; replace?: boolean; state?: App.PageState } = {}
) {
	if (!opts.shallow) throw new Error('Only shallow navigations work in a component test');
	const state = opts.state ?? {};
	if (opts.replace) history.replaceState({ [KEY]: state }, '');
	else history.pushState({ [KEY]: state }, '');
	page.state = state;
}

/** No navigations happen in a component test. */
export function onNavigate() {}
export function afterNavigate() {}

window.addEventListener('popstate', (event) => {
	page.state = (event.state as Record<string, App.PageState> | null)?.[KEY] ?? {};
});
