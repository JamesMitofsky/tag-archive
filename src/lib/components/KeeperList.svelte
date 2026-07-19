<script lang="ts" generics="T">
	import { createWindowVirtualizer } from '@tanstack/svelte-virtual';
	import { get } from 'svelte/store';
	import { untrack, type Snippet } from 'svelte';

	// Window virtualizer: only visible rows mount, but the list rides the page's
	// own scroll (no inner scroll box), so the header scrolls away and native
	// scroll restoration keeps working. The 1300+ events list needs this to stay
	// responsive without feeling boxed in.
	type Props = {
		items: T[];
		/** Row markup; receives (item, index) so cards can keep their index-based tilt. */
		row: Snippet<[T, number]>;
		/** Rough per-row height before measurement; keeps the scrollbar stable on load. */
		estimatedItemHeight?: number;
		/** Rows to render beyond the viewport on each side, hiding scroll seams. */
		overscan?: number;
		/** Stable identity per row so measured heights survive filtering/reorders. */
		getKey?: (item: T, index: number) => string | number;
	};

	let { items, row, estimatedItemHeight = 150, overscan = 6, getKey }: Props = $props();

	// The list's absolute distance from the top of the document. The window
	// virtualizer works in page coordinates, so it needs this to place rows.
	let wrapper = $state<HTMLDivElement>();
	let scrollMargin = $state(0);

	// Initial options only — live values are pushed through the setOptions effect
	// below, so untrack keeps these first reads from registering as dependencies.
	const virtualizer = createWindowVirtualizer<HTMLDivElement>(
		untrack(() => ({
			count: items.length,
			estimateSize: () => estimatedItemHeight,
			overscan,
			scrollMargin
		}))
	);

	// Re-sync whenever the filtered set, estimate, or the list's page offset changes.
	// Read the instance with get() rather than the `$virtualizer` store: subscribing
	// here would re-run this effect on every scroll (setOptions fires a store set),
	// looping forever and stalling the range so only the top rows ever render.
	$effect(() => {
		// Explicit reads so the effect tracks the inputs, not the virtualizer store.
		const count = items.length;
		const estimate = estimatedItemHeight;
		const over = overscan;
		const margin = scrollMargin;
		const key = getKey;
		get(virtualizer).setOptions({
			count,
			estimateSize: () => estimate,
			overscan: over,
			scrollMargin: margin,
			getItemKey: key ? (index) => key(items[index], index) : undefined
		});
	});

	// Offset is stable across scroll (page coords), so measure once on mount and on
	// resize — the header above the list can change height on breakpoint changes.
	function measureOffset() {
		if (wrapper) scrollMargin = wrapper.getBoundingClientRect().top + window.scrollY;
	}
	$effect(() => {
		measureOffset();
		window.addEventListener('resize', measureOffset);
		return () => window.removeEventListener('resize', measureOffset);
	});
</script>

<div bind:this={wrapper} style="position: relative; height: {$virtualizer.getTotalSize()}px;">
	{#each $virtualizer.getVirtualItems() as item (item.key)}
		<div
			data-index={item.index}
			use:$virtualizer.measureElement
			style="position: absolute; top: 0; left: 0; width: 100%; transform: translateY({item.start -
				scrollMargin}px);"
		>
			{@render row(items[item.index], item.index)}
		</div>
	{/each}
</div>
