import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DateField from './DateField.svelte';

/** The hidden input is what a native POST actually submits. */
function submittedValue(name = 'date'): string {
	const input = document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
	return input?.value ?? '';
}

/**
 * What the closed field reads as. Queried off the trigger rather than by role +
 * name, because the label and the option that produced it are both buttons
 * reading e.g. "2021" while the popover is open.
 */
function triggerLabel(): string {
	return document.querySelector('[data-popover-trigger]')?.textContent?.trim() ?? '';
}

describe('DateField.svelte', () => {
	it('stays day-precise by default — no precision choice is offered', async () => {
		render(DateField, { name: 'date', label: 'Date' });

		await page.getByRole('button', { name: 'Pick a date' }).click();

		await expect.element(page.getByRole('grid')).toBeInTheDocument();
		expect(
			document.querySelectorAll('[aria-label="How precisely this date is known"]')
		).toHaveLength(0);
	});

	it('offers year, month and exact-day precision when partial dates are allowed', async () => {
		render(DateField, { name: 'date', label: 'Date', allowPartial: true });

		await page.getByRole('button', { name: 'Pick a date' }).click();

		for (const label of ['Year', 'Month', 'Exact day']) {
			await expect.element(page.getByRole('button', { name: label, exact: true })).toBeVisible();
		}
	});

	it('submits a year-only date when only the year is known', async () => {
		render(DateField, { name: 'date', label: 'Date', allowPartial: true, value: '2019-07-04' });

		await page.getByRole('button', { name: 'July 4, 2019' }).click();
		await page.getByRole('button', { name: 'Year', exact: true }).click();
		await page.getByRole('button', { name: '2021', exact: true }).click();

		expect(submittedValue()).toBe('2021');
		// Reads as the year alone — never "January 1, 2021", which would pass off a
		// guess as a recorded fact.
		expect(triggerLabel()).toBe('2021');
	});

	it('submits a month-precise date when only the month is known', async () => {
		render(DateField, { name: 'date', label: 'Date', allowPartial: true, value: '2019-07-04' });

		await page.getByRole('button', { name: 'July 4, 2019' }).click();
		await page.getByRole('button', { name: 'Month', exact: true }).click();
		await page.getByRole('button', { name: 'Mar', exact: true }).click();

		expect(submittedValue()).toBe('2019-03');
		expect(triggerLabel()).toBe('March 2019');
	});

	it('keeps the finer parts through a precision round-trip', async () => {
		render(DateField, { name: 'date', label: 'Date', allowPartial: true, value: '2019-07-04' });

		await page.getByRole('button', { name: 'July 4, 2019' }).click();
		await page.getByRole('button', { name: 'Year', exact: true }).click();
		expect(submittedValue()).toBe('2019');

		// Going back to the finer precision restores the month and day rather than
		// resetting them — the coarser pick only truncated what was emitted.
		await page.getByRole('button', { name: 'Exact day', exact: true }).click();
		expect(submittedValue()).toBe('2019-07-04');
	});

	it('submits nothing until a date is actually picked, so `required` can bite', async () => {
		render(DateField, { name: 'date', label: 'Date', allowPartial: true, required: true });

		expect(submittedValue()).toBe('');
	});

	it('seeds from an existing partial value without inventing a day', async () => {
		render(DateField, { name: 'date', label: 'Date', allowPartial: true, value: '2019-07' });

		await expect.element(page.getByRole('button', { name: 'July 2019' })).toBeVisible();
		expect(submittedValue()).toBe('2019-07');
	});
});
