<!--
	/live: the archive's arrivals board. The artefact that most recently went
	public sits on the stage, the ones before it in a row beneath, and when a new
	one arrives a paper plane flies it in: the plane loops over the stage and
	lands, the artefact's sheet unfolds where it touched down, ink sparks fly off
	it, and the one it replaced slides down to head the row.

	Arrivals come from polling /api/live (see that route for why it polls rather
	than streams) every LIVE_POLL_MS while the page is on screen, and once more
	the moment it comes back. Each poll is diffed against every id this page has
	already shown (#lib/live), so only genuinely new artefacts are announced, in
	the order they went public, one flight at a time. The same poll refreshes the
	artefacts already on screen (an edit shows up) and drops any that left the
	public archive.

	Open it with `?replay` to fly the latest arrival in again, to see the
	animation without adding an artefact.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { crossfade, fade } from 'svelte/transition';
	import { backOut, cubicInOut, cubicOut } from 'svelte/easing';
	import { page } from '$app/state';
	import { loadLiveFeed } from '#lib/dataset.ts';
	import {
		arrivedAgo,
		LIVE_FEED_SIZE,
		LIVE_POLL_MS,
		newArrivals,
		type LiveArrival
	} from '#lib/live.ts';
	import { programAreaMeta } from '#lib/programAreas.ts';
	import { formatDate } from '#lib/formatDate.ts';
	import { reducedMotion } from '#lib/transitions.svelte.ts';
	import { A4 } from '#lib/cloudLayout.ts';
	import CardSheet from '#lib/components/CardSheet.svelte';
	import ArtefactFilePreview from '#lib/components/ArtefactFilePreview.svelte';
	import ArrivalFlight from '#lib/components/ArrivalFlight.svelte';
	import Confetti from '#lib/components/Confetti.svelte';
	import { INK } from '#lib/components/PaperPlaneFlight.svelte';

	/** How long a new arrival holds the stage before the next one may take it. */
	const DWELL_MS = 6000;
	/** How long "Just arrived" stays on a new arrival. */
	const FRESH_MS = 60_000;
	const CONFETTI_MS = 3500;

	let featured = $state<LiveArrival | null>(null);
	let earlier = $state<LiveArrival[]>([]);
	/** The arrival in the air: the plane is bringing it, the stage is empty. */
	let inFlight = $state<{ item: LiveArrival; target: { x: number; y: number } } | null>(null);
	/** The id of the featured arrival that just landed, while it reads "Just arrived". */
	let freshId = $state<number | null>(null);
	let sparks = $state<Spark[]>([]);
	let celebrating = $state(false);
	let status = $state<'connecting' | 'live' | 'retrying' | 'empty'>('connecting');
	let now = $state(Date.now());
	let stage = $state<HTMLElement>();

	/** Every id shown or queued, so nothing is announced twice. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read imperatively, never rendered
	const seen = new Set<number>();
	/** New arrivals waiting their turn, oldest first. */
	let queue: LiveArrival[] = [];
	let playing = false;
	// Read once on mount (the server has no media queries); templates read it too.
	let motion = $state(true);

	const [send, receive] = crossfade({
		duration: (d) => (motion ? Math.min(900, Math.max(500, Math.sqrt(d) * 30)) : 0),
		easing: cubicInOut,
		fallback: (node) => fade(node, { duration: motion ? 300 : 0 })
	});

	/**
	 * A folded note opening: first across, from a sliver turned edge-on to a
	 * ribbon facing the room, then down, from the ribbon to the whole sheet, with
	 * a little overshoot as it settles.
	 */
	function unfold(node: Element, { duration = 1000 }: { duration?: number } = {}) {
		if (!motion) return { duration: 300, css: (t: number) => `opacity: ${t}` };
		return {
			duration,
			css: (t: number) => {
				const across = cubicOut(Math.min(1, t / 0.45));
				const down = backOut(Math.max(0, (t - 0.4) / 0.6));
				const scaleY = 0.1 + 0.9 * down;
				return `
					transform: perspective(900px)
						rotateY(${(1 - across) * 80}deg)
						rotateX(${(1 - Math.min(1, down)) * 60}deg)
						scale(${0.15 + 0.85 * across}, ${scaleY});
					opacity: ${Math.min(1, t / 0.15)};
				`;
			}
		};
	}

	function wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/** The stage's center in viewport pixels: where the plane lands. */
	function stageCenter() {
		const box = stage?.getBoundingClientRect();
		if (!box) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
	}

	/**
	 * The plane lands on the stage where it is on screen when it takes off, so a
	 * visitor scrolled down the row (a phone) is first brought back up to it.
	 */
	async function bringStageIntoView() {
		const box = stage?.getBoundingClientRect();
		if (!box || (box.top >= 0 && box.bottom <= window.innerHeight)) return;
		stage!.scrollIntoView({ behavior: 'smooth', block: 'center' });
		await wait(700);
	}

	/** Make way on the stage: the featured artefact slides down to head the row. */
	function retireFeatured() {
		if (featured) earlier = [featured, ...earlier].slice(0, LIVE_FEED_SIZE - 1);
		featured = null;
	}

	/** Fly the queued arrivals in, one at a time, each holding the stage a while. */
	async function play() {
		if (playing) return;
		playing = true;
		while (queue.length > 0) {
			const item = queue.shift()!;
			retireFeatured();
			if (motion) {
				// Let the retiring sheet leave the stage before the plane comes in.
				await tick();
				await bringStageIntoView();
				await new Promise<void>((landed) => {
					inFlight = { item, target: stageCenter() };
					onLanded = landed;
				});
			}
			featured = item;
			freshId = item.id;
			if (stage) sparks = sparksFor(stage.clientWidth, stage.clientHeight);
			if (motion) celebrating = true;
			const landedAt = item.id;
			setTimeout(() => (celebrating = false), CONFETTI_MS);
			setTimeout(() => {
				if (freshId === landedAt) freshId = null;
			}, FRESH_MS);
			await wait(DWELL_MS);
		}
		playing = false;
	}

	let onLanded: (() => void) | null = null;

	/**
	 * Bring the screen up to date with a fresh feed: refresh what is shown, drop
	 * what has left the public archive, queue what is new.
	 */
	function apply(feed: LiveArrival[]) {
		const byId = new Map(feed.map((item) => [item.id, item]));
		const current = (item: LiveArrival) => byId.get(item.id);

		earlier = earlier.map(current).filter((item): item is LiveArrival => !!item);
		if (featured) {
			featured = current(featured) ?? null;
			// Its replacement is the next one down, unless a flight is coming in.
			if (!featured && !inFlight && !playing) {
				featured = earlier[0] ?? null;
				earlier = earlier.slice(1);
			}
		}
		queue = queue.map(current).filter((item): item is LiveArrival => !!item);

		const fresh = newArrivals(seen, feed);
		for (const item of fresh) seen.add(item.id);
		queue.push(...fresh);
		if (queue.length > 0) void play();
	}

	async function poll(first = false) {
		let feed: LiveArrival[] | null;
		try {
			feed = await loadLiveFeed();
		} catch {
			status = 'retrying';
			return;
		}
		if (!feed) return stop(); // drifted shut: on the way to the locked page
		if (first) {
			// What was already here is the backdrop, not news. With ?replay, the
			// latest arrival flies in again.
			const replay = page.url.searchParams.has('replay') && feed.length > 0;
			const shown = replay ? feed.slice(1) : feed;
			featured = shown[0] ?? null;
			earlier = shown.slice(1);
			for (const item of shown) seen.add(item.id);
		}
		apply(feed);
		status = feed.length > 0 || featured || inFlight ? 'live' : 'empty';
	}

	let stop = () => {};

	onMount(() => {
		motion = !reducedMotion();
		void poll(true);

		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void poll();
		}, LIVE_POLL_MS);
		const clock = setInterval(() => (now = Date.now()), 30_000);
		// Back on screen: catch up at once rather than at the next tick.
		const onVisible = () => {
			if (document.visibilityState !== 'visible') return;
			now = Date.now();
			void poll();
		};
		document.addEventListener('visibilitychange', onVisible);

		stop = () => {
			clearInterval(timer);
			clearInterval(clock);
			document.removeEventListener('visibilitychange', onVisible);
		};
		return stop;
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

	type Spark = { x1: number; y1: number; x2: number; y2: number; delay: number };

	/**
	 * Ink sparks thrown off a sheet as it lands: short pen strokes radiating from
	 * just outside its edge, all the way round. Each starts where its ray from the
	 * sheet's center leaves the sheet's rectangle, so they ring the paper rather
	 * than a circle that would cut through it.
	 */
	function sparksFor(width: number, height: number): Spark[] {
		const [a, b] = [width / 2, height / 2];
		return Array.from({ length: 14 }, (_, i) => {
			const angle = ((i * 360) / 14 + (i % 2 ? 8 : -5)) * (Math.PI / 180);
			const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
			const edge = Math.min(a / Math.abs(cos || 1e-9), b / Math.abs(sin || 1e-9));
			const [from, to] = [edge + 8, edge + (i % 3 === 0 ? 40 : 28)];
			return {
				x1: cos * from,
				y1: sin * from,
				x2: cos * to,
				y2: sin * to,
				delay: 450 + (i % 4) * 50
			};
		});
	}
</script>

<svelte:head>
	<title>Live · TAG Archive</title>
</svelte:head>

{#snippet sheet(item: LiveArrival, sizes: string, lines: number)}
	<CardSheet
		title={item.artefact}
		meta={[item.event, item.date && formatDate(item.date)]}
		description={item.description}
		{lines}
		tags={tagsFor(item)}
	>
		{#snippet media()}
			{#if item.fileUrls.length > 0}
				<ArtefactFilePreview fileUrls={item.fileUrls} artefactName={item.artefact} {sizes} />
			{/if}
		{/snippet}
	</CardSheet>
{/snippet}

<main class="flex min-h-dvh flex-col items-center gap-8 px-4 pt-chrome pb-12">
	<!-- The stage keeps its size while empty, so the plane always has somewhere
	     to land and the row beneath never jumps. -->
	<section
		bind:this={stage}
		aria-label="Latest arrival"
		aria-live="polite"
		class="relative grid w-[min(18rem,70vw)] place-items-center"
		style="aspect-ratio: 1 / {A4}"
		data-cloud-block
	>
		{#if featured}
			{@const item = featured}
			<!-- |global: the stage's sheet comes and goes with the {#if} around it
			     as well as the {#key}, and a local transition would skip the first. -->
			{#key item.id}
				<div class="absolute inset-0" in:unfold|global out:send|global={{ key: item.id }}>
					{#if freshId === item.id && motion}
						<svg
							class="pointer-events-none absolute top-1/2 left-1/2 size-px overflow-visible"
							aria-hidden="true"
							fill="none"
							stroke={INK}
							stroke-width="2.5"
							stroke-linecap="round"
						>
							{#each sparks as spark, i (i)}
								<line
									class="spark"
									style="--delay: {spark.delay}ms; --dx: {(spark.x2 - spark.x1) /
										2}px; --dy: {(spark.y2 - spark.y1) / 2}px"
									pathLength="1"
									x1={spark.x1}
									y1={spark.y1}
									x2={spark.x2}
									y2={spark.y2}
								/>
							{/each}
						</svg>
					{/if}
					{@render sheet(item, '(max-width: 640px) 70vw, 288px', 4)}
					{#if freshId === item.id}
						<span
							class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-white shadow-md"
							in:fade={{ delay: motion ? 700 : 0, duration: 300 }}
							out:fade={{ duration: 300 }}
						>
							Just arrived
						</span>
					{/if}
				</div>
			{/key}
		{:else if status === 'empty'}
			<p class="text-center text-sm text-gray-600" transition:fade>
				Nothing here yet. The next artefact to join the archive will land here.
			</p>
		{/if}
	</section>

	<!-- Always in the flow, blank while the stage is empty, so the row beneath
	     holds still while a plane is in the air. -->
	<p class="-mt-4 min-h-5 text-sm text-gray-600">
		{#if featured}Arrived {arrivedAgo(featured.arrivedAt, now)}{/if}
	</p>

	{#if earlier.length > 0}
		<section aria-label="Earlier arrivals" class="w-full max-w-5xl">
			<div class="mb-3 text-center text-sm font-medium tracking-wide text-gray-700 uppercase">
				Earlier
			</div>
			<ul class="flex flex-wrap justify-center gap-4">
				{#each earlier as item (item.id)}
					<li
						class="flex w-28 flex-col gap-1.5 sm:w-32"
						animate:flip={{ duration: motion ? 600 : 0, easing: cubicInOut }}
						in:receive={{ key: item.id }}
						out:fade={{ duration: motion ? 300 : 0 }}
					>
						<div style="aspect-ratio: 1 / {A4}">
							{@render sheet(item, '128px', 2)}
						</div>
						<p class="text-center text-xs text-gray-600">{arrivedAgo(item.arrivedAt, now)}</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

{#if inFlight}
	<ArrivalFlight
		target={inFlight.target}
		onlanded={() => {
			onLanded?.();
			onLanded = null;
		}}
		ondone={() => (inFlight = null)}
	/>
{/if}

{#if celebrating}
	<Confetti duration={CONFETTI_MS} />
{/if}

<style>
	/* Each spark is a pen stroke drawing itself outward from the sheet's edge,
	   then lifting off the page as it keeps going. */
	.spark {
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: spark 650ms cubic-bezier(0.2, 0.7, 0.3, 1) var(--delay) forwards;
	}
	@keyframes spark {
		0% {
			stroke-dashoffset: 1;
			transform: translate(0, 0);
			opacity: 1;
		}
		55% {
			stroke-dashoffset: 0;
			opacity: 1;
		}
		100% {
			stroke-dashoffset: 0;
			transform: translate(var(--dx), var(--dy));
			opacity: 0;
		}
	}
</style>
