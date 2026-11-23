<script lang="ts">
	import BackButton from '#lib/components/BackButton.svelte';
	import ReviewActions from '#lib/components/ReviewActions.svelte';
	import { albumParticulars, formatClock } from '#lib/albums/format.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Track titles per card; the album's page has the rest, and the player. */
	const SHOWN = 8;
</script>

<svelte:head>
	<title>Review albums · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Review albums</h1>
			<p class="mt-1 text-sm text-gray-600">
				{data.albums.length}
				{data.albums.length === 1 ? 'album' : 'albums'} awaiting approval. Open one to listen before you
				approve it.
			</p>
			<BackButton class="mt-2" />
		</header>

		<section>
			{#if data.albums.length === 0}
				<p
					class="rounded-lg border border-dashed border-white/60 p-6 text-center text-sm text-gray-700"
				>
					No albums awaiting review.
				</p>
			{:else}
				<ul class="space-y-4">
					{#each data.albums as item, i (item.id)}
						<li
							class="relative rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5
							{i % 2 === 0 ? '-rotate-[0.35deg]' : 'rotate-[0.4deg]'}"
						>
							<h3 class="font-medium break-words">
								<a href="/keeper/albums/{item.id}" class="underline-offset-2 hover:underline">
									{item.title}
								</a>
							</h3>
							{#if item.artist}
								<p class="mt-0.5 text-sm break-words text-gray-700">{item.artist}</p>
							{/if}
							<p class="mt-0.5 text-sm text-gray-500">{albumParticulars(item)}</p>
							{#if item.description}
								<p class="mt-2 text-sm break-words whitespace-pre-line text-gray-800">
									{item.description}
								</p>
							{/if}
							<ol class="mt-3 space-y-0.5 text-sm text-gray-700">
								{#each item.tracks.slice(0, SHOWN) as t, n (t.id)}
									<li class="flex gap-2">
										<span class="w-5 shrink-0 text-right text-xs text-gray-400 tabular-nums">
											{n + 1}
										</span>
										<span class="min-w-0 flex-1 truncate">{t.title}</span>
										{#if t.duration != null}
											<span class="shrink-0 text-xs text-gray-400 tabular-nums">
												{formatClock(t.duration)}
											</span>
										{/if}
									</li>
								{/each}
							</ol>
							{#if item.tracks.length > SHOWN}
								<p class="mt-1 text-xs text-gray-500">+{item.tracks.length - SHOWN} more</p>
							{/if}
							<ReviewActions id={item.id} />
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
