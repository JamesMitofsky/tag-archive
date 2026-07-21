<script lang="ts">
	import { enhance } from '$app/forms';
	import BackButton from '$lib/components/BackButton.svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import DateField from '$lib/components/DateField.svelte';
	import ComboField from '$lib/components/ComboField.svelte';
	import TagsField from '$lib/components/TagsField.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createEventSuite, parseEventForm } from '$lib/validation/event';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import type { EventFormValues } from './+page.server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const eventError = $derived(form && 'eventError' in form ? form.eventError : undefined);
	// Kit flattens the action-data union, so restore the echoed values' shape.
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as EventFormValues) : undefined
	);
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);

	// Isomorphic validation: same vest suite here (live, per-field) and on the server.
	const validator = createValidator(createEventSuite(), () => errors);
	let formEl = $state<HTMLFormElement>();
	function revalidate() {
		if (formEl) validator.run(parseEventForm(new FormData(formEl)));
	}
	function markTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) validator.touch(target.name);
		revalidate();
	}

	// Seed each field from a failed submit's echoed values, else the loaded event.
	// svelte-ignore state_referenced_locally
	const seed = form && 'values' in form && form.values ? (form.values as EventFormValues) : null;

	// Host tags — seed from the echoed (comma-separated) value or the event.
	// svelte-ignore state_referenced_locally
	let hostTags = $state<string[]>(
		seed
			? seed.hosts
					.split(',')
					.map((name) => name.trim())
					.filter(Boolean)
			: [...data.event.hosts]
	);

	// Title + date are required; track them so submit can gate on both.
	// svelte-ignore state_referenced_locally
	let title = $state(seed ? seed.title : data.event.title);
	// svelte-ignore state_referenced_locally
	let date = $state(seed ? seed.date : data.event.date);

	const canSubmit = $derived(title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date));

	// Combos and tags mutate state without always firing a bubbling input event, so
	// re-validate whenever any tracked field changes.
	$effect(() => {
		void [title, date, hostTags];
		revalidate();
	});

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>Edit {data.event.title} · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex flex-col items-start gap-3">
			<BackButton href="/keeper/events/{data.event.id}" ariaLabel="Back to event" />
		</header>

		<!-- The edit form is a sheet of paper, like the event pages. -->
		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="mb-6 text-2xl font-semibold tracking-tight text-gray-900">Edit event</h1>
			<form
				method="POST"
				action="?/updateEvent"
				class="space-y-5"
				bind:this={formEl}
				oninput={revalidate}
				onchange={revalidate}
				onfocusout={markTouched}
				use:enhance={({ formData, cancel }) => {
					validator.revealAll();
					if (!validator.run(parseEventForm(formData))) cancel();
				}}
			>
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
					<FieldError message={validator.error('title')} />
				</div>

				<!-- DateField owns the hidden `date` input the server reads; onChange feeds the
				     submit gate since date is required. -->
				<div>
					<DateField
						name="date"
						label="Date *"
						value={date}
						onChange={(iso) => {
							date = iso;
							validator.touch('date');
						}}
					/>
					<FieldError message={validator.error('date')} />
				</div>

				<div>
					<label for="time" class="block text-sm font-medium text-gray-700">Time</label>
					<Input
						id="time"
						name="time"
						type="text"
						maxlength={100}
						autocomplete="off"
						placeholder="11:00 AM – 11:30 AM"
						value={echoed?.time ?? data.event.time ?? ''}
						class="mt-1.5"
					/>
					<FieldError message={validator.error('time')} />
				</div>

				<div>
					<ComboField
						name="series"
						label="Series"
						placeholder="Search or add a series"
						options={data.series.map((s) => s.name)}
						value={echoed?.series ?? data.event.series ?? ''}
					/>
					<FieldError message={validator.error('series')} />
				</div>

				<div>
					<ComboField
						name="location"
						label="Location (other than the garden)"
						placeholder="Search or add a location"
						options={[]}
						value={echoed?.location ?? data.event.location ?? ''}
					/>
					<FieldError message={validator.error('location')} />
				</div>

				<div>
					<TagsField
						name="hosts"
						label="Hosts"
						placeholder="Johnny B. Good"
						bind:value={hostTags}
					/>
					<p class="mt-1 text-xs text-gray-500">Press Enter to add</p>
					<FieldError message={validator.error('hosts')} />
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
						value={echoed?.description ?? data.event.description ?? ''}
						class="mt-1.5"
					/>
					<FieldError message={validator.error('description')} />
				</div>

				<div>
					<label for="url" class="block text-sm font-medium text-gray-700">Source URL</label>
					<Input
						id="url"
						name="url"
						type="url"
						autocomplete="off"
						placeholder="https://example.org/event"
						value={echoed?.url ?? data.event.url ?? ''}
						class="mt-1.5"
					/>
					<FieldError message={validator.error('url')} />
				</div>

				{#if eventError && Object.keys(errors).length === 0}
					<p class="text-sm text-red-600 font-friendly" role="alert">{eventError}</p>
				{/if}

				<button
					type="submit"
					disabled={!canSubmit}
					class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
				>
					<CheckIcon size={18} />
					Save changes
				</button>
			</form>

			<!-- Delete lives on the edit view only; its own form so it doesn't submit the edits. -->
			<div class="mt-6 flex justify-end border-t border-gray-200 pt-5">
				<form
					method="POST"
					action="?/deleteEvent"
					use:enhance={({ cancel }) => {
						if (!confirm(`Delete "${data.event.title}"? This cannot be undone.`)) cancel();
						return async ({ update }) => update();
					}}
				>
					<button
						type="submit"
						aria-label="Delete {data.event.title}"
						title="Delete event"
						class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-500 transition hover:bg-red-50 hover:text-red-600"
					>
						<TrashIcon size={18} />
						Delete
					</button>
				</form>
			</div>
		</section>
	</div>
</main>
