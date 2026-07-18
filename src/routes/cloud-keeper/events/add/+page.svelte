<script lang="ts">
	import { enhance } from '$app/forms';
	import BackButton from '$lib/components/BackButton.svelte';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import DateField from '$lib/components/DateField.svelte';
	import ComboField from '$lib/components/ComboField.svelte';
	import TagsField from '$lib/components/TagsField.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { EventFormValues } from './+page.server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const eventError = $derived(form && 'eventError' in form ? form.eventError : undefined);
	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as EventFormValues) : undefined
	);

	// Host tags — client state survives an enhance re-render, so seed once from
	// any echoed (comma-separated) value left by a failed submit.
	// svelte-ignore state_referenced_locally
	let hostTags = $state<string[]>(
		form && 'values' in form && form.values
			? (form.values as EventFormValues).hosts
					.split(',')
					.map((name) => name.trim())
					.filter(Boolean)
			: []
	);

	// Title + date are required; track them so submit can gate on both.
	// svelte-ignore state_referenced_locally
	let title = $state(
		form && 'values' in form && form.values ? (form.values as EventFormValues).title : ''
	);
	// svelte-ignore state_referenced_locally
	let date = $state(
		form && 'values' in form && form.values ? (form.values as EventFormValues).date : ''
	);

	const canSubmit = $derived(title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date));

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>New event · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex flex-col items-start gap-3">
			<BackButton href="/cloud-keeper/events" ariaLabel="Back to Events" />
		</header>

		<!-- The create form is a fresh sheet of paper, like the event pages. -->
		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="mb-6 text-2xl font-semibold tracking-tight text-gray-900">New event</h1>
			<form method="POST" action="?/createEvent" class="space-y-5" use:enhance>
				<div>
					<label for="title" class="block text-sm font-medium text-gray-700">
						Title <span class="text-red-600" title="Required" aria-label="required">*</span>
					</label>
					<Input
						id="title"
						name="title"
						type="text"
						required
						maxlength={200}
						autocomplete="off"
						bind:value={title}
						placeholder="Music in the Garden"
						class="mt-1.5"
					/>
				</div>

				<!-- DateField owns the hidden `date` input the server reads; onChange feeds the
				     submit gate since date is required. -->
				<DateField name="date" label="Date *" value={date} onChange={(iso) => (date = iso)} />

				<div>
					<label for="time" class="block text-sm font-medium text-gray-700">Time</label>
					<Input
						id="time"
						name="time"
						type="text"
						maxlength={100}
						autocomplete="off"
						placeholder="11:00 AM – 11:30 AM"
						value={echoed?.time ?? ''}
						class="mt-1.5"
					/>
				</div>

				<div>
					<ComboField
						name="series"
						label="Series"
						placeholder="Search or add a series"
						options={data.series.map((s) => s.name)}
						value={echoed?.series ?? ''}
					/>
				</div>

				<div>
					<ComboField
						name="location"
						label="Location (other than the garden)"
						placeholder="Search or add a location"
						options={[]}
						value={echoed?.location ?? ''}
					/>
				</div>

				<div>
					<TagsField
						name="hosts"
						label="Hosts"
						placeholder="Johnny B. Good"
						bind:value={hostTags}
					/>
					<p class="mt-1 text-xs text-gray-500">Press Enter to add</p>
				</div>

				<div>
					<label for="description" class="block text-sm font-medium text-gray-700">
						Description
					</label>
					<Textarea
						id="description"
						name="description"
						rows={3}
						maxlength={2000}
						placeholder="Another day full of dancing and trees"
						value={echoed?.description ?? ''}
						class="mt-1.5"
					/>
				</div>

				<div>
					<label for="url" class="block text-sm font-medium text-gray-700">Source URL</label>
					<Input
						id="url"
						name="url"
						type="url"
						autocomplete="off"
						placeholder="https://example.org/event"
						value={echoed?.url ?? ''}
						class="mt-1.5"
					/>
				</div>

				{#if eventError}
					<p class="text-sm text-red-600" role="alert">{eventError}</p>
				{/if}

				<button
					type="submit"
					disabled={!canSubmit}
					class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
				>
					<PlusIcon size={18} />
					Add event
				</button>
			</form>
		</section>
	</div>
</main>
