<script lang="ts">
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import CalendarBlankIcon from 'phosphor-svelte/lib/CalendarBlankIcon';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import {
		DATE_PRECISIONS,
		MONTH_NAMES,
		PRECISION_LABELS,
		type DatePrecision,
		daysInMonth,
		formatPartialDate,
		formatPartialDateValue,
		parsePartialDate
	} from '$lib/partialDate';

	// Wrapper around shadcn-svelte's Calendar in a Popover. Keeps the verbose picker
	// markup out of the form and exposes a hidden <input> so the native POST still
	// sees `name=YYYY-MM-DD`.
	//
	// With `allowPartial`, the field also accepts dates that are only known to the
	// month or the year, and emits the correspondingly truncated `YYYY-MM` /
	// `YYYY` string (see $lib/partialDate). Fields describing a single real
	// happening — an event's date — leave it off and stay day-precise.
	let {
		name,
		label,
		required = false,
		value: initial = '',
		allowPartial = false,
		onChange
	}: {
		name: string;
		label: string;
		required?: boolean;
		value?: string;
		/** Offer month- and year-precision alongside an exact day. */
		allowPartial?: boolean;
		/** Fires with the resolved date whenever the pick changes. */
		onChange?: (iso: string) => void;
	} = $props();

	// `value` and `allowPartial` seed the picker; from then on the picker owns its
	// own state, so both are read once here on purpose.
	// svelte-ignore state_referenced_locally
	const seed = parsePartialDate(initial);
	// svelte-ignore state_referenced_locally
	const seedPrecision: DatePrecision = allowPartial ? (seed?.precision ?? 'day') : 'day';
	const now = new Date();

	// Year/month/day are kept whole even at a coarser precision, so switching
	// Year → Month → Exact day and back never discards what was already picked;
	// only the emitted string is truncated.
	let precision = $state<DatePrecision>(seedPrecision);
	let year = $state(seed?.year ?? now.getFullYear());
	let month = $state(seed?.month ?? now.getMonth() + 1);
	let day = $state(seed?.day ?? 1);
	// Distinguishes "not chosen yet" from "chose today" — an empty hidden input is
	// what the required-date validation keys off.
	let picked = $state(seed !== null);

	// Twelve years a page, so the year grid matches the month grid's 3×4 shape.
	const YEARS_PER_PAGE = 12;
	let yearPage = $state(
		Math.floor((seed?.year ?? now.getFullYear()) / YEARS_PER_PAGE) * YEARS_PER_PAGE
	);
	const yearOptions = $derived(
		Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPage + index)
	);

	const iso = $derived(picked ? formatPartialDateValue(year, month, day, precision) : '');

	// The calendar reflects the pick only when the pick is actually day-precise;
	// at month/year precision there is no single day to highlight.
	const calendarValue = $derived(
		picked && precision === 'day' ? new CalendarDate(year, month, day) : undefined
	);
	// Which month the calendar opens on. Owned as state (not derived) so paging
	// around inside the calendar isn't yanked back on every re-render.
	let calendarPlaceholder = $state<DateValue>(
		new CalendarDate(seed?.year ?? now.getFullYear(), seed?.month ?? now.getMonth() + 1, 1)
	);

	/** Adopt a year/month, keeping the day in range (e.g. Jan 31 → Feb 28). */
	function setMonth(nextYear: number, nextMonth: number) {
		year = nextYear;
		month = nextMonth;
		day = Math.min(day, daysInMonth(year, month));
		calendarPlaceholder = new CalendarDate(year, month, 1);
	}

	function choosePrecision(next: DatePrecision) {
		precision = next;
		// Switching precision is itself a pick — "some time in 2019" is an answer.
		picked = true;
		if (next === 'year') yearPage = Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
	}

	// Surface the resolved value to a parent that needs it (e.g. to gate a submit).
	$effect(() => {
		onChange?.(iso);
	});

	const paneButton = 'h-9 w-full rounded-md text-sm transition';
</script>

<div class="flex flex-col gap-1.5">
	<span class="block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600" title="Required" aria-label="required">*</span>
		{/if}
	</span>
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					variant="outline"
					class={cn(
						'w-full justify-start text-start font-normal',
						!picked && 'text-muted-foreground'
					)}
					{...props}
				>
					<CalendarBlankIcon class="me-2 size-4" />
					{picked ? formatPartialDate(iso) : 'Pick a date'}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-auto p-0">
			{#if allowPartial}
				<!-- How precisely the date is known. Coarse to fine, so the row reads as a
				     zoom level rather than a set of unrelated modes. -->
				<div
					class="flex gap-1 border-b p-1"
					role="group"
					aria-label="How precisely this date is known"
				>
					{#each DATE_PRECISIONS as option (option)}
						<Button
							variant={precision === option ? 'secondary' : 'ghost'}
							size="sm"
							class="flex-1"
							aria-pressed={precision === option}
							onclick={() => choosePrecision(option)}
						>
							{PRECISION_LABELS[option]}
						</Button>
					{/each}
				</div>
			{/if}

			{#if precision === 'day'}
				<Calendar
					type="single"
					value={calendarValue}
					bind:placeholder={calendarPlaceholder}
					captionLayout="dropdown"
					onValueChange={(next: DateValue | undefined) => {
						if (!next) return;
						year = next.year;
						month = next.month;
						day = next.day;
						picked = true;
					}}
				/>
			{:else if precision === 'month'}
				<div class="w-64 p-3">
					<div class="mb-2 flex items-center justify-between">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Previous year"
							onclick={() => setMonth(year - 1, month)}
						>
							<CaretLeftIcon />
						</Button>
						<span class="text-sm font-medium">{year}</span>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Next year"
							onclick={() => setMonth(year + 1, month)}
						>
							<CaretRightIcon />
						</Button>
					</div>
					<div class="grid grid-cols-3 gap-1">
						{#each MONTH_NAMES as monthName, index (monthName)}
							{@const selected = picked && month === index + 1}
							<button
								type="button"
								class={cn(
									paneButton,
									selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
								)}
								aria-pressed={selected}
								onclick={() => {
									setMonth(year, index + 1);
									picked = true;
								}}
							>
								{monthName.slice(0, 3)}
							</button>
						{/each}
					</div>
				</div>
			{:else}
				<div class="w-64 p-3">
					<div class="mb-2 flex items-center justify-between">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Earlier years"
							onclick={() => (yearPage -= YEARS_PER_PAGE)}
						>
							<CaretLeftIcon />
						</Button>
						<span class="text-sm font-medium">
							{yearPage}–{yearPage + YEARS_PER_PAGE - 1}
						</span>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Later years"
							onclick={() => (yearPage += YEARS_PER_PAGE)}
						>
							<CaretRightIcon />
						</Button>
					</div>
					<div class="grid grid-cols-3 gap-1">
						{#each yearOptions as option (option)}
							{@const selected = picked && year === option}
							<button
								type="button"
								class={cn(
									paneButton,
									selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
								)}
								aria-pressed={selected}
								onclick={() => {
									setMonth(option, month);
									picked = true;
								}}
							>
								{option}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</Popover.Content>
	</Popover.Root>
	{#if allowPartial}
		<p class="text-xs text-gray-500">
			Not sure of the exact day? Record just the month, or just the year.
		</p>
	{/if}
</div>

<!-- Resolved date the server action reads: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. -->
<input type="hidden" {name} value={iso} />
