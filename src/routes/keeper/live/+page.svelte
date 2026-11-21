<!--
	/keeper/live: the archive's arrivals board, for admins (+page.server.ts turns
	everyone else away). It is the sky of the public cloud on `/` with no
	searchbar: pages float in space and fly in as they join the archive. It holds
	far fewer of them than `/` does (LIVE_FEED_SIZE), so each can be drawn large
	enough to read across a room, and when another arrives the oldest flies away.

	What it shows: only artefacts that went public at most an hour before the
	page was opened, or since (LIVE_WINDOW_MS). Older ones never appear, even
	when the board has room.

	Arrivals come from polling /api/live (see that route for why it polls rather
	than streams, and why it stays open to every pass holder while this page is
	admin-only) every LIVE_POLL_MS while the page is on screen, and once more the
	moment it comes back. The feed is exactly the newest LIVE_FEED_SIZE, so each
	poll, cut to the window, IS the board: what is new flies in, what has left
	the feed (pushed out by newer arrivals, or no longer public) flies out, and
	what stayed is refreshed in place, so an edit shows up. After LIVE_LISTEN_MS
	(five hours) the board stops polling and offers a button to resume.

	Each page keeps its place for as long as it is shown (`assignSlots` in
	#lib/live), so an arrival never makes the others move. The places come from
	the public cloud's layout maths, with one difference: no two pages on the
	board overlap, even while drifting (`measureBoard` and `boardSlots` in
	#lib/cloudLayout). The fly-in and the drift are the public cloud's too.

	Open it with `?replay` to fly the latest arrival in again a moment after the
	rest, to see an arrival without adding an artefact. It comes in even when it
	is older than the window.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicIn } from 'svelte/easing';
	import { page } from '$app/state';
	import { loadLiveFeed } from '#lib/dataset.ts';
	import {
		assignSlots,
		LIVE_FEED_SIZE,
		LIVE_LISTEN_MS,
		LIVE_POLL_MS,
		withinWindow,
		type LiveArrival
	} from '#lib/live.ts';
	import { boardSlots, measureBoard, pinAt, type FieldInput, type Rect } from '#lib/cloudLayout.ts';
	import { programAreaMeta } from '#lib/programAreas.ts';
	import { formatDate } from '#lib/formatDate.ts';
	import { reducedMotion } from '#lib/transitions.svelte.ts';
	import CardSheet from '#lib/components/CardSheet.svelte';
	import ArtefactFilePreview from '#lib/components/ArtefactFilePreview.svelte';

	/** How long a departing page takes to fly off, in ms (as on `/`). */
	const EXIT_MS = 450;
	/** Gap between the pages already there when the board opens, which cascade in. */
	const CASCADE_S = 0.12;
	/** With `?replay`, how long the latest arrival waits for the rest to land. */
	const REPLAY_AFTER_MS = 1500;

	/** When the board was opened: the window is measured back from here. */
	const openedAt = Date.now();

	/** The latest poll, newest first. */
	let feed = $state<LiveArrival[]>([]);
	let status = $state<'connecting' | 'live' | 'retrying'>('connecting');
	/** With `?replay`: the arrival held back from the first poll, then let in. */
	let heldBack = $state<number | null>(null);
	let replayed = $state<number | null>(null);

	/** What the board shows: the feed cut to the window, plus a replayed arrival. */
	let shown = $derived(
		feed.filter(
			(item) => item.id !== heldBack && (item.id === replayed || withinWindow(item, openedAt))
		)
	);

	// ------------------------------------------------------------- measurement

	/**
	 * The placement box: the whole viewport, with the chrome marked
	 * `data-cloud-block` (the home mark) taken out of it, as `/` measures it. Zero
	 * until the first measurement, and nothing is placed before that.
	 */
	let field = $state<FieldInput>({ fieldW: 0, fieldH: 0, fullViewport: true, blocks: [] });

	const BLOCK_SELECTOR = '[data-cloud-block]';
	const toRect = (el: Element): Rect => {
		const r = el.getBoundingClientRect();
		return { left: r.left, top: r.top, width: r.width, height: r.height };
	};
	/** Round down to 8px, so a URL bar sliding about doesn't re-place every page. */
	const quantise = (v: number) => Math.floor(v / 8) * 8;

	function remeasure() {
		// The layer is `fixed inset-0`, so it spans the viewport minus any classic
		// scrollbar: measure that box, as `/` does, or a page could hang under it.
		const doc = document.documentElement;
		field = {
			fieldW: quantise(doc.clientWidth || window.innerWidth),
			fieldH: quantise(doc.clientHeight || window.innerHeight),
			fullViewport: true,
			blocks: Array.from(document.querySelectorAll(BLOCK_SELECTOR), toRect)
		};
	}

	let frame = 0;
	function schedule() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			remeasure();
		});
	}

	// ------------------------------------------------------------------ layout

	/** Card size: as large as LIVE_FEED_SIZE of them can be, however many show. */
	let layout = $derived(measureBoard(field, LIVE_FEED_SIZE));
	let slots = $derived(field.fieldW ? boardSlots(field, layout, LIVE_FEED_SIZE) : []);

	/**
	 * Memory the placement below keeps between runs, in plain variables rather
	 * than state because only that derivation reads them. Both are only ever
	 * extended the same way for the same input, so a re-run changes nothing.
	 *
	 * `slotOf`: which slot each shown page stands in (see `assignSlots`).
	 * `delayOf`: each page's entrance delay, fixed when it first appears. The
	 * pages already there when the board opens cascade in, oldest first, like
	 * `/`'s first deal; an arrival after that comes in at once.
	 */
	let slotOf: Record<number, number> = {};
	const delayOf: Record<number, number> = {};
	let firstDeal = true;

	let placed = $derived.by(() => {
		if (slots.length === 0) return [];
		slotOf = assignSlots(slotOf, shown, slots.length);
		const dealing = shown
			.filter((item) => delayOf[item.id] === undefined)
			.sort((a, b) => a.arrivedAt - b.arrivedAt || a.id - b.id);
		dealing.forEach((item, k) => (delayOf[item.id] = firstDeal ? k * CASCADE_S : 0));
		if (shown.length > 0) firstDeal = false;
		return shown.flatMap((item) => {
			const slot = slotOf[item.id];
			if (slot === undefined) return [];
			const p = pinAt(item, slots[slot], field, item.id);
			const delay = (delayOf[item.id] ?? 0).toFixed(2);
			return [{ ...p, enterStyle: `${p.enterStyle};--edelay:${delay}s` }];
		});
	});

	// ----------------------------------------------------------------- polling

	async function poll(first = false) {
		let next: LiveArrival[] | null;
		try {
			next = await loadLiveFeed();
		} catch {
			status = 'retrying';
			return;
		}
		if (!next) return stop(); // drifted shut: on the way to the locked page
		if (first && page.url.searchParams.has('replay') && next.length > 0) {
			const latest = next[0].id;
			heldBack = latest;
			setTimeout(() => {
				replayed = latest;
				heldBack = null;
			}, REPLAY_AFTER_MS);
		}
		feed = next;
		status = 'live';
	}

	// --------------------------------------------------------------- listening
	//
	// The board listens for LIVE_LISTEN_MS at a time, then pauses until someone
	// presses Resume. The pause is checked against the clock before every poll
	// as well as set as a timer: a sleeping laptop or a backgrounded tab can hold
	// a timer back for hours, and must not get one more poll in on waking.

	/** Polling has stopped until Resume is pressed (see LIVE_LISTEN_MS). */
	let paused = $state(false);
	/** The archive has drifted shut: polling has stopped for good. */
	let closed = false;
	let listeningSince = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let pauseTimer: ReturnType<typeof setTimeout> | undefined;

	function halt() {
		clearInterval(timer);
		clearTimeout(pauseTimer);
	}

	function pause() {
		halt();
		paused = true;
	}

	/** Start (or restart) a stretch of listening, LIVE_LISTEN_MS long. */
	function listen() {
		halt();
		paused = false;
		listeningSince = Date.now();
		timer = setInterval(tick, LIVE_POLL_MS);
		pauseTimer = setTimeout(pause, LIVE_LISTEN_MS);
	}

	/** Poll, unless the page is hidden, the stretch is over, or the archive shut. */
	function tick() {
		if (closed || paused || document.visibilityState !== 'visible') return;
		if (Date.now() - listeningSince >= LIVE_LISTEN_MS) return pause();
		void poll();
	}

	function resume() {
		listen();
		void poll();
	}

	function stop() {
		closed = true;
		halt();
	}

	onMount(() => {
		remeasure();
		listen();
		void poll(true);

		// The home mark is a drawing whose box settles once its image arrives;
		// watch it, as `/` does, so no page ends up under it.
		const observer = new ResizeObserver(schedule);
		for (const el of document.querySelectorAll(BLOCK_SELECTOR)) observer.observe(el);
		window.visualViewport?.addEventListener('resize', schedule);

		// Back on screen: catch up at once rather than at the next tick.
		document.addEventListener('visibilitychange', tick);

		return () => {
			stop();
			document.removeEventListener('visibilitychange', tick);
			observer.disconnect();
			window.visualViewport?.removeEventListener('resize', schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	function tagsFor(item: LiveArrival) {
		return [
			...item.programArea.map((tag) => {
				const meta = programAreaMeta(tag);
				return { label: tag, class: meta.pill, icon: meta.icon };
			}),
			...item.provenance.map((person) => ({ label: person }))
		];
	}
</script>

<svelte:head>
	<title>Live · Cloud Keeper · TAG Archive</title>
</svelte:head>

<svelte:window onresize={schedule} />

<main class="relative min-h-dvh overflow-hidden">
	{#if status === 'live' && shown.length === 0}
		<p
			class="fixed inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-gray-600"
			transition:fade
		>
			Nothing has joined the archive in the last hour. New artefacts will float in here.
		</p>
	{/if}

	{#if paused}
		<!-- Above the pages, in the searchbar's glass, at the foot of the screen
		     where it covers as little of the board as it can. -->
		<div
			class="fixed inset-x-4 bottom-6 z-20 flex justify-center"
			transition:fade={{ duration: 250 }}
		>
			<div
				class="flex items-center gap-3 rounded-full border border-white/40 bg-white/60 py-2 pr-2 pl-5 text-sm text-gray-800 shadow-sm backdrop-blur-md"
				role="status"
			>
				<span>Live updates paused after 5 hours</span>
				<button
					type="button"
					onclick={resume}
					class="cursor-pointer touch-manipulation rounded-full bg-gray-900 px-4 py-1.5 font-medium text-white transition hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:outline-none"
				>
					Resume
				</button>
			</div>
		</div>
	{/if}

	<!-- The sky the pages float in: the whole viewport, so a page flying in or
	     out is clipped by the window rather than growing the page. -->
	<section
		class="pointer-events-none fixed inset-0 z-10 overflow-hidden"
		style="--card-w:{layout.cardW}px; --card-h:{layout.cardH}px"
		aria-live="polite"
		aria-label="Newest artefacts"
	>
		{#each placed as p (p.item.id)}
			<div
				class="card-anchor"
				style="left: calc(50% + {p.dx}px); top: calc(50% + {p.dy}px)"
				out:fly={{
					x: p.offX,
					y: p.offY,
					opacity: 0,
					duration: reducedMotion() ? 0 : EXIT_MS,
					easing: cubicIn
				}}
			>
				<!-- Fly in once, from the edge the page faces (`/`'s entrance), then
				     drift. The style is read once, on mount: a later change must never
				     restart a page's entrance. -->
				<div class="enter" style={untrack(() => p.enterStyle)}>
					<div class="page drift" style={p.style}>
						<CardSheet
							title={p.item.artefact}
							meta={[p.item.event, p.item.date && formatDate(p.item.date)]}
							description={p.item.description}
							lines={4}
							tags={tagsFor(p.item)}
						>
							{#snippet media()}
								{#if p.item.fileUrls.length > 0}
									<ArtefactFilePreview
										fileUrls={p.item.fileUrls}
										artefactName={p.item.artefact}
										sizes="{Math.ceil(layout.cardW)}px"
									/>
								{/if}
							{/snippet}
						</CardSheet>
					</div>
				</div>
			</div>
		{/each}
	</section>
</main>

<style>
	/* The same paper, anchor, entrance and drift as the search cloud on `/` (see
	   CardCloud); the keyframes are global, in layout.css. */
	.page {
		width: var(--card-w);
		height: var(--card-h);
	}

	/* A page's place on the board. Glides, rather than jumps, when a resize moves
	   the places. */
	.card-anchor {
		position: absolute;
		transform: translate(-50%, -50%);
		transition:
			left 700ms cubic-bezier(0.22, 1, 0.36, 1),
			top 700ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.enter {
		animation: cloud-flyin 900ms cubic-bezier(0.16, 1, 0.3, 1) var(--edelay, 0s) both;
		will-change: transform, opacity;
	}

	.drift {
		animation: cloud-float var(--dur, 8s) ease-in-out var(--delay, 0s) infinite alternate;
	}

	@media (prefers-reduced-motion: reduce) {
		.enter,
		.drift {
			animation: none;
		}
		.card-anchor {
			transition: none;
		}
	}
</style>
