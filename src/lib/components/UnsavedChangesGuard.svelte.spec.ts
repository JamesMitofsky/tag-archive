import { page } from 'vitest/browser';
import { beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { BeforeNavigate } from '$app/navigation';
import UnsavedChangesGuard from './UnsavedChangesGuard.svelte';

// Rendered without a running app: keep the guard's beforeNavigate callback so
// each test can hand it the navigation SvelteKit would.
const nav = vi.hoisted(() => ({ before: null as ((n: BeforeNavigate) => void) | null }));
vi.mock('$app/navigation', () => ({
	beforeNavigate: (fn: (n: BeforeNavigate) => void) => {
		nav.before = fn;
	},
	goto: vi.fn()
}));

beforeEach(() => {
	nav.before = null;
});

/** A navigation to another page of the app, or a shallow one that stays put. */
function navigation(shallow: boolean) {
	const cancel = vi.fn();
	const to = { url: new URL(location.href), params: {}, route: { id: '/' }, scroll: null };
	nav.before!({ shallow, willUnload: false, to, cancel } as unknown as BeforeNavigate);
	return cancel;
}

it('holds a navigation away from unsaved work for the prompt', async () => {
	render(UnsavedChangesGuard, { dirty: true });

	expect(navigation(false)).toHaveBeenCalledOnce();
	await expect.element(page.getByRole('dialog')).toBeInTheDocument();
});

it('lets a shallow navigation through, as it keeps the page and its form', async () => {
	// The camera's full-screen view stacks a shallow entry while the form stays
	// mounted beneath it: prompting there would refuse to open the camera.
	render(UnsavedChangesGuard, { dirty: true });

	expect(navigation(true)).not.toHaveBeenCalled();
	await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});
