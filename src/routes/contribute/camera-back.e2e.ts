import { expect, test } from '@playwright/test';
import { mintPass, PASS_COOKIE } from '../../lib/access/pass';

// The camera's back gesture, through SvelteKit's real router: the full-screen
// view stacks shallow history entries of its own, and back must pop one of
// those, not leave the form. A component test can't show this, since it runs
// without the router whose popstate handling this depends on.

test.use({
	permissions: ['camera'],
	launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }
});

test.beforeEach(async ({ context, baseURL }) => {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error('Set BETTER_AUTH_SECRET to run the e2e tests');
	const { token } = await mintPass(secret, 'k');
	await context.addCookies([{ name: PASS_COOKIE, value: token, url: baseURL ?? '' }]);
});

async function openCamera(page: import('@playwright/test').Page) {
	await page.goto('/contribute');
	// Typed work makes the form's unsaved-changes guard live: opening the
	// camera must not trip it.
	await page.locator('textarea').first().fill('Typed before opening the camera');
	await page.getByRole('button', { name: 'Scan pages' }).click();
	const shutter = page.getByRole('button', { name: 'Capture page' });
	await expect(shutter).toBeEnabled();
	return shutter;
}

test('back closes the camera when nothing was shot, and stays on the form', async ({ page }) => {
	const shutter = await openCamera(page);

	await page.goBack();

	await expect(shutter).toBeHidden();
	await expect(page).toHaveURL(/\/contribute$/);
	await expect(page.locator('textarea').first()).toHaveValue('Typed before opening the camera');
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('back moves on to cropping once something is shot, then finishes', async ({ page }) => {
	const shutter = await openCamera(page);
	await shutter.click();
	await shutter.click();

	await page.goBack();
	await expect(page.getByText('Photo 1 of 2')).toBeVisible();

	await page.goBack();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page).toHaveURL(/\/contribute$/);
});
