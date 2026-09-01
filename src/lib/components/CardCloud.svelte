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
	import { cubicIn, cubicInOut } from 'svelte/easing';
	import {
		A4,
		measureCloud,
		placeCloud,
		type FieldInput,
		type Placed,
		type Rect
	} from '$lib/cloudLayout';
	import { morphBox, morphProgress, type Box } from '$lib/cardMorph';
	import { reducedMotion } from '$lib/transitions.svelte';
	import { shuffled } from '$lib/utils';

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
	/**
	 * The whole archive in a random order, drawn once per page load. With no query
	 * this is what the cloud and the grid browse, so an untouched search shows a
	 * different slice of the archive on every visit rather than always the same
	 * first N by id. Shuffled once and kept: resizing (which changes `cap`) then
	 * takes a longer or shorter prefix of the SAME order instead of dealing a new
	 * hand, and clearing a query returns to the sky the user started from.
	 */
	let browseOrder = $state<T[]>([]);
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
			// A focused `<input type="search">` clears itself on Escape. When a page is
			// open, Escape means "close it" — swallow the key so the query survives.
			// With nothing open, let the native clear happen as usual.
			if (selected === null) return;
			e.preventDefault();
			closeCard();
			return;
		}
		if (selected !== null || query !== '') return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key.length !== 1) return; // ignore Shift/Tab/arrows/etc.
		if (document.activeElement === inputEl) return;
		inputEl?.focus();
	}

	let debounce: ReturnType<typeof setTimeout>;

	/**
	 * A "reveal" is a moment when the card set legitimately (re)appears: first
	 * load, or a new search. Cards mounting inside that window fly in; cards
	 * mounting outside it — the virtualiser paging a row in as you scroll —
	 * appear plainly, or the grid would twitch the whole way down.
	 * The window outlasts the longest entrance (900ms plus stagger) so the class
	 * is never pulled off a card mid-animation.
	 */
	const REVEAL_MS = 2000;
	let revealing = $state(true);
	let revealTimer: ReturnType<typeof setTimeout>;
	function reveal() {
		revealing = true;
		clearTimeout(revealTimer);
		revealTimer = setTimeout(() => (revealing = false), REVEAL_MS);
	}

	/**
	 * Close the open page. In the stacked layout it shrinks back into the slot it
	 * grew out of (see the morph section below); in the surround layout it glides
	 * back to its place in the cloud. Nothing else on screen moves either way —
	 * deliberately, see the grid markup.
	 */
	function closeCard() {
		if (selected === null) return;
		// Set BEFORE `selected`, so the slot the card is heading for is hidden from
		// the very first frame of the exit rather than one frame into it.
		exiting = layout.mode === 'grid';
		selected = null;
	}

	// Filter the in-memory dataset for the current query. Synchronous — no network,
	// so no out-of-order handling or per-search loading state is needed.
	function runSearch(q: string) {
		const trimmed = q.trim();
		selected = null; // a new query resets any open page
		morphId = null; // ...and a slot in the previous result set is nowhere to return to
		zOrder = {};
		zTop = 0;
		if (!trimmed) {
			results = [];
			searched = false;
			// Clearing the box is a reveal too, now that it brings the random browse
			// set back rather than emptying the field — the cards should fly in the
			// same way they did on first load, not pop into place.
			reveal();
			return;
		}
		results = filter(allItems, trimmed);
		searched = true;
		reveal();
	}

	// Fetch the whole (small) dataset once; every search then runs against it locally.
	onMount(async () => {
		try {
			allItems = await load();
			browseOrder = shuffled(allItems);
		} finally {
			loading = false;
			runSearch(query); // apply any query typed while the dataset was loading
			reveal(); // the no-query grid arrives now, so start its entrance window
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
		blocks: []
	});

	/**
	 * Fixed chrome the cloud must not cover. Marked in the markup rather than
	 * listed here: the nav and the home mark live in the layout, they move and
	 * resize with the design, and the cloud should not carry a copy of where they
	 * happen to be this week.
	 */
	const BLOCK_SELECTOR = '[data-cloud-block]';
	const toRect = (el: Element): Rect => {
		const r = el.getBoundingClientRect();
		return { left: r.left, top: r.top, width: r.width, height: r.height };
	};
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

		// clientWidth/Height, not innerWidth/Height: the cloud layer is `fixed
		// inset-0`, so it spans the viewport MINUS any classic scrollbar. Measuring
		// the larger box would let a right-edge card hang into the scrollbar's
		// column — off screen, which is exactly what the placement must prevent.
		const doc = document.documentElement;
		const vw = quantise(doc.clientWidth || window.innerWidth);
		const vh = quantise(doc.clientHeight || window.innerHeight);

		// The route mark now lives inside the field, so the bar is a single box.
		const rect = barEl.getBoundingClientRect();
		const barW = rect.width;
		const barH = rect.height;

		// Can the cloud actually surround the bar? It needs a card's worth of room
		// on BOTH axes. Deliberately asks "if the bar were centred", never "where is
		// the bar now" — in the stacked layout the bar sits in flow at the top, so
		// reading its current position would feed this decision its own output and
		// the layout could never switch back.
		const probe = measureCloud({ fieldW: vw, fieldH: vh, fullViewport: true });
		const roomBeside = (vw - barW) / 2 - FIELD_GAP >= probe.cardW;
		const roomAbove = (vh - barH) / 2 - FIELD_GAP >= probe.cardH;

		measured = true;
		fieldOffsetY = 0;
		// The bar is a no-go zone like any other; the difference is that it is the
		// one the cloud is arranged AROUND, so it is measured here rather than found
		// by selector. Zones only apply to the surround layout: the stacked one puts
		// the bar above the grid and scrolls the cards past the chrome by design.
		const blocks =
			roomBeside && roomAbove
				? [toRect(barEl), ...Array.from(document.querySelectorAll(BLOCK_SELECTOR), toRect)]
				: [];
		field = { fieldW: vw, fieldH: vh, fullViewport: roomBeside && roomAbove, blocks };
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
		// The chrome's drawings arrive as images, so its boxes settle a beat after
		// the first measurement — watch them the same way the bar is watched.
		for (const el of document.querySelectorAll(BLOCK_SELECTOR)) observer.observe(el);
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
	 * What the layout is actually showing. With no query both layouts browse
	 * `browseOrder` — the archive, shuffled. The grid gets all of it (it scrolls,
	 * so there is somewhere to put it); the cloud takes the `cap` prefix below, so
	 * the sky opens on a random handful of pages that invites a click, and a
	 * reload deals a different handful.
	 */
	let visible = $derived(searched ? results : browseOrder);
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

	/** Cards chunked into rows — the grid virtualises by ROW, not by card. */
	let rows = $derived.by(() => {
		const out: Placed<T>[][] = [];
		for (let i = 0; i < floating.length; i += layout.cols) {
			out.push(floating.slice(i, i + layout.cols));
		}
		return out;
	});

	/**
	 * The open page in the stacked layout. Drawn separately from the grid, which
	 * keeps every other card in place behind the backdrop — so the scroll position
	 * survives opening and closing a card.
	 */
	let openCard = $derived(
		selected === null ? null : (floating.find((p) => p.item.id === selected) ?? null)
	);
	/**
	 * The open page, held through its own exit. `openCard` drops to null the moment
	 * the page closes, but Svelte keeps the element mounted to play the fly-out and
	 * re-reads its props the whole time — reading `.offX` off null threw, which
	 * aborted the outro and left the card stranded on screen, impossible to close.
	 */
	let lastOpenCard = $state<Placed<T> | null>(null);
	$effect(() => {
		if (openCard) lastOpenCard = openCard;
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
		const count = layout.mode === 'grid' ? rows.length : 0;
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

	// ---------------------------------------------------------- open/close morph
	//
	// In the stacked layout the opened page is a shared element: it grows out of
	// the grid slot it was clicked in and shrinks back into exactly that slot on
	// close, rather than appearing at the centre and scattering off-screen.

	/**
	 * How long that grow/shrink takes. Paired with `cubicInOut` deliberately — the
	 * scale is interpolated geometrically (see `cardMorph.ts`), and a curve that
	 * front-loads progress would put back the burst the geometry just removed. Do
	 * not "improve" this to an ease-out.
	 */
	const MORPH_MS = 560;

	/**
	 * The card bound to the open page. It is the one card that must NOT scatter on
	 * the way out or fly back in on the way home, because it is travelling under
	 * its own steam. Cleared when the exit morph lands, and by a new search.
	 */
	let morphId = $state<number | null>(null);
	/** Its slot when the page was opened, and the scroll that was measured at. */
	let originBox: Box | null = null;
	let originScrollY = 0;
	/** The outer morph layer — the one the slot-chase translates. */
	let morphLayer = $state<HTMLElement | null>(null);
	let landTimer: ReturnType<typeof setTimeout>;

	/**
	 * True from the moment a page starts closing until its morph lands. `selected`
	 * has already gone null by then, so it cannot answer "is a card still in
	 * flight?" on its own.
	 */
	let exiting = $state(false);

	/**
	 * The card being drawn on the morph layer instead of in its slot: while a page
	 * is open that is the page itself, and while one is closing it is still on its
	 * way home. Its slot holds its space — the morph has to measure it, and land
	 * on it — but must not paint.
	 */
	let onLayer = $derived(morphId !== null && (selected !== null || exiting) ? morphId : null);

	/**
	 * A slot's box. The height comes from the A4 ratio rather than from whatever
	 * the cell contains — while a page is open the cell is empty, and while one is
	 * landing its card is hidden, so its measured height is not to be trusted. Its
	 * top and width are content-independent (the row is positioned by the
	 * virtualiser, the column by the grid template), so those are read live.
	 */
	function slotBox(cell: HTMLElement): Box {
		const r = cell.getBoundingClientRect();
		return { left: r.left, top: r.top, width: r.width, height: r.width * A4 };
	}

	/** Where the open card's slot is NOW — which is not where it was opened from
	 *  if the reader scrolled the grid behind the backdrop. */
	function currentSlot(): Box | null {
		if (morphId === null || !originBox) return null;
		const cell = gridEl?.querySelector<HTMLElement>(`[data-cell="${morphId}"]`);
		if (cell) return slotBox(cell);
		// The row fell out of the virtualiser's window while the page was open, so
		// there is nothing to measure. The grid sits in normal flow, so the slot has
		// moved by exactly the scroll delta and nothing else.
		return { ...originBox, top: originBox.top - (window.scrollY - originScrollY) };
	}

	/** Open a page, recording the slot it grew out of (the stacked layout only —
	 *  the surround layout has no slots, and glides the card in place instead). */
	function openPage(id: number, ev: Event) {
		const cell = (ev.currentTarget as HTMLElement).closest<HTMLElement>('[data-cell]');
		originBox = cell ? slotBox(cell) : null;
		originScrollY = window.scrollY;
		// Set BEFORE `selected`: the grid card is about to be torn down, and its
		// fly-out reads this to know it should bow out instantly and let the morph
		// carry it instead.
		morphId = id;
		exiting = false;
		selected = id;
	}

	// The morph's transform is computed once and handed to the compositor, so it
	// is only true for as long as the slot stays where it was measured. Nothing
	// locks the page while a card is open, and a scroll flick during the exit
	// would land the card beside its slot — visible as a single jump on the last
	// frame, when the real card is un-hidden. Rather than recomputing the
	// animation per frame, translate the LAYER it is drawn on by however far the
	// slot has travelled: the baked transform stays true because the space it was
	// measured in moves with the target. One rect read per frame, for ~30 frames.
	let chase = 0;
	let chaseFrom: Box | null = null;

	function chaseStep() {
		const now = currentSlot();
		if (morphLayer && chaseFrom && now) {
			const x = now.left - chaseFrom.left;
			const y = now.top - chaseFrom.top;
			morphLayer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		}
		chase = requestAnimationFrame(chaseStep);
	}

	/** `from` must be the very box the exit was measured against, so that the
	 *  first delta is exactly zero and nothing shifts as the chase starts. */
	function startChase(from: Box) {
		cancelAnimationFrame(chase);
		chaseFrom = from;
		chase = requestAnimationFrame(chaseStep);
	}

	function stopChase() {
		cancelAnimationFrame(chase);
		chase = 0;
		chaseFrom = null;
		if (morphLayer) morphLayer.style.transform = '';
	}

	/**
	 * Hand the slot back to the real card. Deliberately a frame BEFORE the morph
	 * ends rather than after: at that point the two are congruent to within a
	 * fraction of a pixel, so an overlap is invisible where a gap would blink.
	 */
	function scheduleLanding(duration: number) {
		clearTimeout(landTimer);
		landTimer = setTimeout(
			() => {
				morphId = null;
				exiting = false;
			},
			Math.max(0, duration - 24)
		);
		setTimeout(stopChase, duration + 40);
	}

	/**
	 * The opened page's box at rest, cached from the moment it was measured. The
	 * exit needs it, and by then it cannot be measured: the element is wearing an
	 * inline box from the animation. Re-measured whenever it IS at rest, so a
	 * resize or rotation while a page is open is picked up.
	 */
	let restBox: Box | null = null;

	function restingBox(node: HTMLElement): Box | null {
		if (!node.style.width) {
			const r = node.getBoundingClientRect();
			restBox = { left: r.left, top: r.top, width: r.width, height: r.height };
		}
		return restBox;
	}

	/**
	 * The morph itself, in both directions — on the way in the slot is where the
	 * card was clicked, on the way out it is wherever that slot has since ended up.
	 * Direction is taken from our own state rather than the transition's, because
	 * `selected` is what actually drives the block either way.
	 */
	function morph(node: HTMLElement) {
		const opening = selected !== null;
		const from = opening ? originBox : currentSlot();
		const to = restingBox(node);
		if (reducedMotion() || !from || !to) {
			// No slot to travel to (surround layout, or the result set changed under
			// it). Fade instead of popping.
			if (!opening) scheduleLanding(0);
			return { duration: reducedMotion() ? 0 : 200, css: (t: number) => `opacity: ${t}` };
		}
		// A close can interrupt a grow that never finished. Pick up from the width
		// actually on screen instead of restarting from full size, and shorten to
		// match, or the card would jump out to full size before shrinking.
		const at = opening ? 1 : morphProgress(node.getBoundingClientRect().width, from, to);
		const duration = MORPH_MS * (opening ? 1 : at);
		if (!opening) {
			startChase(from);
			scheduleLanding(duration);
		}
		return {
			duration,
			easing: cubicInOut,
			// `t` runs 0 → 1 on the way in and 1 → 0 on the way out, which is exactly
			// the progress the box wants in each direction. `translate: none` cancels
			// the centring the resting rule applies, since these are absolute.
			css: (t: number) => {
				const b = morphBox(from, to, at * t);
				return `left: ${b.left}px; top: ${b.top}px; width: ${b.width}px; height: ${b.height}px; translate: none;`;
			}
		};
	}
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
		<!-- Three steps. Full width on a phone: there the bar is stacked above the
		     cloud rather than surrounded by it, so its width costs the cards nothing
		     and a narrow field is only harder to type in. From md the cloud wraps the
		     bar, so its width IS dead space the cloud cannot use — hence 34vw, which
		     costs the most where there is least to go round — capped at the 24rem it
		     takes on a wide screen. -->
		<div bind:this={barEl} class="pointer-events-auto relative w-full md:max-w-[min(24rem,34vw)]">
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
						class="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-gray-700 opacity-55"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
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
		     (e.g. the search is cleared), not just on per-item removal. A card on
		     the morph layer is the exception: it is already being drawn elsewhere,
		     so scattering this copy too would show the same card in two places. -->
		<div
			out:fly|global={{
				x: p.offX,
				y: p.offY,
				duration: reducedMotion() || p.item.id === morphId ? 0 : 450,
				easing: cubicIn
			}}
		>
			<!-- entrance: CSS keyframe flies the card in from off-screen, once.
			     Dropped while this card is the open one: the class carries both an
			     animation and `will-change: transform`, and either makes this div the
			     containing block for fixed descendants — which would anchor the
			     opened page to this wrapper instead of the viewport. -->
			<div class:enter={!isSel && flyIn} style={p.enterStyle}>
				{@render pageBody(p, isSel)}
			</div>
		</div>
	{/snippet}

	<!-- The card itself, without the entrance/exit scaffolding around it. Split out
	     because the morph layer renders this directly: the opened page travels
	     under its own transform rather than being flown anywhere. -->
	{#snippet pageBody(p: Placed<T>, isSel: boolean, boxed: boolean = false)}
		<!-- drift while idle; the open page stops drifting and grows instead.
		     `boxed` means the card is travelling: its parent owns the size, and this
		     just fills it. -->
		<div
			class="page pointer-events-auto"
			class:tile={layout.mode === 'grid' && !boxed}
			class:filled={boxed}
			class:drift={!isSel}
			class:selected={isSel && !boxed}
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
					onclick={(ev) => openPage(p.item.id, ev)}
					class="block h-full w-full cursor-pointer touch-manipulation text-left transition-transform focus-visible:outline-none"
				>
					{@render card(p.item, isSel)}
				</button>
			{/if}
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
			onclick={closeCard}
			class="pointer-events-auto fixed inset-0 z-40 cursor-default bg-black/25"
		></button>
	{/snippet}

	{#if visible.length}
		{#if layout.mode === 'grid'}
			<!-- Stacked layout: cards tile into scrolling columns under the bar, in
			     normal flow so the PAGE scrolls and every match is reachable — no cap
			     and nothing hidden behind a "showing N of M". Only the rows near the
			     viewport are mounted, so /events' 1300+ cards don't all animate at once.

			     The grid stays mounted while a page is open, and the open card's cell
			     keeps its slot. Collapsing it would drop the document height to zero,
			     the browser would clamp scrollY to 0, and closing would dump the
			     reader back at the top of the list instead of where they were. -->
			{#if selected !== null}
				{@render backdrop()}
			{/if}
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
							<!-- The grid HOLDS STILL while a page is open: these cards stay
							     mounted and exactly where they were, dimmed by the backdrop, so
							     that opening and closing move one card and nothing else. They
							     used to scatter off-screen and fly back, which meant every
							     close replayed the whole entrance — and the card returning to
							     its slot was then just one of eight sheets arriving at once,
							     indistinguishable from a fresh search.

							     `data-cell` is how the morph finds the slot to grow out of and
							     shrink back into. That slot is hidden, not emptied: it has to
							     stay measurable for the whole journey, which `display: none`
							     would not be, and it must not paint underneath the card still
							     travelling towards it. -->
							{#each rows[vrow.index] ?? [] as p (p.item.id)}
								<div data-cell={p.item.id} class:landing={p.item.id === onLayer}>
									{@render page(p, false, revealing)}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<!-- The opened page, on its own layer. Rendered OUTSIDE the virtualised
			     rows on purpose: those are placed with `transform: translateY(...)`,
			     and a transform is a containing block for fixed descendants — inside
			     one, the page would anchor to its row instead of the viewport.

			     Both layers are fixed and inset-0 for that same reason turned around:
			     they DO carry transforms, so their boxes have to be the viewport, or
			     the page's own 50%/50% would resolve against something else and the
			     centring would drift. There are two of them because they carry two
			     independent transforms — the morph owns one, the slot-chase the other,
			     and a single element cannot hold both. -->
			{#if openCard}
				<div bind:this={morphLayer} class="morph-layer">
					<div class="morph-box" in:morph|global out:morph|global>
						{@render pageBody(lastOpenCard ?? openCard, true, true)}
					</div>
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
						<!-- The card that was just closed must NOT fly in. It never left:
						     it stayed mounted through the whole open, and the anchor's
						     left/top transition plus the page's width/height transition are
						     already carrying it back to the exact spot it grew from. Handing
						     it the entrance as well threw it off-screen first, so the one
						     card the reader was looking at rejoined like a stranger. -->
						{@render page(p, isSel, p.item.id !== morphId)}
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

	/* Freeze background pages' drift while one is open — keeps the compositor from
	   re-rendering every animating card under the backdrop during the grow. */
	.paused {
		animation-play-state: paused;
	}

	/* The layer the travelling card sits on: viewport-sized and fixed, so that
	   transforming it (the slot-chase) moves the card without changing what the
	   box's `top: 50%` and `left: 50%` resolve against. Above the backdrop, and
	   transparent to the pointer — the card takes `pointer-events: auto` back. */
	.morph-layer {
		position: fixed;
		inset: 0;
		z-index: 50;
		pointer-events: none;
	}

	/* The travelling card's box. At rest it IS the opened page: centred, and
	   capped on both axes so a 210:297 sheet always fits. While the morph runs the
	   animation overrides these four properties with the interpolated box.

	   The size lives here rather than on `.page` so that the sheet inside is
	   genuinely laid out at whatever width it currently occupies. CardSheet sizes
	   its type in container-query units, so a laid-out card and a scaled card are
	   different pictures — scaling one to the other's size arrives with the wrong
	   type and swaps it in a single frame. Re-laying out costs a reflow per frame,
	   for one element, and buys an exact hand-off at both ends. */
	.morph-box {
		position: fixed;
		top: 50%;
		left: 50%;
		translate: -50% -50%;
		width: min(90vw, 90vh * 210 / 297);
		height: min(90vh, 90vw * 297 / 210);
	}

	/* A card whose parent owns its size. */
	.page.filled {
		width: 100%;
		height: 100%;
	}

	/* The slot a card is shrinking back into. It keeps its space — the morph has
	   to measure it for the whole exit, and `display: none` has no box — but must
	   not paint under the card still on its way there. Drift is off until it
	   lands, because the morph aims at the UNDRIFTED slot: a card that had already
	   floated a few pixels off would appear beside where the morph put it, which
	   is exactly the hop this whole arrangement exists to avoid. It restarts from
	   zero when the class comes off, so there is nothing to catch up on. */
	.landing {
		visibility: hidden;
	}
	.landing .page {
		animation: none;
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
	/* Sits behind the input as stand-in placeholder text, so it reads at
	   placeholder weight rather than as content. */
	.mark {
		opacity: 0.8;
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
