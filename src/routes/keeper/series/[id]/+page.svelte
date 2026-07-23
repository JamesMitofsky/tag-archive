<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const s = $derived(data.series);

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
	<title>{s.name} · Series · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<BackButton />
		</header>

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			<h1 class="text-2xl font-semibold tracking-tight break-words">{s.name}</h1>

			{#if s.description}
				<p class="mt-4 text-base break-words whitespace-pre-line text-gray-800">{s.description}</p>
			{/if}

			{#if s.frequency || s.defaultDayOfWeek || s.defaultTime}
				<dl class="mt-5 space-y-2 border-t border-gray-200 pt-4 text-sm">
					{#if s.frequency}
						<div class="flex gap-2">
							<dt class="font-medium text-gray-500">Frequency</dt>
							<dd class="text-gray-800">{s.frequency}</dd>
						</div>
					{/if}
					{#if s.defaultDayOfWeek}
						<div class="flex gap-2">
							<dt class="font-medium text-gray-500">Day</dt>
							<dd class="text-gray-800">{s.defaultDayOfWeek}</dd>
						</div>
					{/if}
					{#if s.defaultTime}
						<div class="flex gap-2">
							<dt class="font-medium text-gray-500">Time</dt>
							<dd class="text-gray-800">{s.defaultTime}</dd>
						</div>
					{/if}
				</dl>
			{/if}
		</article>

		<section class="mt-6">
			<h2 class="mb-3 text-sm font-medium text-gray-600">
				{data.events.length}
				{data.events.length === 1 ? 'event' : 'events'}
			</h2>

			{#if data.events.length === 0}
				<p
					class="rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No events linked to this series yet.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each data.events as ev}
						<li>
							<a
								href="/keeper/events/{ev.id}"
								class="flex items-center justify-between gap-3 rounded-sm bg-white/95 px-4 py-3 text-gray-900 shadow ring-1 ring-black/5 transition hover:shadow-md"
							>
								<div class="min-w-0">
									<p class="font-medium break-words">{ev.title}</p>
									<p class="mt-0.5 text-sm text-gray-500">
										{formatDate(ev.date)}{#if ev.time}
											· {ev.time}{/if}{#if ev.location}
											· {ev.location}{/if}
									</p>
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
