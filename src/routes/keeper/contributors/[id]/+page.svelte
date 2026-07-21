<script lang="ts">
	import { enhance } from '$app/forms';
	import BackButton from '$lib/components/BackButton.svelte';
	import { programAreaMeta } from '$lib/programAreas';
	import CalendarBlankIcon from 'phosphor-svelte/lib/CalendarBlankIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PaperclipIcon from 'phosphor-svelte/lib/PaperclipIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const person = $derived(data.person);
	const events = $derived(data.events);
	const artefacts = $derived(data.artefacts);

	// Name editing: read-only by default, unlocked by the edit button.
	let editing = $state(false);
	let draft = $state(person.name);
	let submitting = $state(false);
	// Save only offered once the name actually changed to something non-empty.
	const dirty = $derived(draft.trim().length > 0 && draft.trim() !== person.name);

	function startEditing() {
		draft = person.name;
		editing = true;
	}

	function cancelEditing() {
		draft = person.name;
		editing = false;
	}

	// Render dates like "July 4, 2023"; fall back to raw string if unparseable.
	function formatDate(value: string): string {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<svelte:head>
	<title>{person.name} · Contributors · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			{#if data.user.role === 'admin'}
				<!-- Inline rename, moved here from the roster; submit sends only the new name. -->
				{#if editing}
					<!-- Form spans header so the save/cancel controls can sit top-right, name below. -->
					<form
						method="POST"
						action="?/rename"
						use:enhance={() => {
							submitting = true;
							return async ({ update, result }) => {
								if (result.type === 'success' || result.type === 'redirect') editing = false;
								await update();
								submitting = false;
							};
						}}
					>
						<div class="flex items-center justify-between gap-2">
							<BackButton />
							<div class="flex shrink-0 items-center gap-2">
								{#if dirty}
									<button
										type="submit"
										disabled={submitting}
										aria-busy={submitting}
										aria-label="Save name"
										title="Save name"
										class="rounded-full border border-gray-200 bg-white/60 p-2 text-gray-600 transition hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{#if submitting}
											<CircleNotchIcon size={16} class="shrink-0 animate-spin" />
										{:else}
											<CheckIcon size={16} />
										{/if}
									</button>
								{/if}
								<button
									type="button"
									onclick={cancelEditing}
									aria-label="Cancel editing"
									title="Cancel editing"
									class="rounded-full border border-gray-200 bg-white/60 p-2 text-gray-600 transition hover:bg-white hover:text-gray-900"
								>
									<XIcon size={16} />
								</button>
							</div>
						</div>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							name="name"
							bind:value={draft}
							autofocus
							aria-label="Contributor name"
							class="mt-3 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-2xl font-semibold tracking-tight text-[#14120f] focus:border-gray-400 focus:ring-1 focus:ring-gray-200 focus:outline-none"
						/>
					</form>
				{:else}
					<div class="flex items-center justify-between gap-2">
						<BackButton />
						<button
							type="button"
							onclick={startEditing}
							aria-label="Edit name"
							title="Edit name"
							class="shrink-0 rounded-full border border-gray-200 bg-white/60 p-2 text-gray-600 transition hover:bg-white hover:text-gray-900"
						>
							<PencilSimpleIcon size={16} />
						</button>
					</div>
					<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">{person.name}</h1>
				{/if}
				{#if form?.error}
					<p class="mt-1 px-2 text-sm text-red-600">{form.error}</p>
				{/if}
			{:else}
				<BackButton />
				<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">{person.name}</h1>
			{/if}
			<p class="mt-1 px-2 text-sm text-gray-600">
				<!-- Counts, low emphasis, per the pill convention. -->
				{artefacts.length}
				{artefacts.length === 1 ? 'artefact' : 'artefacts'} · {events.length}
				{events.length === 1 ? 'event' : 'events'}
			</p>
		</header>

		<!-- Events they host. -->
		<section>
			<h2 class="text-xs font-medium tracking-wide text-gray-500 uppercase">
				Events <span class="text-gray-400">· {events.length}</span>
			</h2>
			{#if events.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No events hosted by {person.name}.
				</p>
			{:else}
				<ul class="mt-3 space-y-4">
					{#each events as item, i (item.id)}
						<li>
							<article
								class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
								{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<!-- Stretched link: the ::after overlay makes the whole card open the event page. -->
										<h3 class="font-medium break-words">
											<a
												href="/keeper/events/{item.id}"
												class="after:absolute after:inset-0 after:z-[1]"
											>
												{item.title}
											</a>
										</h3>
										<p class="mt-0.5 text-sm text-gray-500">
											{formatDate(item.date)}{#if item.time}
												· {item.time}{/if}{#if item.location}
												· {item.location}{/if}
										</p>
									</div>
									{#if item.series}
										<span
											class="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
											title="Part of the “{item.series}” series"
										>
											{item.series}
										</span>
									{/if}
								</div>
								{#if item.hosts.length > 1 || item.mayHaveException}
									<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
										{#if item.hosts.length > 1}
											<span class="text-sm text-gray-500">
												{item.hosts.join(', ')}
											</span>
										{/if}
										{#if item.mayHaveException}
											<span
												class="inline-flex items-center gap-1 text-xs text-amber-700"
												title={item.possibleExceptionDescription ?? 'Flagged for review'}
											>
												<WarningIcon size={13} weight="fill" />
												Needs review
											</span>
										{/if}
									</div>
								{/if}
							</article>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Artefacts they're the provenance of. -->
		<section class="mt-10">
			<h2 class="text-xs font-medium tracking-wide text-gray-500 uppercase">
				Artefacts <span class="text-gray-400">· {artefacts.length}</span>
			</h2>
			{#if artefacts.length === 0}
				<p
					class="mt-3 rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No artefacts from {person.name}.
				</p>
			{:else}
				<ul class="mt-3 space-y-4">
					{#each artefacts as item, i (item.id)}
						<li>
							<article
								class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5 transition hover:shadow-2xl
								{i % 2 === 0 ? 'rotate-[0.4deg]' : '-rotate-[0.35deg]'}"
							>
								<h3 class="font-medium break-words">
									<a href="/keeper/{item.id}" class="after:absolute after:inset-0 after:z-[1]">
										{item.artefact}
									</a>
								</h3>
								<p class="mt-0.5 text-sm text-gray-500">
									{#if item.date}{formatDate(item.date)}{/if}{#if item.event}{#if item.date}
											·
										{/if}<span class="inline-flex items-center gap-1">
											<CalendarBlankIcon size={13} />
											{item.event}
										</span>{/if}
								</p>
								{#if item.programArea.length > 0}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each item.programArea as area (area)}
											{@const Icon = programAreaMeta(area).icon}
											<span
												class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs {programAreaMeta(
													area
												).pill}"
											>
												<Icon size={13} weight="fill" />
												{area}
											</span>
										{/each}
									</div>
								{/if}
								{#if item.fileUrls.length > 0}
									<p class="mt-2 inline-flex items-center gap-1 text-xs text-gray-500">
										<PaperclipIcon size={13} />
										{item.fileUrls.length}
										{item.fileUrls.length === 1 ? 'file' : 'files'}
									</p>
								{/if}
							</article>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
