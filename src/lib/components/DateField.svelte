<script lang="ts">
	import {
		type DateValue,
		DateFormatter,
		getLocalTimeZone,
		parseDate
	} from '@internationalized/date';
	import CalendarBlankIcon from 'phosphor-svelte/lib/CalendarBlankIcon';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';

	// Wrapper around shadcn-svelte's Calendar in a Popover. Keeps the verbose picker
	// markup out of the form and exposes a hidden <input> so the native POST still
	// sees `name=YYYY-MM-DD`.
	let {
		name,
		label,
		value: initial = ''
	}: { name: string; label: string; value?: string } = $props();

	const df = new DateFormatter('en-US', { dateStyle: 'long' });

	// CalendarDate; `.toString()` yields the ISO `YYYY-MM-DD` the server expects.
	// svelte-ignore state_referenced_locally
	let value = $state<DateValue | undefined>(initial ? parseDate(initial) : undefined);
	const iso = $derived(value?.toString() ?? '');
</script>

<div class="flex flex-col gap-1.5">
	<span class="block text-sm font-medium text-gray-700">{label}</span>
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					variant="outline"
					class={cn(
						'w-full justify-start text-start font-normal',
						!value && 'text-muted-foreground'
					)}
					{...props}
				>
					<CalendarBlankIcon class="me-2 size-4" />
					{value ? df.format(value.toDate(getLocalTimeZone())) : 'Pick a date'}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-auto p-0">
			<Calendar bind:value type="single" captionLayout="dropdown" />
		</Popover.Content>
	</Popover.Root>
</div>

<!-- Resolved ISO date the server action reads. -->
<input type="hidden" {name} value={iso} />
