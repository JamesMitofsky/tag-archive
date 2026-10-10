/**
 * Test-only stand-in for SvelteKit's shallow routing (`pushState` and
 * `page.state`), for components rendered without a running app, where the
 * real `pushState` refuses to run. Real history entries, so `history.back()`
 * pops them with a genuine popstate, and `page.state` is updated before any
 * component's own popstate listener runs, as SvelteKit's router does:
 *
 *   vi.mock('$app/navigation', async () => {
 *     const nav = await import('$lib/testing/shallow-routing.svelte');
 *     return { pushState: nav.pushState, onNavigate: nav.onNavigate, afterNavigate: nav.afterNavigate };
 *   });
 *   vi.mock('$app/state', async () => {
 *     const { page } = await import('$lib/testing/shallow-routing.svelte');
 *     return { page };
 *   });
 */
export const page = $state<{ state: App.PageState }>({ state: {} });

const KEY = 'shallow-routing-test-state';

export function pushState(_url: string | URL, state: App.PageState) {
	history.pushState({ [KEY]: state }, '');
	page.state = state;
}

/** No navigations happen in a component test. */
export function onNavigate() {}
export function afterNavigate() {}

addEventListener('popstate', (event) => {
	page.state = (event.state as Record<string, App.PageState> | null)?.[KEY] ?? {};
});
