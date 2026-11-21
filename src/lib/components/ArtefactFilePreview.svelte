<!--
	An artefact's attachments, drawn inside its card. A closed card shows the
	first file and a "+N more" badge; an opened one (`paged`) can step through
	every file with the arrow buttons or the keyboard's left and right arrows.
-->
<script lang="ts">
	import Skeleton from '#lib/components/ui/skeleton/skeleton.svelte';
	import PaperclipIcon from 'phosphor-svelte/lib/PaperclipIcon';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import OptimizedImage from '#lib/components/OptimizedImage.svelte';
	import { isImageUrl } from '#lib/fileType.ts';

	let {
		fileUrls,
		artefactName,
		sizes = '192px',
		paged = false
	}: {
		fileUrls: string[];
		artefactName: string;
		/**
		 * Rendered width of the image. Defaults to the card cloud's closed-card
		 * width; callers pass something larger for the opened page, which is ~3x
		 * bigger. The old `(min-width: 768px) 33vw, 100vw` asked for a
		 * viewport-wide raster to fill a thumbnail.
		 */
		sizes?: string;
		/**
		 * Lets the reader page through every file. Only for an opened card: a
		 * closed one is itself a button, and a control nested in it would both be
		 * invalid HTML and swallow the click that opens it.
		 */
		paged?: boolean;
	} = $props();

	let index = $state(0);
	/**
	 * URLs that have finished loading (or failed). Kept per URL rather than as one
	 * flag so that paging back to a file already seen doesn't flash the skeleton.
	 */
	let settled = $state<Record<string, true>>({});

	const count = $derived(fileUrls.length);
	const canPage = $derived(paged && count > 1);
	// Clamped, so a list that shrinks under us can't leave the index past its end.
	const current = $derived(Math.min(index, Math.max(count - 1, 0)));
	const url = $derived(fileUrls[current] ?? '');
	const isImage = $derived(isImageUrl(url));
	const fileName = $derived(url.split('/').pop() ?? 'Attached file');
	/**
	 * The neighboring images, fetched ahead (hidden) so that the next or previous
	 * page is usually already there when the arrow is pressed. They render through
	 * the same `OptimizedImage` with the same `sizes`, so the browser picks the
	 * same srcset candidate it will later show, not the full-size original.
	 */
	const neighbors = $derived(
		canPage
			? [fileUrls[current - 1], fileUrls[current + 1]].filter(
					(u): u is string => !!u && isImageUrl(u) && !settled[u]
				)
			: []
	);

	/** The two arrows; hidden (not removed) at either end so nothing reflows. */
	const pagerClass =
		'absolute top-1/2 flex size-9 -translate-y-1/2 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-black/60 text-white shadow-xs backdrop-blur-xs transition-opacity hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:pointer-events-none disabled:opacity-0';

	function markSettled(u: string) {
		if (!settled[u]) settled = { ...settled, [u]: true };
	}

	function go(delta: number) {
		index = Math.min(Math.max(current + delta, 0), count - 1);
	}

	function handleKey(e: KeyboardEvent) {
		if (!canPage || e.defaultPrevented) return;
		if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
		// Leave the arrows to anything that edits text.
		const t = e.target;
		if (t instanceof HTMLElement && t.closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'ArrowLeft' && current > 0) {
			e.preventDefault();
			go(-1);
		} else if (e.key === 'ArrowRight' && current < count - 1) {
			e.preventDefault();
			go(1);
		}
	}
</script>

<svelte:window onkeydown={handleKey} />

{#if count > 0}
	<div
		class="relative my-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm bg-transparent"
		role={canPage ? 'group' : undefined}
		aria-roledescription={canPage ? 'carousel' : undefined}
		aria-label={canPage ? `${artefactName}: files` : undefined}
	>
		{#if isImage}
			{#if !settled[url]}
				<Skeleton class="absolute inset-0 h-full w-full rounded-sm bg-gray-200" />
			{/if}
			<!-- Keyed on the URL so each page is a fresh <img>: reusing one and swapping
			     its src would keep showing the old page until the new one decoded. -->
			{#key url}
				<OptimizedImage
					src={url}
					alt={canPage ? `${artefactName}, file ${current + 1} of ${count}` : artefactName}
					{sizes}
					loading={canPage ? 'eager' : 'lazy'}
					class="h-full w-full rounded-sm object-contain transition-opacity duration-300 {settled[
						url
					]
						? 'opacity-100'
						: 'opacity-0'}"
					onload={() => markSettled(url)}
					onerror={() => markSettled(url)}
				/>
			{/key}
		{:else}
			<div class="flex items-center gap-1.5 p-3 text-xs text-gray-600">
				<PaperclipIcon size={16} class="shrink-0" />
				<span class="truncate font-medium">{fileName}</span>
				{#if count > 1 && !paged}
					<span class="ml-1 shrink-0 text-[0.65rem] text-gray-400">({count} files)</span>
				{/if}
			</div>
		{/if}

		{#each neighbors as n (n)}
			<OptimizedImage
				src={n}
				alt=""
				aria-hidden="true"
				{sizes}
				loading="eager"
				class="hidden"
				onload={() => markSettled(n)}
				onerror={() => markSettled(n)}
			/>
		{/each}

		{#if canPage}
			<span
				class="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums shadow-xs backdrop-blur-xs"
				aria-live="polite"
			>
				{current + 1} / {count}
			</span>
			<button
				type="button"
				aria-label="Previous file"
				disabled={current === 0}
				onclick={() => go(-1)}
				class="{pagerClass} left-1.5"
			>
				<CaretLeftIcon size={20} weight="bold" />
			</button>
			<button
				type="button"
				aria-label="Next file"
				disabled={current === count - 1}
				onclick={() => go(1)}
				class="{pagerClass} right-1.5"
			>
				<CaretRightIcon size={20} weight="bold" />
			</button>
		{:else if count > 1 && isImage}
			<span
				class="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[0.6rem] text-white shadow-xs backdrop-blur-xs"
			>
				+{count - 1} more
			</span>
		{/if}
	</div>
{/if}
