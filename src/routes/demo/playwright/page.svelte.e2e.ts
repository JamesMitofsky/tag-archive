import { expect, test } from '@playwright/test';
import { mintPass, PASS_COOKIE } from '../../../lib/access/pass';

// The whole site sits behind the access gate ($lib/access/gate): hold a pass,
// signed with the same secret the preview server runs with.
test.beforeEach(async ({ context, baseURL }) => {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error('Set BETTER_AUTH_SECRET to run the e2e tests');
	const { token } = await mintPass(secret, 'k');
	await context.addCookies([{ name: PASS_COOKIE, value: token, url: baseURL ?? '' }]);
});

test('has expected h1', async ({ page }) => {
	await page.goto('/demo/playwright');
	await expect(page.locator('h1')).toBeVisible();
});
