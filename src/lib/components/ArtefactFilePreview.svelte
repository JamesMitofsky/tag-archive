<!--
	An artefact's attachments, drawn inside its card. A closed card shows the
	first file and a "+N more" badge; an opened one (`paged`) can step through
	every file with the arrow buttons, the keyboard's left and right arrows, or
	a horizontal swipe on a touchscreen.
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

	/**
	 * A swipe in progress: where the finger came down, and how far the page has
	 * been dragged after it. Touch and pen only. A mouse drag over the page
	 * already means something (selecting its text, dragging the image out), and
	 * a desktop has the arrows and the keyboard.
	 */
	let swipe: { id: number; x: number; y: number; t: number } | null = null;
	let dragX = $state(0);
	let dragging = $state(false);
	/** A turned page is being put on its entry side, which mustn't be animated. */
	let placing = $state(false);

	/** How far, as a share of the preview's width, a slow swipe must travel to turn the page. */
	const SWIPE_DISTANCE = 0.2;
	/** A flick this fast (px/ms) turns the page however short it was. */
	const SWIPE_VELOCITY = 0.4;
	/** Past the first or last page the drag still moves, but only this much of the finger's travel. */
	const EDGE_RESISTANCE = 0.3;

	function onPointerDown(e: PointerEvent) {
		if (!canPage || swipe || e.pointerType === 'mouse' || !e.isPrimary) return;
		// A swipe may start on an arrow, where a thumb often rests. A tap there is
		// still the arrow's: only once the finger moves sideways does the capture
		// below take the pointer, and the click with it.
		swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
	}

	function onPointerMove(e: PointerEvent) {
		if (!swipe || e.pointerId !== swipe.id) return;
		const dx = e.clientX - swipe.x;
		const dy = e.clientY - swipe.y;
		if (!dragging) {
			// Wait to see which way the finger is going. `touch-action: pan-y` has
			// already handed vertical movement to the browser (which then cancels
			// this pointer), so this only rules out a jittery tap.
			if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
			dragging = true;
			(e.currentTarget as Element).setPointerCapture(e.pointerId);
		}
		const pastEdge = (dx > 0 && current === 0) || (dx < 0 && current === count - 1);
		dragX = pastEdge ? dx * EDGE_RESISTANCE : dx;
	}

	function onPointerUp(e: PointerEvent) {
		if (!swipe || e.pointerId !== swipe.id) return;
		const dx = e.clientX - swipe.x;
		const elapsed = Math.max(e.timeStamp - swipe.t, 1);
		const width = (e.currentTarget as Element).clientWidth || 1;
		const far = Math.abs(dx) > width * SWIPE_DISTANCE;
		const fast = Math.abs(dx) / elapsed > SWIPE_VELOCITY && Math.abs(dx) > 30;
		const turn = dragging && (far || fast) ? (dx < 0 ? 1 : -1) : 0;
		if (turn && current + turn >= 0 && current + turn < count) {
			go(turn);
			enterFrom(turn * width * 0.25);
		} else {
			endSwipe();
		}
	}

	/**
	 * Lets a page turned by a swipe slide in from the side it is coming from,
	 * not back from where the finger left the old one: it is placed there with
	 * the transition off, and once that has painted, released to the middle.
	 */
	function enterFrom(offset: number) {
		swipe = null;
		dragging = false;
		placing = true;
		dragX = offset;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				placing = false;
				// A new swipe may already have taken hold of the page.
				if (!dragging) dragX = 0;
			})
		);
	}

	function endSwipe() {
		swipe = null;
		dragging = false;
		dragX = 0;
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
		style:touch-action={canPage ? 'pan-y pinch-zoom' : undefined}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={endSwipe}
	>
		{#if isImage && !settled[url]}
			<Skeleton class="absolute inset-0 h-full w-full rounded-sm bg-gray-200" />
		{/if}
		<!-- What the finger drags. It springs back to the middle when let go, and a
		     page turned by the swipe simply arrives there. -->
		<div
			class="flex h-full w-full items-center justify-center {dragging || placing
				? ''
				: 'transition-transform duration-200 ease-out motion-reduce:transition-none'}"
			style:transform={dragX ? `translateX(${dragX}px)` : undefined}
		>
			{#if isImage}
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
		</div>

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
