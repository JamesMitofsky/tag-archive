<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance, type SubmitFunction } from '$app/forms';
	import BackButton from '#lib/components/BackButton.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import ArchiveIcon from 'phosphor-svelte/lib/ArchiveIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { formatDate } from '#lib/formatDate.ts';
	import { roleLabel } from '#lib/roles.ts';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// What is ticked: seeded from what is stored, and seeded afresh from it each
	// time the page's data reloads (after a save, the stored choice).
	const chosen = $derived(new SvelteSet(data.choices.filter((c) => c.chosen).map((c) => c.id)));
	let query = $state('');
	let saving = $state(false);

	const needle = $derived(query.trim().toLowerCase());
	/** Whether a row shows under the filter. Rows it hides stay in the form, so they still submit. */
	function shows(choice: PageData['choices'][number]): boolean {
		if (!needle) return true;
		return [String(choice.id), choice.artefact, choice.event ?? '', choice.date ?? ''].some(
			(field) => field.toLowerCase().includes(needle)
		);
	}
	const shownCount = $derived(data.choices.filter(shows).length);

	function toggle(id: number, on: boolean) {
		if (on) chosen.add(id);
		else chosen.delete(id);
	}

	const submit: SubmitFunction = () => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	};

	const quietButton =
		'inline-flex items-center gap-1.5 rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';
</script>

<svelte:head>
	<title>{data.account.name} · Accounts · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl space-y-6">
		<BackButton href="/keeper/settings/accounts" label="Accounts" />

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
				<ArchiveIcon size={24} class="text-gray-500" />
				<span class="min-w-0 truncate">{data.account.name}</span>
			</h1>
			<p class="mt-1 truncate text-sm text-gray-600">{data.account.email}</p>

			{#if !data.isListener}
				<p class="mt-4 text-sm text-gray-700">
					This account is {roleLabel(data.account.role)}, so it isn’t held to chosen artefacts. Make
					it a listener at Accounts to choose what it can view.
				</p>
			{:else}
				<p class="mt-4 text-sm text-gray-600">
					A listener views only the artefacts ticked here, from anywhere, and nothing else of the
					Archive. Tapping the Cube still opens everything to them. Changes reach them the next time
					their page loads.
				</p>

				<form method="POST" action="?/save" use:enhance={submit} class="mt-6">
					<label class="sr-only" for="artefact-filter">Filter artefacts</label>
					<input
						id="artefact-filter"
						type="search"
						bind:value={query}
						placeholder="Filter by number, title, event or date"
						class="w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none"
					/>

					<ul class="mt-4 divide-y divide-gray-200 border-y border-gray-200">
						{#each data.choices as choice (choice.id)}
							<li hidden={!shows(choice)}>
								<label class="flex cursor-pointer items-start gap-3 py-3">
									<input
										type="checkbox"
										name="artefact"
										value={choice.id}
										checked={chosen.has(choice.id)}
										onchange={(e) => toggle(choice.id, e.currentTarget.checked)}
										class="mt-1 size-4 shrink-0 accent-gray-800"
									/>
									<span class="min-w-0 flex-1">
										<span class="block font-medium text-gray-900">
											<span class="text-gray-500 tabular-nums">#{choice.id}</span>
											{choice.artefact}
										</span>
										{#if choice.event || choice.date}
											<span class="block text-sm text-gray-600">
												{[choice.event, choice.date && formatDate(choice.date)]
													.filter(Boolean)
													.join(' · ')}
											</span>
										{/if}
									</span>
								</label>
							</li>
						{:else}
							<li class="py-4 text-sm text-gray-600">The Archive has no artefacts yet.</li>
						{/each}
					</ul>
					{#if data.choices.length > 0 && shownCount === 0}
						<p class="py-4 text-sm text-gray-600">No artefact matches “{query}”.</p>
					{/if}

					<div
						class="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 bg-white/95 py-3"
					>
						<p class="text-sm text-gray-700" aria-live="polite">
							{chosen.size === 1 ? '1 artefact chosen' : `${chosen.size} artefacts chosen`}
						</p>
						<button type="submit" disabled={saving} aria-busy={saving} class={quietButton}>
							{#if saving}
								<CircleNotchIcon size={14} class="shrink-0 animate-spin" />
							{/if}
							Save
						</button>
					</div>

					{#if form && 'saved' in form}
						<p class="flex items-center gap-1.5 text-sm text-green-800" role="status">
							<CheckCircleIcon size={16} weight="fill" />
							Saved
						</p>
					{:else if form && 'error' in form}
						<FieldError message={form.error} />
					{/if}
				</form>
			{/if}
		</article>
	</div>
</main>
