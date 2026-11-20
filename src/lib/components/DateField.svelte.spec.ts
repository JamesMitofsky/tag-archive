import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DateField from './DateField.svelte';
import { UNDATED } from '#lib/partialDate.ts';

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
		await render(DateField, { name: 'date', label: 'Date' });

		await page.getByRole('button', { name: 'Pick a date' }).click();

		await expect.element(page.getByRole('grid')).toBeInTheDocument();
		expect(
			document.querySelectorAll('[aria-label="How precisely this date is known"]')
		).toHaveLength(0);
	});

	it('offers year, month and exact-day precision when partial dates are allowed', async () => {
		await render(DateField, { name: 'date', label: 'Date', allowPartial: true });

		await page.getByRole('button', { name: 'Pick a date' }).click();

		for (const label of ['Year', 'Month', 'Exact day']) {
			await expect.element(page.getByRole('button', { name: label, exact: true })).toBeVisible();
		}
	});

	it('submits a year-only date when only the year is known', async () => {
		await render(DateField, {
			name: 'date',
			label: 'Date',
			allowPartial: true,
			value: '2019-07-04'
		});

		await page.getByRole('button', { name: 'July 4, 2019' }).click();
		await page.getByRole('button', { name: 'Year', exact: true }).click();
		await page.getByRole('button', { name: '2021', exact: true }).click();

		expect(submittedValue()).toBe('2021');
		// Reads as the year alone — never "January 1, 2021", which would pass off a
		// guess as a recorded fact.
		expect(triggerLabel()).toBe('2021');
	});

	it('submits a month-precise date when only the month is known', async () => {
		await render(DateField, {
			name: 'date',
			label: 'Date',
			allowPartial: true,
			value: '2019-07-04'
		});

		await page.getByRole('button', { name: 'July 4, 2019' }).click();
		await page.getByRole('button', { name: 'Month', exact: true }).click();
		await page.getByRole('button', { name: 'Mar', exact: true }).click();

		expect(submittedValue()).toBe('2019-03');
		expect(triggerLabel()).toBe('March 2019');
	});

	it('keeps the finer parts through a precision round-trip', async () => {
		await render(DateField, {
			name: 'date',
			label: 'Date',
			allowPartial: true,
			value: '2019-07-04'
		});

		await page.getByRole('button', { name: 'July 4, 2019' }).click();
		await page.getByRole('button', { name: 'Year', exact: true }).click();
		expect(submittedValue()).toBe('2019');

		// Going back to the finer precision restores the month and day rather than
		// resetting them — the coarser pick only truncated what was emitted.
		await page.getByRole('button', { name: 'Exact day', exact: true }).click();
		expect(submittedValue()).toBe('2019-07-04');
	});

	it('submits nothing until a date is actually picked, so `required` can bite', async () => {
		await render(DateField, { name: 'date', label: 'Date', allowPartial: true, required: true });

		expect(submittedValue()).toBe('');
	});

	it('seeds from an existing partial value without inventing a day', async () => {
		await render(DateField, { name: 'date', label: 'Date', allowPartial: true, value: '2019-07' });

		await expect.element(page.getByRole('button', { name: 'July 2019' })).toBeVisible();
		expect(submittedValue()).toBe('2019-07');
	});

	// The undated tests poll rather than read once: Svelte flushes DOM updates
	// asynchronously after a click, so a synchronous read can race the update.
	it('offers "No date" only when undated artefacts are allowed', async () => {
		await render(DateField, { name: 'date', label: 'Date', allowPartial: true });
		await page.getByRole('button', { name: 'Pick a date' }).click();
		await expect.element(page.getByRole('button', { name: 'Year', exact: true })).toBeVisible();
		expect(page.getByRole('button', { name: 'No date', exact: true }).elements()).toHaveLength(0);
	});

	it('submits the undated token when "No date" is chosen', async () => {
		await render(DateField, {
			name: 'date',
			label: 'Date',
			allowPartial: true,
			allowUndated: true
		});

		await page.getByRole('button', { name: 'Pick a date' }).click();
		await page.getByRole('button', { name: 'No date', exact: true }).click();

		await expect.poll(() => submittedValue()).toBe(UNDATED);
		await expect.poll(triggerLabel).toBe('No date');
	});

	it('still submits nothing while untouched, so a forgotten date is caught', async () => {
		await render(DateField, {
			name: 'date',
			label: 'Date',
			allowPartial: true,
			allowUndated: true
		});
		expect(submittedValue()).toBe('');
	});

	it('restores the earlier pick when leaving "No date"', async () => {
		await render(DateField, {
			name: 'date',
			label: 'Date',
			allowPartial: true,
			allowUndated: true,
			value: '2019-07'
		});

		await page.getByRole('button', { name: 'July 2019' }).click();
		await page.getByRole('button', { name: 'No date', exact: true }).click();
		await expect.poll(() => submittedValue()).toBe(UNDATED);

		// "No date" is a complete answer, so it closed the picker.
		await page.getByRole('button', { name: 'No date', exact: true }).click();
		await page.getByRole('button', { name: 'Month', exact: true }).click();
		await expect.poll(() => submittedValue()).toBe('2019-07');
	});

	it('reopens an undated artefact on "No date"', async () => {
		await render(DateField, {
			name: 'date',
			label: 'Date',
			allowPartial: true,
			allowUndated: true,
			value: UNDATED
		});

		await expect.poll(triggerLabel).toBe('No date');
		await expect.poll(() => submittedValue()).toBe(UNDATED);
	});

	// Closing is polled: the popover leaves the DOM once its exit transition ends.
	describe('closing on a pick', () => {
		const isOpen = () => document.querySelector('[data-popover-content]') !== null;

		it('closes once a day is picked', async () => {
			await render(DateField, { name: 'date', label: 'Date', value: '2019-07-04' });

			await page.getByRole('button', { name: 'July 4, 2019' }).click();
			await expect.poll(isOpen).toBe(true);
			await page.getByRole('button', { name: 'Friday, July 12, 2019' }).click();

			await expect.poll(() => submittedValue()).toBe('2019-07-12');
			await expect.poll(isOpen).toBe(false);
		});

		it('closes, keeping the date, when the day already picked is chosen again', async () => {
			await render(DateField, { name: 'date', label: 'Date', value: '2019-07-04' });

			await page.getByRole('button', { name: 'July 4, 2019' }).click();
			await expect.poll(isOpen).toBe(true);
			await page.getByRole('button', { name: 'Thursday, July 4, 2019' }).click();

			await expect.poll(isOpen).toBe(false);
			expect(submittedValue()).toBe('2019-07-04');
		});

		it('closes once "No date" is chosen', async () => {
			await render(DateField, {
				name: 'date',
				label: 'Date',
				allowPartial: true,
				allowUndated: true
			});

			await page.getByRole('button', { name: 'Pick a date' }).click();
			await expect.poll(isOpen).toBe(true);
			await page.getByRole('button', { name: 'No date', exact: true }).click();

			await expect.poll(() => submittedValue()).toBe(UNDATED);
			await expect.poll(isOpen).toBe(false);
		});

		it('closes once a month or a year is picked', async () => {
			await render(DateField, {
				name: 'date',
				label: 'Date',
				allowPartial: true,
				value: '2019-07'
			});

			await page.getByRole('button', { name: 'July 2019' }).click();
			await page.getByRole('button', { name: 'Mar', exact: true }).click();
			await expect.poll(isOpen).toBe(false);

			await page.getByRole('button', { name: 'March 2019' }).click();
			await page.getByRole('button', { name: 'Year', exact: true }).click();
			// Choosing a precision is not yet a date, so the picker stays up for one.
			await expect.poll(isOpen).toBe(true);
			await page.getByRole('button', { name: '2021', exact: true }).click();
			await expect.poll(isOpen).toBe(false);
		});
	});
});
