<script lang="ts">
	import type { Artefact } from '$lib/server/db/schema';
	import { fly } from 'svelte/transition';
	import { cubicIn } from 'svelte/easing';
	import { programAreaMeta } from '$lib/programAreas';
	import { strokePaths, handwritingBox } from '$lib/handwriting';

	let query = $state('');
	let results = $state<Artefact[]>([]);
	let loading = $state(false);
	let searched = $state(false);

	let debounce: ReturnType<typeof setTimeout>;
	let requestId = 0;

	async function runSearch(q: string) {
		const trimmed = q.trim();
		if (!trimmed) {
			results = [];
			searched = false;
			loading = false;
			return;
		}

		const id = ++requestId;
		loading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
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

	// Deterministic PRNG so a given artefact always lands + drifts the same way
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

	// Cards ride rounded-rectangle rings that echo the searchbar's wide, short
	// silhouette (all vmin). The innermost ring already clears the bar footprint.
	const RING_A = 44; // base half-width — wide, like the bar
	const RING_B = 22; // base half-height — short, like the bar
	const RING_GAP_A = 12; // each outer ring adds this much width
	const RING_GAP_B = 9; // ...and this much height
	const SUPERELLIPSE = 4; // >2 rounds toward a rectangle (2 = ellipse)
	const CLAMP_X = 74;
	const CLAMP_Y = 44;

	type Placed = {
		item: Artefact;
		dx: number;
		dy: number;
		offX: number;
		offY: number;
		enterStyle: string;
		style: string;
	};

	// Place each card purely from its artefact id, so a card keeps the SAME spot no
	// matter which other results match. Only dropped cards move (they fly out); the
	// survivors never jump.
	function placeAll(items: Artefact[]): Placed[] {
		return items.map((item) => {
			const rnd = mulberry32(item.id * 2654435761 + 1);
			// Trace a rounded-rectangle ring (superellipse) sized like the bar.
			const layer = Math.floor(rnd() * 3); // which ring, 0..2
			const theta = rnd() * Math.PI * 2; // where on the ring
			const a = RING_A + layer * RING_GAP_A;
			const b = RING_B + layer * RING_GAP_B;
			const c = Math.cos(theta);
			const s = Math.sin(theta);
			const p = 2 / SUPERELLIPSE;
			let dx = a * Math.sign(c) * Math.abs(c) ** p;
			let dy = b * Math.sign(s) * Math.abs(s) ** p;
			dx += (rnd() - 0.5) * 8; // loosen the ring so it reads organic
			dy += (rnd() - 0.5) * 8;
			dx = Math.max(-CLAMP_X, Math.min(CLAMP_X, dx));
			dy = Math.max(-CLAMP_Y, Math.min(CLAMP_Y, dy));

			// Fly in from whichever off-screen edge the anchor faces (px offset).
			const offX = (dx >= 0 ? 1 : -1) * (900 + rnd() * 500);
			const offY = (dy >= 0 ? 1 : -1) * (500 + rnd() * 400);
			const enterDelay = (rnd() * 0.35).toFixed(2); // slight organic stagger
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

<main class="forest relative min-h-screen overflow-hidden p-4">
	<!-- Searchbar: pinned to the exact center of the viewport, never moves. -->
	<div class="fixed left-1/2 top-1/2 z-30 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 px-4">
		<!-- Static handwriting (recorded pen strokes) sits above the bar. -->
		<svg
			class="pointer-events-none mx-auto mb-4 block w-64 max-w-full text-[#262422]"
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
					<feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="7" result="edge" />
					<feDisplacementMap in="SourceGraphic" in2="edge" scale="2.5" result="rough" />
					<!-- high-freq noise -> alpha mask = broken graphite coverage (paper tooth) -->
					<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain" />
					<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.15" result="grainMask" />
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
				class="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-gray-700"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="2"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.3-4.3m1.8-4.7a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
			</svg>
			<input
				type="search"
				bind:value={query}
				aria-label="Search"
				class="w-full rounded-lg border border-white/40 bg-white/25 py-3 pl-12 pr-4 text-base text-gray-800 shadow-sm backdrop-blur-md placeholder:text-gray-600 focus:border-white/60 focus:bg-white/35 focus:outline-none focus:ring-1 focus:ring-white/50"
			/>
			<!-- Loading hint sits absolutely below the input so it never shifts the bar's center. -->
			{#if searched && loading}
				<p class="absolute left-0 right-0 top-full mt-3 text-center text-sm text-gray-700">Searching…</p>
			{/if}
		</div>
	</div>

	<!-- Pages float in space around the bar: fly in from off-screen, then drift forever. -->
	{#if searched}
		<div class="pointer-events-none fixed inset-0 z-10 overflow-hidden">
			{#each floating as p (p.item.id)}
				<!-- anchor: static scattered position, centered on its point -->
				<div
					class="anchor"
					style="left: calc(50% + {p.dx}vmin); top: calc(50% + {p.dy}vmin)"
				>
					<!-- exit: |global so cards fly out even when the whole block unmounts
					     (e.g. the search is cleared), not just on per-item removal -->
					<div out:fly|global={{ x: p.offX, y: p.offY, duration: 450, easing: cubicIn }}>
						<!-- entrance: CSS keyframe flies the card in from off-screen, once -->
						<div class="enter" style={p.enterStyle}>
							<!-- drift: independent element runs the forever ambient motion -->
							<div class="drift page pointer-events-auto" style={p.style}>
								{@render page(p.item)}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>

{#snippet page(item: Artefact)}
	<div class="flex h-full flex-col overflow-hidden rounded-sm bg-white/95 p-4 text-gray-900 shadow-xl ring-1 ring-black/5">
		<div class="border-b border-gray-200 pb-2">
			<h2 class="line-clamp-2 text-sm font-medium leading-tight">{item.event}</h2>
			{#if item.date}
				<p class="mt-1 text-[0.65rem] text-gray-500">{formatDate(item.date)}</p>
			{/if}
		</div>
		{#if item.description}
			<p class="mt-1.5 line-clamp-5 text-xs leading-relaxed text-gray-800">{item.description}</p>
		{/if}
		{#if item.provenance.length || item.programArea.length}
			<div class="mt-auto flex flex-wrap gap-1 pt-3">
				{#each item.programArea as tag}
					<span class="rounded-full px-1.5 py-0.5 text-[0.65rem] {programAreaMeta(tag).pill}">{tag}</span>
				{/each}
				{#each item.provenance as person}
					<span class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.65rem] text-gray-600">{person}</span>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	/* Every result is an identical A4 document page (210:297 ≈ 1:1.414). */
	.page {
		width: 12rem;
		height: calc(12rem * 297 / 210); /* ≈ 16.97rem — locks A4 ratio + uniform height */
		flex: none;
	}

	/* Scattered anchor point — static; the drift layer moves, not this. */
	.anchor {
		position: absolute;
		transform: translate(-50%, -50%);
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
	}

	.forest {
		background-color: #8ecbe6;
		background-image:
			/* cloud mottle — soft uneven pigment/fiber density (light + dark blotches) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='700'%3E%3Cfilter id='c'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.7' intercept='-0.2'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='700' height='700' filter='url(%23c)' opacity='0.22'/%3E%3C/svg%3E"),
			/* tooth — cold-press speckle grain (white) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.16' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0'/%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23t)' opacity='0.1'/%3E%3C/svg%3E"),
			/* fine fiber grain (white) */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23f)' opacity='0.08'/%3E%3C/svg%3E");
	}
</style>
