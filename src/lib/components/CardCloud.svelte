<!--
	Floating-page search cloud. Owns everything except the data and the card's
	contents: the searchbar, the field measurement, the fly-in / drift /
	open-and-grow animation. Callers supply where to search (`load` + `filter`)
	and how to render one card (`card` snippet), so `/` and `/events` share the
	exact same behaviour and differ only in data.

	The placement maths lives in `$lib/cloudLayout` — pure and unit-tested,
	because it is the part that must not silently regress on desktop.

	Layout in one paragraph: the searchbar sits in the middle of the viewport
	when there is room for a row of cards both above and below it, and is pushed
	to the top when there isn't (a phone). The cloud then fills whichever region
	is left. Nothing here consults a width breakpoint — the decision is made by
	comparing measured space against the measured card, so it holds for any
	orientation and any text size.
-->
<script lang="ts" generics="T extends { id: number }">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { createWindowVirtualizer } from '@tanstack/svelte-virtual';
	import { get } from 'svelte/store';
	import { fade, fly } from 'svelte/transition';
	import { cubicIn } from 'svelte/easing';
	import { measureCloud, placeCloud, type FieldInput, type Placed } from '$lib/cloudLayout';
	import { reducedMotion } from '$lib/transitions.svelte';

	interface Props {
		// Fetches the full list once (the cached dataset blob); searched in-memory after.
		load: () => Promise<T[]>;
		// Narrows the full list to the matches for the current query.
		filter: (items: T[], q: string) => T[];
		// Renders one card's contents (event/date/tags — whatever the data has). The
		// second argument says whether this card is the OPEN one, which is a ~3x size
		// difference — enough that images want a different `sizes` for each state.
		card: Snippet<[T, boolean]>;
		// Optional route-specific mark drawn INSIDE the field, where the placeholder
		// text would sit. Fades away as soon as the user types (see `.mark` below).
		placeholderMark?: Snippet;
		ariaLabel?: string;
		placeholder?: string;
	}

	let { load, filter, card, placeholderMark, ariaLabel = 'Search', placeholder }: Props = $props();

	// The whole dataset, fetched once; searches run against it in memory. `loading`
	// is that one initial fetch — not a per-search state (local filtering is instant).
	let allItems = $state<T[]>([]);
	let query = $state('');
	let results = $state<T[]>([]);
	let loading = $state(true);
	let searched = $state(false);

	// Click a floating page to open it: it glides to dead-center and grows to fill
	// the viewport while every other page flies out. Holds the open item's id.
	let selected = $state<number | null>(null);
	let inputEl: HTMLInputElement | null = null;
	let barEl = $state<HTMLElement | null>(null);

	// Persistent hover stacking: hovering a page grabs the next z-index and KEEPS
	// it, so a card the user pulled forward stays forward until a new search resets
	// the order. Later hovers grab higher values, layering on top of earlier ones.
	// Touch has no hover, which is why the layout below sizes and caps the cloud so
	// that a phone never depends on being able to pull a buried card forward.
	let zOrder = $state<Record<number, number>>({});
	let zTop = 0;
	function bringForward(id: number) {
		if (zOrder[id] === zTop) return; // already frontmost
		zOrder = { ...zOrder, [id]: ++zTop };
	}

	// Escape closes the open page. When nothing is open and the bar is empty, any
	// printable keystroke should land in the search input — focus it mid-keydown so
	// the char routes there.
	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			selected = null;
			return;
		}
		if (selected !== null || query !== '') return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key.length !== 1) return; // ignore Shift/Tab/arrows/etc.
		if (document.activeElement === inputEl) return;
		inputEl?.focus();
	}

	let debounce: ReturnType<typeof setTimeout>;

	// Filter the in-memory dataset for the current query. Synchronous — no network,
	// so no out-of-order handling or per-search loading state is needed.
	function runSearch(q: string) {
		const trimmed = q.trim();
		selected = null; // a new query resets any open page
		zOrder = {};
		zTop = 0;
		if (!trimmed) {
			results = [];
			searched = false;
			return;
		}
		results = filter(allItems, trimmed);
		searched = true;
	}

	// Fetch the whole (small) dataset once; every search then runs against it locally.
	onMount(async () => {
		try {
			allItems = await load();
		} finally {
			loading = false;
			runSearch(query); // apply any query typed while the dataset was loading
		}
	});

	// --------------------------------------------------------------- measurement

	/**
	 * Air between the searchbar block and a field anchored beside it. Also pays for
	 * the "showing N of M" line, which is absolutely positioned so that it can
	 * never change the measured block height (and so never move the hole).
	 */
	const FIELD_GAP = 28;

	/**
	 * Clearance the stacked bar leaves below the frosted top strip (h-16), on top
	 * of the `p-4` that <main> already applies — so 48 would sit the bar flush
	 * against the strip's edge, and the extra 20 is the gap.
	 */
	const STACKED_BAR_TOP = 68;

	/** The placement box, in viewport pixels. */
	let field = $state<FieldInput>({
		fieldW: 0,
		fieldH: 0,
		fullViewport: true,
		barW: 0,
		barH: 0
	});
	/**
	 * Field centre relative to the viewport centre. The cloud LAYER is the whole
	 * viewport, so it clips fly-outs instead of growing the page; the field is a
	 * region inside it, and this is the offset between the two.
	 */
	let fieldOffsetY = $state(0);
	/**
	 * Until the first measurement lands, the bar is positioned by the `md:` classes
	 * below — so the server-rendered HTML and the first paint are already close to
	 * right, and a phone doesn't flash a centred bar before JS corrects it.
	 */
	let measured = $state(false);

	/**
	 * Round DOWN to a multiple of 8, so a mobile URL bar sliding in and out — or a
	 * sub-pixel resize — doesn't churn the cap and fling cards about. Down and
	 * never up: a field measured larger than reality would clip cards at the edge.
	 */
	const quantise = (v: number) => Math.floor(v / 8) * 8;

	function remeasure() {
		if (!barEl) return;

		// While the on-screen keyboard is up, the visual viewport collapses. Do NOT
		// re-lay-out into it: the remaining strip fits fewer, badly clipped cards,
		// and every keystroke would re-place the whole cloud. The bar is already
		// anchored at the top in that layout, so the browser keeps it visible unaided.
		const vv = window.visualViewport;
		if (vv && vv.height < window.innerHeight * 0.75) return;

		const vw = quantise(window.innerWidth);
		const vh = quantise(window.innerHeight);

		// The route mark now lives inside the field, so the bar is a single box.
		const rect = barEl.getBoundingClientRect();
		const barW = rect.width;
		const barH = rect.height;

		// Can the cloud actually surround the bar? It needs a card's worth of room
		// on BOTH axes. Deliberately asks "if the bar were centred", never "where is
		// the bar now" — in the stacked layout the bar sits in flow at the top, so
		// reading its current position would feed this decision its own output and
		// the layout could never switch back.
		const probe = measureCloud({ fieldW: vw, fieldH: vh, fullViewport: true, barW, barH });
		const roomBeside = (vw - barW) / 2 - FIELD_GAP >= probe.cardW;
		const roomAbove = (vh - barH) / 2 - FIELD_GAP >= probe.cardH;

		measured = true;
		fieldOffsetY = 0;
		field = { fieldW: vw, fieldH: vh, fullViewport: roomBeside && roomAbove, barW, barH };
	}

	// Coalesce bursts of resize/observer callbacks into one measurement per frame.
	let frame = 0;
	function schedule() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			remeasure();
		});
	}

	onMount(() => {
		remeasure();
		// Catches the searchbar changing size for reasons `resize` never fires for:
		// a font swapping in, text zoom.
		const observer = new ResizeObserver(schedule);
		if (barEl) observer.observe(barEl);
		window.visualViewport?.addEventListener('resize', schedule);
		return () => {
			observer.disconnect();
			window.visualViewport?.removeEventListener('resize', schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	// -------------------------------------------------------------------- layout

	let layout = $derived(measureCloud(field));
	/**
	 * What the layout is actually showing. With no query, the stacked grid browses
	 * the WHOLE archive — it scrolls, so there is somewhere to put it, and an empty
	 * screen on a phone reads as broken. The surround layout keeps its blank sky:
	 * a cloud of everything is just a pile, and it has no room to grow into.
	 */
	let visible = $derived(searched ? results : layout.mode === 'grid' ? allItems : []);
	let floating = $derived(placeCloud(visible.slice(0, layout.cap), field, layout));
	// Open a page and the rest scatter: only the selected card stays mounted, so
	// every other one plays its off-screen fly-out.
	let shown = $derived(
		selected === null ? floating : floating.filter((p) => p.item.id === selected)
	);

	$effect(() => {
		const q = query;
		clearTimeout(debounce);
		debounce = setTimeout(() => runSearch(q), 50);
		return () => clearTimeout(debounce);
	});

	// ------------------------------------------------------- grid virtualisation

	/** Vertical pitch of a grid row: the card, plus the gap under it. */
	const ROW_GAP = 16;
	/**
	 * Rows near the top fly in; rows below never do. Scrolling mounts rows, and
	 * replaying the entrance on each one would make the whole grid twitch as you
	 * scroll. Anything past this is off-screen on arrival anyway, so the animation
	 * would never have been seen.
	 */
	const ENTER_ROWS = 8;

	/** Cards chunked into rows — the grid virtualises by ROW, not by card. */
	let rows = $derived.by(() => {
		const out: Placed<T>[][] = [];
		for (let i = 0; i < floating.length; i += layout.cols) {
			out.push(floating.slice(i, i + layout.cols));
		}
		return out;
	});

	let gridEl = $state<HTMLElement | null>(null);
	/** The grid's distance from the top of the DOCUMENT; the window virtualiser
	 *  works in page coordinates. */
	let scrollMargin = $state(0);
	let rowHeight = $derived(layout.cardH + ROW_GAP);

	// Only the stacked grid virtualises; `count: 0` parks it on desktop, where the
	// cloud is absolutely positioned and capped at 24 anyway.
	const virtualizer = createWindowVirtualizer<HTMLDivElement>(
		untrack(() => ({ count: 0, estimateSize: () => 1, overscan: 4 }))
	);

	$effect(() => {
		// Explicit reads so this tracks its inputs, not the virtualizer store —
		// subscribing here would re-run on every scroll and loop. (Same reasoning as
		// KeeperList.svelte.)
		const count = layout.mode === 'grid' && selected === null ? rows.length : 0;
		const size = rowHeight;
		const margin = scrollMargin;
		get(virtualizer).setOptions({
			count,
			estimateSize: () => size,
			overscan: 4,
			scrollMargin: margin
		});
	});

	// Page offset is stable across scrolling, so measure on mount and whenever the
	// chrome above the grid could have changed height.
	$effect(() => {
		if (!gridEl) return;
		scrollMargin = gridEl.getBoundingClientRect().top + window.scrollY;
	});
</script>

<svelte:window onkeydown={handleWindowKey} onresize={schedule} />

<main class="relative min-h-dvh overflow-hidden p-4">
	<!-- Searchbar (with the handwriting mark inside it). Centred on the viewport when the cloud can
	     surround it, pushed to the top when it can't (a phone), so that the
	     on-screen keyboard covers empty space rather than the results.
	     Fades out while a page is open so the opened artefact stands alone. -->
	<div
		class="searchbar pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center px-4 md:top-1/2 md:-translate-y-1/2"
		class:hidden-ui={selected !== null}
		style:position={measured ? (field.fullViewport ? 'fixed' : 'relative') : undefined}
		style:top={measured ? (field.fullViewport ? '50%' : 'auto') : undefined}
		style:translate={measured ? (field.fullViewport ? '0 -50%' : '0') : undefined}
		style:margin-top={measured && !field.fullViewport ? `${STACKED_BAR_TOP}px` : undefined}
	>
		<div bind:this={barEl} class="pointer-events-auto relative w-full max-w-sm">
			<!-- Fades in on load. Applied to the wrapper, not the input, so the field and
			     its icon come up as a single composited layer (and so it doesn't collide
			     with the searchbar's own opacity transition on the parent). -->
			<div class="load-fade relative">
				{#if loading && query.trim().length > 0}
					<svg
						class="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 animate-spin text-gray-700"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="9"
							stroke="currentColor"
							stroke-width="2"
						/>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M12 3a9 9 0 0 1 9 9h-2a7 7 0 0 0-7-7V3Z"
						/>
					</svg>
				{:else}
					<svg
						class="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-gray-700"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="m21 21-4.3-4.3m1.8-4.7a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
						/>
					</svg>
				{/if}
				<input
					type="search"
					bind:this={inputEl}
					bind:value={query}
					aria-label={ariaLabel}
					{placeholder}
					class="w-full rounded-lg border border-white/40 bg-white/25 py-3 pr-4 pl-12 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:ring-1 focus:ring-white/50 focus:outline-none"
				/>
				<!-- Route mark, standing in for placeholder text: same slot as the
				     placeholder (after the icon, vertically centred) and it fades out
				     the moment there is a query. Decorative, and never clickable — a
				     tap here must reach the input underneath. -->
				{#if placeholderMark}
					<div
						class="mark pointer-events-none absolute inset-y-0 left-12 flex items-center"
						class:typed={query !== ''}
						aria-hidden="true"
					>
						{@render placeholderMark()}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- One card, in either layout: the fly-out wrapper, the fly-in wrapper, and
	     the drifting page itself. Only the POSITIONING differs between modes, so
	     everything from here inwards is shared. -->
	{#snippet page(p: Placed<T>, isSel: boolean, flyIn: boolean = true)}
		<!-- exit: |global so cards fly out even when the whole block unmounts
		     (e.g. the search is cleared), not just on per-item removal -->
		<div
			out:fly|global={{
				x: p.offX,
				y: p.offY,
				duration: reducedMotion() ? 0 : 450,
				easing: cubicIn
			}}
		>
			<!-- entrance: CSS keyframe flies the card in from off-screen, once.
			     Dropped while this card is the open one: the class carries both an
			     animation and `will-change: transform`, and either makes this div the
			     containing block for fixed descendants — which would anchor the
			     opened page to this wrapper instead of the viewport. -->
			<div class:enter={!isSel && flyIn} style={p.enterStyle}>
				<!-- drift while idle; the open page stops drifting and grows instead -->
				<div
					class="page pointer-events-auto"
					class:tile={layout.mode === 'grid'}
					class:drift={!isSel}
					class:selected={isSel}
					class:paused={selected !== null && !isSel}
					style={p.style}
				>
					{#if isSel}
						<!-- Open page: plain container so text is selectable and a
						     second click inside does nothing (no re-close). -->
						<div class="block h-full w-full text-left select-text">
							{@render card(p.item, isSel)}
						</div>
					{:else}
						<button
							type="button"
							onclick={() => (selected = p.item.id)}
							class="block h-full w-full cursor-pointer touch-manipulation text-left transition-transform focus-visible:outline-none"
						>
							{@render card(p.item, isSel)}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/snippet}

	<!-- Backdrop: only while a page is open. Sits above everything except the
	     opened page, so the rest stay put (just dimmed). Click it (or press Esc)
	     to close. -->
	{#snippet backdrop()}
		<button
			type="button"
			aria-label="Close page"
			transition:fade={{ duration: 250 }}
			onclick={() => (selected = null)}
			class="fixed inset-0 z-40 cursor-default bg-black/25"
		></button>
	{/snippet}

	{#if visible.length}
		{#if layout.mode === 'grid'}
			<!-- Stacked layout: cards tile into scrolling columns under the bar. In
			     normal flow, so the PAGE scrolls and every match is reachable — no cap
			     and nothing hidden behind a "showing N of M". -->
			{#if selected !== null}
				{@render backdrop()}
				<!-- Rendered OUTSIDE the virtualised rows on purpose: those rows are
				     placed with `transform: translateY(...)`, and a transform is a
				     containing block for fixed descendants — inside one, the opened
				     page would anchor to its row instead of the viewport. -->
				{#each shown as p (p.item.id)}
					{@render page(p, true)}
				{/each}
			{:else}
				<!-- Stacked layout: cards tile into scrolling columns under the bar, in
				     normal flow so the PAGE scrolls and every match is reachable — no cap
				     and nothing hidden behind a "showing N of M". Only the rows near the
				     viewport are mounted, so /events' 1300+ cards don't all animate at
				     once. -->
				<div
					bind:this={gridEl}
					class="relative"
					style="margin-top: {FIELD_GAP}px; height: {$virtualizer.getTotalSize()}px; --card-h:{layout.cardH}px"
				>
					{#each $virtualizer.getVirtualItems() as vrow (vrow.key)}
						<div
							class="absolute top-0 left-0 w-full"
							style="transform: translateY({vrow.start - scrollMargin}px)"
						>
							<div
								class="grid gap-x-4"
								style="grid-template-columns: repeat({layout.cols}, minmax(0, 1fr))"
							>
								{#each rows[vrow.index] ?? [] as p (p.item.id)}
									<div>{@render page(p, false, vrow.index < ENTER_ROWS)}</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<!-- Surround layout: pages float around the bar; click one to open it — it
			     glides to centre and grows while the rest fly out. -->
			<div
				class="pointer-events-none fixed inset-0 z-10 overflow-hidden"
				class:z-40={selected !== null}
				style="--card-w:{layout.cardW}px; --card-h:{layout.cardH}px"
			>
				{#if selected !== null}
					{@render backdrop()}
				{/if}
				{#each shown as p (p.item.id)}
					{@const isSel = selected === p.item.id}
					<!-- anchor: scattered position within the field, or the VIEWPORT's dead
					     centre when open — not the field's. Glides between the two via the
					     CSS transition on left/top. Persistent hover stacking raises
					     z-index on pointer enter and keeps it. -->
					<div
						class="card-anchor"
						style="left: calc(50% + {isSel ? 0 : p.dx}px); top: calc(50% + {isSel
							? 0
							: fieldOffsetY + p.dy}px); z-index: {isSel ? 50 : (zOrder[p.item.id] ?? 0)}"
						onpointerenter={() => bringForward(p.item.id)}
					>
						{@render page(p, isSel)}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</main>

<style>
	/* Every result is an identical A4 document page (210:297 ≈ 1:1.414). The size
	   arrives as custom properties from the measured layout — it must NOT be an
	   inline width/height, because an inline style would beat `.selected` below and
	   an opened page could then never grow. The width/height transition is what
	   makes an opened page GROW smoothly to the centered .selected size. */
	.page {
		width: var(--card-w, 12rem);
		height: var(--card-h, calc(12rem * 297 / 210));
		flex: none;
		transition:
			width 700ms cubic-bezier(0.22, 1, 0.36, 1),
			height 700ms cubic-bezier(0.22, 1, 0.36, 1),
			/* eases the drift transform back to 0 on select, instead of snapping */ transform 700ms
				cubic-bezier(0.22, 1, 0.36, 1);
	}

	/* Grid tile: the column decides the width, and the A4 ratio the height. Must
	   come BEFORE `.selected` so that an opened tile's explicit size still wins
	   (with both width and height set, `aspect-ratio` drops out on its own). */
	.tile {
		width: 100%;
		height: auto;
		aspect-ratio: 210 / 297;
	}

	/* An opened tile leaves the grid entirely and centres on the viewport — the
	   page behind it keeps its scroll position, and a 90vh page can't be pushed
	   off the bottom by however far down the grid the card happened to sit. */
	.page.tile.selected {
		position: fixed;
		top: 50%;
		left: 50%;
		translate: -50% -50%;
	}

	/* Freeze background pages' drift while one is open — keeps the compositor from
	   re-rendering every animating card under the backdrop during the grow. */
	.paused {
		animation-play-state: paused;
	}

	/* Open page: blow up to fill the viewport (keeps A4 ratio, capped by both
	   axes) and stop drifting so it sits square in the center. */
	.selected {
		width: min(90vw, 90vh * 210 / 297);
		height: min(90vh, 90vw * 297 / 210);
		animation: none;
		z-index: 50;
	}

	/* In-field route mark: behaves like placeholder text, so it clears as soon as
	   there is a query — but fades rather than blinking out. */
	.mark {
		transition: opacity 150ms ease;
	}
	.mark.typed {
		opacity: 0;
	}

	/* Searchbar fades out while a page is open, then fades back on close. */
	.searchbar {
		transition: opacity 300ms ease;
	}
	.searchbar.hidden-ui {
		opacity: 0;
		pointer-events: none;
	}

	/* Anchor point. When the match set changes, ranks shift and this glides to the
	   new even slot instead of snapping. (Named .card-anchor, not .anchor, to avoid
	   colliding with any global `anchor` typography utility.) */
	.card-anchor {
		position: absolute;
		transform: translate(-50%, -50%);
		transition:
			left 700ms cubic-bezier(0.22, 1, 0.36, 1),
			top 700ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	/* Entrance: fly in once from an off-screen offset, then hold at rest. */
	.enter {
		animation: flyin 900ms cubic-bezier(0.16, 1, 0.3, 1) var(--edelay, 0s) both;
		will-change: transform, opacity;
	}

	@keyframes flyin {
		from {
			transform: translate(var(--ex, 0), var(--ey, 0));
			opacity: 0;
		}
		to {
			transform: translate(0, 0);
			opacity: 1;
		}
	}

	/* Ambient float: gentle, endless, per-card timing via custom props. */
	.drift {
		animation: float var(--dur, 8s) ease-in-out var(--delay, 0s) infinite alternate;
	}

	@keyframes float {
		from {
			transform: translate(0, 0) rotate(0deg);
		}
		to {
			transform: translate(var(--ddx, 0), var(--ddy, 0)) rotate(var(--rot, 0deg));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.enter,
		.drift {
			animation: none;
		}
		.card-anchor,
		.page {
			transition: none;
		}
	}
</style>
