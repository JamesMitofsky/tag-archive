<script lang="ts">
	import type { EventItem } from '$lib/events';
	import { fade, fly } from 'svelte/transition';
	import { cubicIn } from 'svelte/easing';
	import { strokePaths, handwritingBox } from '$lib/handwriting';
	import Sky from '$lib/components/Sky.svelte';

	let query = $state('');
	let results = $state<EventItem[]>([]);
	let loading = $state(false);
	let searched = $state(false);

	// Click a floating page to open it: it glides to dead-center and grows to fill
	// the viewport while every other page flies out. Holds the open event's id.
	let selected = $state<number | null>(null);

	// Last-hovered page stays lifted to the front until another is hovered.
	let frontId = $state<number | null>(null);

	// Escape closes the open page.
	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') selected = null;
	}

	let debounce: ReturnType<typeof setTimeout>;
	let requestId = 0;

	async function runSearch(q: string) {
		const trimmed = q.trim();
		selected = null; // a new query resets any open page
		if (!trimmed) {
			results = [];
			searched = false;
			loading = false;
			return;
		}

		const id = ++requestId;
		loading = true;
		try {
			const res = await fetch(`/api/events?q=${encodeURIComponent(trimmed)}`);
			const data = await res.json();
			// Ignore out-of-order responses from earlier keystrokes.
			if (id !== requestId) return;
			results = data.results ?? [];
			searched = true;
		} finally {
			if (id === requestId) loading = false;
		}
	}

	// Render dates like "July 4, 2023"; fall back to raw string if unparseable.
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

	// Only this many pages float in space; the bar reports the true total.
	const CAP = 24;
	let floating = $derived(placeAll(results.slice(0, CAP)));

	// Deterministic PRNG so a given event always lands + drifts the same way
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
		item: EventItem;
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
	function placeAll(items: EventItem[]): Placed[] {
		const n = items.length;
		// Stable ranks: order indices by event id.
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
		debounce = setTimeout(() => runSearch(q), 200);
		return () => clearTimeout(debounce);
	});
</script>

<svelte:window onkeydown={handleWindowKey} />

<main class="relative min-h-screen overflow-hidden p-4">
	<!-- Ambient sky: watercolor paper + drifting clouds, shared component. -->
	<Sky />

	<!-- Searchbar: pinned to the exact center of the viewport, never moves. -->
	<div class="fixed top-1/2 left-1/2 z-30 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 px-4">
		<!-- Static handwriting (recorded pen strokes) sits above the bar. -->
		<svg
			class="pointer-events-none mx-auto mb-1 block w-[28rem] max-w-full text-[#14120f]"
			viewBox="{handwritingBox.x} {handwritingBox.y} {handwritingBox.width} {handwritingBox.height}"
			fill="none"
			stroke="currentColor"
			stroke-width="3.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<!-- Graphite brush texture: rough the edges, then punch fine grain holes so
			     the stroke reads like pencil tooth instead of flat ink. -->
			<defs>
				<filter id="graphite" x="-20%" y="-20%" width="140%" height="140%">
					<!-- low-freq wobble = hand-drawn rough edge -->
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.08"
						numOctaves="2"
						seed="7"
						result="edge"
					/>
					<feDisplacementMap in="SourceGraphic" in2="edge" scale="2.5" result="rough" />
					<!-- high-freq noise -> alpha mask = broken graphite coverage (paper tooth) -->
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.9"
						numOctaves="2"
						seed="3"
						result="grain"
					/>
					<feColorMatrix
						in="grain"
						type="matrix"
						values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.15"
						result="grainMask"
					/>
					<feComposite in="rough" in2="grainMask" operator="in" />
				</filter>
			</defs>
			<g filter="url(#graphite)">
				{#each strokePaths as d}
					<path {d} />
				{/each}
			</g>
		</svg>
		<div class="relative">
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
			<input
				type="search"
				bind:value={query}
				aria-label="Search events"
				placeholder="Search U Street events…"
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
			{#each floating as p (p.item.id)}
				{@const isSel = selected === p.item.id}
				<!-- anchor: scattered position, or dead-center when open. Glides between
				     the two via the CSS transition on left/top. -->
				<div
					class="card-anchor"
					style="left: calc(50% + {isSel ? 0 : p.dx}vmin); top: calc(50% + {isSel
						? 0
						: p.dy}vmin); z-index: {isSel ? 50 : p.item.id === frontId ? 20 : 1}"
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
								<button
									type="button"
									onclick={() => {
										if (!isSel) selected = p.item.id;
									}}
									onpointerenter={() => (frontId = p.item.id)}
									class="lift block h-full w-full text-left transition-transform focus-visible:outline-none"
									class:cursor-pointer={!isSel}
									class:lifted={!isSel && p.item.id === frontId}
								>
									{@render page(p.item)}
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>

{#snippet page(item: EventItem)}
	<div
		class="page-surface flex h-full flex-col overflow-hidden rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5"
	>
		<div class="border-b border-gray-200 pb-2">
			<h2 class="line-clamp-2 text-sm leading-tight font-medium">{item.title}</h2>
			{#if item.date}
				<p class="mt-1 text-[0.65rem] text-gray-500">
					{formatDate(item.date)}{#if item.time} · {item.time}{/if}
				</p>
			{/if}
		</div>
		{#if item.description}
			<p class="mt-1.5 line-clamp-5 text-xs leading-relaxed text-gray-800">{item.description}</p>
		{/if}
		{#if item.hosts.length}
			<div class="mt-auto flex flex-wrap gap-1 pt-3">
				{#each item.hosts as host}
					<span class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.65rem] text-gray-600">{host}</span>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	/* Hovering a page lifts it; it stays lifted (last-hovered wins) until
	   another page is hovered — pairs with the raised z-index on its anchor. */
	.lifted {
		transform: scale(1.03);
	}

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
			/* eases the drift transform back to 0 on select, instead of snapping */
				transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
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

	/* Floating cards are slightly translucent (clouds show through); the open page
	   is solid so it reads as a real document. */
	.selected .page-surface {
		background-color: #fff;
	}

	/* Anchor point. When the match set changes, ranks shift and this glides to the
	   new even slot instead of snapping. (Named .card-anchor, not .anchor, to avoid
	   colliding with Skeleton's `anchor` typography utility, which underlines on hover.) */
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
