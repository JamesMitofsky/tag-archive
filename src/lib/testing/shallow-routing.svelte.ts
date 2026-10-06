/**
 * Test-only stand-in for SvelteKit's shallow routing (`pushState` and
 * `page.state`), for components rendered without a running app, where the
 * real `pushState` refuses to run. Real history entries, so `history.back()`
 * pops them with a genuine popstate:
 *
 *   vi.mock('$app/navigation', async () => {
 *     const { pushState } = await import('$lib/testing/shallow-routing.svelte');
 *     return { pushState };
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

addEventListener('popstate', (event) => {
	page.state = (event.state as Record<string, App.PageState> | null)?.[KEY] ?? {};
});
