<!--
	Floating-page search cloud. Owns everything except the data: the searchbar,
	the phyllotaxis placement, the fly-in / drift / open-and-grow animation, and
	the sky. Callers supply where to search (`endpoint`, returning `{ results }`)
	and how to render one card (`card` snippet). Extracted from the archive page
	so the events page reuses the exact same behaviour — only the data changes.
-->
<script lang="ts" generics="T extends { id: number }">
	import { onMount, type Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicIn } from 'svelte/easing';

	interface Props {
		// Fetches the full list once (the cached dataset blob); searched in-memory after.
		load: () => Promise<T[]>;
		// Narrows the full list to the matches for the current query.
		filter: (items: T[], q: string) => T[];
		// Renders one card's contents (event/date/tags — whatever the data has).
		card: Snippet<[T]>;
		// Optional content shown directly above the searchbar (e.g. a route-specific mark).
		header?: Snippet;
		ariaLabel?: string;
		placeholder?: string;
	}

	let { load, filter, card, header, ariaLabel = 'Search', placeholder }: Props = $props();

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

	// Persistent hover stacking: hovering a page grabs the next z-index and KEEPS
	// it, so a card the user pulled forward stays forward until a new search resets
	// the order. Later hovers grab higher values, layering on top of earlier ones.
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

	// Only this many pages float in space; the bar reports the true total.
	const CAP = 24;
	let floating = $derived(placeAll(results.slice(0, CAP)));
	// Open a page and the rest scatter: only the selected card stays mounted, so
	// every other one plays its off-screen fly-out.
	let shown = $derived(
		selected === null ? floating : floating.filter((p) => p.item.id === selected)
	);

	// Deterministic PRNG so a given item always lands + drifts the same way
	// (stable across reactive re-renders — no jumping).
	function mulberry32(seed: number) {
		let a = seed >>> 0;
		return () => {
			a = (a + 0x6d2b79f5) | 0;
			let t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	// Cards fill a wide annulus around the bar (all vmin). A phyllotaxis (golden-
	// angle) layout spreads them EVENLY — no clumps — inside a bar-shaped hole.
	const R_MIN = 23; // inner radius: clears the searchbar
	const R_MAX = 40; // outer radius: how far the cloud reaches
	const ASPECT = 1.9; // widen x so the field echoes the bar's wide silhouette
	const CLAMP_X = 82;
	const CLAMP_Y = 44;

	type Placed = {
		item: T;
		dx: number;
		dy: number;
		offX: number;
		offY: number;
		enterStyle: string;
		style: string;
	};

	// Lay cards out EVENLY with a phyllotaxis annulus. Position comes from each
	// card's RANK within the current matches (ranked by id, so it's deterministic).
	// When matches change, survivors glide to their new even slot (CSS transition on
	// .card-anchor) rather than snapping — even spacing without jarring jumps.
	const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
	function placeAll(items: T[]): Placed[] {
		const n = items.length;
		// Stable ranks: order indices by item id.
		const rankOf: number[] = [];
		items
			.map((it, idx) => ({ id: it.id, idx }))
			.sort((x, y) => x.id - y.id)
			.forEach((e, rank) => (rankOf[e.idx] = rank));

		return items.map((item, idx) => {
			const rnd = mulberry32(item.id * 2654435761 + 1);
			const k = rankOf[idx];
			// Even area fill of the annulus: r = sqrt(interp of r² over rank).
			const rNorm = n > 1 ? (k + 0.5) / n : 0.5;
			const r = Math.sqrt(R_MIN * R_MIN + rNorm * (R_MAX * R_MAX - R_MIN * R_MIN));
			const theta = k * GOLDEN_ANGLE; // even angular spread
			let dx = r * Math.cos(theta) * ASPECT;
			let dy = r * Math.sin(theta);
			dx += (rnd() - 0.5) * 4; // light organic jitter, keeps evenness
			dy += (rnd() - 0.5) * 4;
			dx = Math.max(-CLAMP_X, Math.min(CLAMP_X, dx));
			dy = Math.max(-CLAMP_Y, Math.min(CLAMP_Y, dy));

			// Fly in from whichever off-screen edge the anchor faces (px offset).
			const offX = (dx >= 0 ? 1 : -1) * (900 + rnd() * 500);
			const offY = (dy >= 0 ? 1 : -1) * (500 + rnd() * 400);
			const enterDelay = (Math.min(k, 12) * 0.05).toFixed(2); // staggered cascade
			const enterStyle = `--ex:${offX.toFixed(0)}px;--ey:${offY.toFixed(0)}px;--edelay:${enterDelay}s`;

			// Per-card ambient drift (translate ±rem, rotate ±deg, timing).
			const ddx = (rnd() * 1.4 - 0.7).toFixed(2);
			const ddy = (rnd() * 1.4 - 0.7).toFixed(2);
			const rot = (rnd() * 4 - 2).toFixed(2);
			const dur = (6 + rnd() * 5).toFixed(2);
			const delay = (rnd() * 3).toFixed(2);
			const style = `--ddx:${ddx}rem;--ddy:${ddy}rem;--rot:${rot}deg;--dur:${dur}s;--delay:${delay}s`;

			return { item, dx, dy, offX, offY, enterStyle, style };
		});
	}

	$effect(() => {
		const q = query;
		clearTimeout(debounce);
		debounce = setTimeout(() => runSearch(q), 50);
		return () => clearTimeout(debounce);
	});
</script>

<svelte:window onkeydown={handleWindowKey} />

<main class="relative min-h-screen overflow-hidden p-4">
	<!-- Searchbar + handwriting header: pinned to viewport center, never moves.
	     Fades out while a page is open so the opened artefact stands alone. -->
	<div
		class="searchbar fixed top-1/2 left-1/2 z-30 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 px-4"
		class:hidden-ui={selected !== null}
	>
		<!-- Optional route-specific mark: absolutely positioned above the bar so it
		     doesn't shift the searchbar off viewport center. -->
		{#if header}
			<div class="pointer-events-none absolute bottom-full left-0 flex w-full justify-center">
				{@render header()}
			</div>
		{/if}
		<div class="relative">
			{#if loading}
				<svg
					class="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 animate-spin text-gray-700"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
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
		</div>
	</div>

	<!-- Pages float around the bar; click one to open it — it glides to center and
	     grows to fill the viewport while the rest fly out. -->
	{#if searched}
		<div
			class="pointer-events-none fixed inset-0 z-10 overflow-hidden"
			class:z-40={selected !== null}
		>
			<!-- Backdrop: only while a page is open. Sits above the other floating pages
			     but below the opened one, so the rest stay put (just dimmed). Click it
			     (or press Esc) to close. -->
			{#if selected !== null}
				<button
					type="button"
					aria-label="Close page"
					transition:fade={{ duration: 250 }}
					onclick={() => (selected = null)}
					class="pointer-events-auto fixed inset-0 z-40 cursor-default bg-black/25"
				></button>
			{/if}
			{#each shown as p (p.item.id)}
				{@const isSel = selected === p.item.id}
				<!-- anchor: scattered position, or dead-center when open. Glides between
				     the two via the CSS transition on left/top. Persistent hover stacking
				     raises z-index on pointer enter and keeps it. -->
				<div
					class="card-anchor"
					style="left: calc(50% + {isSel ? 0 : p.dx}vmin); top: calc(50% + {isSel
						? 0
						: p.dy}vmin); z-index: {isSel ? 50 : (zOrder[p.item.id] ?? 0)}"
					onpointerenter={() => bringForward(p.item.id)}
				>
					<!-- exit: |global so cards fly out even when the whole block unmounts
					     (e.g. the search is cleared), not just on per-item removal -->
					<div out:fly|global={{ x: p.offX, y: p.offY, duration: 450, easing: cubicIn }}>
						<!-- entrance: CSS keyframe flies the card in from off-screen, once -->
						<div class="enter" style={p.enterStyle}>
							<!-- drift while idle; the open page stops drifting and grows instead -->
							<div
								class="page pointer-events-auto"
								class:drift={!isSel}
								class:selected={isSel}
								class:paused={selected !== null && !isSel}
								style={p.style}
							>
								{#if isSel}
									<!-- Open page: plain container so text is selectable and a
									     second click inside does nothing (no re-close). -->
									<div class="block h-full w-full text-left select-text">
										{@render card(p.item)}
									</div>
								{:else}
									<button
										type="button"
										onclick={() => (selected = p.item.id)}
										class="block h-full w-full cursor-pointer text-left transition-transform focus-visible:outline-none"
									>
										{@render card(p.item)}
									</button>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>

<style>
	/* Every result is an identical A4 document page (210:297 ≈ 1:1.414). The
	   width/height transition is what makes an opened page GROW smoothly to the
	   centered .selected size below. */
	.page {
		width: 12rem;
		height: calc(12rem * 297 / 210); /* ≈ 16.97rem — locks A4 ratio + uniform height */
		flex: none;
		transition:
			width 700ms cubic-bezier(0.22, 1, 0.36, 1),
			height 700ms cubic-bezier(0.22, 1, 0.36, 1),
			/* eases the drift transform back to 0 on select, instead of snapping */ transform 700ms
				cubic-bezier(0.22, 1, 0.36, 1);
	}

	/* Freeze background pages' drift while one is open — keeps the compositor from
	   re-rendering ~24 animating cards under the backdrop during the grow. */
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

	/* Header + searchbar fade out while a page is open, then fade back on close. */
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
