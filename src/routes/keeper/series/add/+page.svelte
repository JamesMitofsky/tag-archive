<script lang="ts">
	import { enhance } from '$app/forms';
	import BackButton from '$lib/components/BackButton.svelte';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { DAYS_OF_WEEK, createSeriesSuite, parseSeriesForm } from '$lib/validation/series';
	import { createValidator } from '$lib/validation/client.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import type { SeriesFormValues } from './+page.server';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const seriesError = $derived(form && 'seriesError' in form ? form.seriesError : undefined);
	const echoed = $derived(
		form && 'values' in form && form.values ? (form.values as SeriesFormValues) : undefined
	);
	const errors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);

	// Isomorphic validation: same vest suite here (live, per-field) and on the server.
	const validator = createValidator(createSeriesSuite(), () => errors);
	let formEl = $state<HTMLFormElement>();
	function revalidate() {
		if (formEl) validator.run(parseSeriesForm(new FormData(formEl)));
	}
	function markTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) validator.touch(target.name);
		revalidate();
	}

	// Name is the only field and it's required; track it so submit can gate on it.
	// svelte-ignore state_referenced_locally
	let name = $state(
		form && 'values' in form && form.values ? (form.values as SeriesFormValues).name : ''
	);

	// Optional default weekday; '' means none. Single-select — clicking the active
	// day clears it. A hidden input carries the value to the server.
	// svelte-ignore state_referenced_locally
	let defaultDayOfWeek = $state(
		form && 'values' in form && form.values
			? (form.values as SeriesFormValues).defaultDayOfWeek
			: ''
	);

	let submitting = $state(false);
	const canSubmit = $derived(name.trim().length > 0);

	// The weekday pills mutate a hidden input via state, so re-validate whenever the
	// tracked fields change.
	$effect(() => {
		void [name, defaultDayOfWeek];
		revalidate();
	});

	// Ink button, same graphite tone as the landing handwriting.
	const inkButton = 'bg-[#14120f] text-white transition hover:bg-[#33302a]';
</script>

<svelte:head>
	<title>New series · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex flex-col items-start gap-3">
			<BackButton />
		</header>

		<!-- The create form is a fresh sheet of paper, like the series pages. -->
		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="mb-1 text-2xl font-semibold tracking-tight text-gray-900">New series</h1>
			<p class="mb-6 text-sm text-gray-600">A banner that connects several events.</p>
			<form
				method="POST"
				action="?/createSeries"
				class="space-y-5"
				bind:this={formEl}
				oninput={revalidate}
				onchange={revalidate}
				onfocusout={markTouched}
				use:enhance={({ formData, cancel }) => {
					validator.revealAll();
					if (!validator.run(parseSeriesForm(formData))) {
						cancel();
						return;
					}
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<div>
					<label for="name" class="block text-sm font-medium text-gray-700">
						Name <span class="text-red-600" title="Required" aria-label="required">*</span>
					</label>
					<Input
						id="name"
						name="name"
						type="text"
						required
						maxlength={200}
						autocomplete="off"
						bind:value={name}
						placeholder="Music in the Garden"
						class="mt-1.5"
					/>
					<FieldError message={validator.error('name')} />
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
						placeholder="A recurring evening of live music among the trees"
						value={echoed?.description ?? ''}
						class="mt-1.5"
					/>
					<FieldError message={validator.error('description')} />
				</div>

				<!-- Optional defaults events under this banner can inherit. -->
				<fieldset class="space-y-5 border-t border-gray-200 pt-5">
					<legend class="text-sm font-medium text-gray-500">Event defaults</legend>

					<div>
						<span class="block text-sm font-medium text-gray-700">Default day of the week</span>
						<!-- Hidden input the server reads; '' when no day is chosen. -->
						<input type="hidden" name="defaultDayOfWeek" value={defaultDayOfWeek} />
						<div
							class="mt-1.5 flex flex-wrap gap-1.5"
							role="group"
							aria-label="Default day of the week"
						>
							{#each DAYS_OF_WEEK as day (day)}
								<button
									type="button"
									aria-pressed={defaultDayOfWeek === day}
									onclick={() => (defaultDayOfWeek = defaultDayOfWeek === day ? '' : day)}
									class="rounded-full border px-3 py-1.5 text-sm transition
									{defaultDayOfWeek === day
										? 'border-transparent bg-[#14120f] text-white'
										: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
								>
									{day.slice(0, 3)}
								</button>
							{/each}
						</div>
						<FieldError message={validator.error('defaultDayOfWeek')} />
					</div>

					<div>
						<label for="defaultTime" class="block text-sm font-medium text-gray-700">
							Default time
						</label>
						<Input
							id="defaultTime"
							name="defaultTime"
							type="text"
							maxlength={100}
							autocomplete="off"
							placeholder="6:00 PM – 8:00 PM"
							value={echoed?.defaultTime ?? ''}
							class="mt-1.5"
						/>
						<FieldError message={validator.error('defaultTime')} />
					</div>

					<div>
						<label for="frequency" class="block text-sm font-medium text-gray-700">
							Frequency
						</label>
						<Input
							id="frequency"
							name="frequency"
							type="text"
							maxlength={100}
							autocomplete="off"
							placeholder="4th Friday of every month"
							value={echoed?.frequency ?? ''}
							class="mt-1.5"
						/>
						<FieldError message={validator.error('frequency')} />
					</div>
				</fieldset>

				{#if seriesError && Object.keys(errors).length === 0}
					<p class="text-sm text-red-600" role="alert">{seriesError}</p>
				{/if}

				<button
					type="submit"
					disabled={!canSubmit || submitting}
					aria-busy={submitting}
					class="flex w-full items-center justify-center gap-2 rounded-sm py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 {inkButton}"
				>
					{#if submitting}
						<CircleNotchIcon size={18} class="animate-spin shrink-0" />
					{:else}
						<PlusIcon size={18} />
					{/if}
					Add series
				</button>
			</form>
		</section>
	</div>
</main>
