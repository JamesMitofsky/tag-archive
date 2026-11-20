<!--
	Archive Stream, the projector side. The whole public archive floats here as a
	field on water. A fixed lens sits in the middle of the screen; the iPad moves
	the water under it, and whatever drifts into the lens blooms.

	The motion is decided in #lib/installation/physics and the layout in
	#lib/installation/field. This page only draws them: every frame it places
	the items near the screen (about sixty of the archive's ~1,400) and leaves
	the rest unmounted.

	Operator keys: `d` shows the connection overlay, `f` toggles fullscreen.
	A mouse drag on this page moves the field too, as a fallback if the iPad's
	connection drops.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_INSTALLATION_RELAY_URL } from '$app/env/public';
	import OptimizedImage from '#lib/components/OptimizedImage.svelte';
	import { loadDataset } from '#lib/dataset.ts';
	import { placeholderUrl } from '#lib/images/placeholder.ts';
	import { formatPartialDate } from '#lib/partialDate.ts';
	import {
		bloomScale,
		calmness,
		focusAmount,
		focusScale,
		layoutField,
		nearestItem,
		offsetFrom,
		parting,
		type Placed,
		type World
	} from '#lib/installation/field.ts';
	import { buildFieldItems } from '#lib/installation/items.ts';
	import {
		createSim,
		releaseVelocity,
		TUNING,
		type Sample,
		type Sim
	} from '#lib/installation/physics.ts';
	import {
		connectRelay,
		readRelayConfig,
		type Relay,
		type RelayStatus
	} from '#lib/installation/relay.ts';

	/** The lens's radius, as a share of the screen's height. */
	const LENS = 0.18;
	/** Items are mounted this far (in cells) past the screen's edge, so they never pop in. */
	const MARGIN_CELLS = 1;
	/** How long the field must be still on an item before its caption shows (s). */
	const CAPTION_AFTER = 0.7;

	let world = $state.raw<World | null>(null);
	let visible = $state.raw<Placed[]>([]);
	let bloomId = $state<string | null>(null);
	let caption = $state<{ title: string; date: string | null } | null>(null);
	let captionShown = $state(false);
	let loadError = $state<string | null>(null);
	let overlay = $state(false);
	let relayStatus = $state<RelayStatus | null>(null);
	let unconfigured = $state(false);
	let stats = $state({ fps: 0, mounted: 0, mode: '', speed: 0 });

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const elements = new Map<string, HTMLElement>();
	/** The size each mounted item was last given, so unchanged ones are left alone. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const sizes = new Map<string, number>();
	let lens: HTMLElement | undefined = $state();
	let captionEl: HTMLElement | undefined = $state();

	/** Registers an item's element for the frame loop to place. */
	function track(id: string) {
		return (node: HTMLElement) => {
			elements.set(id, node);
			return () => {
				elements.delete(id);
				sizes.delete(id);
			};
		};
	}

	onMount(() => {
		const gain = Number(page.url.searchParams.get('gain')) || TUNING.gain;
		const tuning = { ...TUNING, gain };
		let sim: Sim | null = null;
		let relay: Relay | null = null;
		let frame = 0;
		let disposed = false;
		let viewW = window.innerWidth;
		let viewH = window.innerHeight;
		let last = performance.now();
		let visibleKey = '';
		let stillSince: number | null = null;
		let focusedId: string | null = null;
		let frames = 0;
		let fpsSince = last;

		const now = () => performance.now() / 1000;

		const config = readRelayConfig(page.url.searchParams, PUBLIC_INSTALLATION_RELAY_URL);
		if (config) {
			relay = connectRelay({
				config,
				role: 'screen',
				onMessage(message) {
					if (!sim) return;
					if (message.t === 'down') sim.down(now());
					else if (message.t === 'd') sim.drag(message.dx, message.dy, now());
					else if (message.t === 'up') sim.up(message.vx, message.vy, now());
				},
				onStatus(status) {
					relayStatus = status;
				}
			});
		} else {
			unconfigured = true;
		}

		loadDataset()
			.then((data) => {
				if (disposed) return;
				const items = buildFieldItems({
					artefacts: data.artefacts,
					events: data.events,
					imageSets: data.images
				});
				const laid = layoutField(items, { viewW, viewH });
				world = laid;
				// Start somewhere different each time the page loads.
				const start = laid.placed[Math.floor(Math.random() * laid.placed.length)] ?? { x: 0, y: 0 };
				sim = createSim({ x: start.x, y: start.y }, tuning, now());
			})
			.catch((error) => {
				loadError = error instanceof Error ? error.message : String(error);
			});

		const tick = (ms: number) => {
			frame = requestAnimationFrame(tick);
			const dt = (ms - last) / 1000;
			last = ms;
			frames++;
			if (ms - fpsSince > 1000) {
				stats = {
					fps: Math.round((frames * 1000) / (ms - fpsSince)),
					mounted: elements.size,
					mode: sim?.mode ?? '',
					speed: Math.round(sim?.speed ?? 0)
				};
				frames = 0;
				fpsSince = ms;
			}
			if (!sim || !world) return;
			const w = world;
			const t = ms / 1000;

			sim.step(dt, t, (point) => nearestItem(w, point, w.cell * 1.5));
			// Keep the numbers small over a long night; the view is the same.
			const cam = sim.cam;
			if (Math.abs(cam.x) > w.width * 4 || Math.abs(cam.y) > w.height * 4) {
				sim.shift(-Math.round(cam.x / w.width) * w.width, -Math.round(cam.y / w.height) * w.height);
			}

			const calm = calmness(sim.speed);
			const lensRadius = viewH * LENS;
			const halfW = viewW / 2 + w.cell * MARGIN_CELLS;
			const halfH = viewH / 2 + w.cell * MARGIN_CELLS;

			// Which items are near the screen, and which is most in focus.
			const near: { placed: Placed; x: number; y: number; focus: number }[] = [];
			let best: (typeof near)[number] | null = null;
			for (const placed of w.placed) {
				const offset = offsetFrom(sim.cam, placed, w);
				if (Math.abs(offset.x) > halfW || Math.abs(offset.y) > halfH) continue;
				const focus = focusAmount(Math.hypot(offset.x, offset.y), lensRadius);
				const entry = { placed, x: offset.x, y: offset.y, focus };
				near.push(entry);
				if (focus > 0 && (!best || focus > best.focus)) best = entry;
			}

			const key = near.map((n) => n.placed.item.id).join(' ');
			if (key !== visibleKey) {
				visibleKey = key;
				visible = near.map((n) => n.placed);
			}

			// The bloom: how much of the lens the focused item fills, and how far
			// its neighbors must part to make room.
			const bloomOf = (p: Placed) => bloomScale(p.w, p.h, viewW, viewH);
			const bestScale = best ? focusScale(best.focus, calm, bloomOf(best.placed)) : 1;
			const bloomAmount = best ? best.focus * calm : 0;
			const reach = best
				? (Math.max(best.placed.w, best.placed.h) * bestScale) / 2 + w.cell * 0.35
				: 0;

			for (const entry of near) {
				const element = elements.get(entry.placed.item.id);
				if (!element) continue;
				const { placed } = entry;
				const isBest = entry === best;
				const scale = isBest ? bestScale : focusScale(entry.focus, calm, bloomOf(placed));
				let x = entry.x;
				let y = entry.y;
				if (!isBest && best) {
					const push = parting(
						{ x: x - best.x, y: y - best.y },
						reach + Math.max(placed.w, placed.h) / 2,
						bloomAmount
					);
					x += push.x;
					y += push.y;
				}
				// A slow bob, stilled as an item comes into focus.
				const bob = (1 - entry.focus) * 5;
				x += Math.sin((t / 9 + placed.phase) * Math.PI * 2) * bob * 0.6;
				y += Math.sin((t / 7 + placed.phase) * Math.PI * 2) * bob;

				const width = placed.w * scale;
				const height = placed.h * scale;
				// Sized rather than scaled, so a bloomed picture or card text is
				// drawn crisp at its full size instead of stretched.
				if (Math.abs((sizes.get(placed.item.id) ?? 0) - scale) > 0.002) {
					sizes.set(placed.item.id, scale);
					element.style.width = `${width}px`;
					element.style.height = `${height}px`;
				}
				element.style.transform = `translate3d(${viewW / 2 + x - width / 2}px, ${viewH / 2 + y - height / 2}px, 0)`;
				const rest = 0.45 + 0.35 * calm;
				element.style.opacity = String(rest + (1 - rest) * entry.focus);
				element.style.zIndex = isBest ? '3' : entry.focus > 0 ? '2' : '1';
			}

			if (lens) lens.style.opacity = String(0.6 * (1 - Math.min(1, bloomAmount * 1.4)));

			// What's in focus, for the caption and the full-size picture.
			const focused = best && best.focus > 0.5 ? best : null;
			const id = focused?.placed.item.id ?? null;
			if (id !== focusedId) {
				focusedId = id;
				stillSince = null;
				captionShown = false;
				caption = focused
					? { title: focused.placed.item.title, date: focused.placed.item.date }
					: null;
			}
			const settled = !!focused && focused.focus > 0.85 && calm > 0.9;
			if (settled) stillSince ??= t;
			else stillSince = null;
			const showCaption = stillSince !== null && t - stillSince > CAPTION_AFTER;
			if (showCaption !== captionShown) captionShown = showCaption;
			const nextBloom = focused && bloomAmount > 0.6 ? id : bloomId === id ? bloomId : null;
			if (nextBloom !== bloomId) bloomId = nextBloom;
			if (captionEl && focused) {
				const bottom = viewH / 2 + focused.y + (focused.placed.h * bestScale) / 2;
				captionEl.style.top = `${Math.min(bottom + 18, viewH - 90)}px`;
			}
		};
		frame = requestAnimationFrame(tick);

		const onResize = () => {
			viewW = window.innerWidth;
			viewH = window.innerHeight;
		};

		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'd') overlay = !overlay;
			if (event.key === 'f') {
				if (document.fullscreenElement) void document.exitFullscreen();
				else void document.documentElement.requestFullscreen().catch(() => {});
			}
		};

		// The fallback: a mouse on the laptop moves the field directly (gain 1).
		let mouse: number | null = null;
		let samples: Sample[] = [];
		let lastPoint = { x: 0, y: 0 };
		const onDown = (event: PointerEvent) => {
			if (mouse !== null || !sim) return;
			mouse = event.pointerId;
			lastPoint = { x: event.clientX, y: event.clientY };
			samples = [{ t: event.timeStamp, ...lastPoint }];
			sim.down(now());
		};
		const onMove = (event: PointerEvent) => {
			if (event.pointerId !== mouse || !sim) return;
			sim.drag(event.clientX - lastPoint.x, event.clientY - lastPoint.y, now(), 1);
			lastPoint = { x: event.clientX, y: event.clientY };
			samples.push({ t: event.timeStamp, ...lastPoint });
			if (samples.length > 40) samples.splice(0, samples.length - 40);
		};
		const onUp = (event: PointerEvent) => {
			if (event.pointerId !== mouse || !sim) return;
			mouse = null;
			const v = releaseVelocity(samples, event.timeStamp);
			sim.up(v.x, v.y, now(), 1);
		};

		window.addEventListener('resize', onResize);
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);

		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			relay?.close();
			window.removeEventListener('resize', onResize);
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};
	});
</script>

<svelte:head>
	<title>Archive Stream</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="stream" aria-label="Archive Stream">
	<div class="lens" bind:this={lens} aria-hidden="true"></div>

	{#each visible as placed (placed.item.id)}
		{@const item = placed.item}
		{@const blur = placeholderUrl(item.placeholder)}
		<div
			class="item {item.kind}"
			class:card={!item.src}
			style:width="{placed.w}px"
			style:height="{placed.h}px"
			style:opacity="0"
			style:background-image={blur ? `url(${blur})` : undefined}
			{@attach track(item.id)}
		>
			{#if item.src}
				<OptimizedImage
					src={item.src}
					widths={[320]}
					sizes="320px"
					loading="eager"
					class="picture"
				/>
				{#if bloomId === item.id}
					<img
						class="picture full"
						src={item.src}
						alt=""
						decoding="async"
						onload={(event) => event.currentTarget.classList.add('loaded')}
					/>
				{/if}
			{:else}
				<!-- Smaller type for a longer title, so the whole of it fits. -->
				<span
					class="title"
					style:--fit={Math.min(1, Math.sqrt(36 / Math.max(1, item.title.length)))}
				>
					{item.title}
				</span>
			{/if}
		</div>
	{/each}

	<p class="caption" class:shown={captionShown && caption} bind:this={captionEl} aria-live="polite">
		{#if caption}
			<span class="caption-title">{caption.title}</span>
			{#if caption.date}<span class="caption-date">{formatPartialDate(caption.date)}</span>{/if}
		{/if}
	</p>

	{#if loadError}
		<p class="notice">The archive didn't load: {loadError}</p>
	{:else if !world}
		<p class="notice quiet">Gathering the archive…</p>
	{/if}

	{#if overlay || unconfigured}
		<dl class="operator">
			{#if unconfigured}
				<dt>relay</dt>
				<dd>not set: open with ?relay=…&amp;key=… (or set PUBLIC_INSTALLATION_RELAY_URL)</dd>
			{:else}
				<dt>relay</dt>
				<dd>{relayStatus?.state ?? 'connecting'}</dd>
				<dt>iPad</dt>
				<dd>{relayStatus?.peer ? 'here' : 'not heard from'}</dd>
				<dt>round trip</dt>
				<dd>{relayStatus?.rtt ?? '–'} ms</dd>
				<dt>messages</dt>
				<dd>{relayStatus?.rate ?? 0}/s</dd>
			{/if}
			<dt>items</dt>
			<dd>{world?.placed.length ?? 0} ({stats.mounted} mounted)</dd>
			<dt>motion</dt>
			<dd>{stats.mode} · {stats.speed} px/s</dd>
			<dt>frames</dt>
			<dd>{stats.fps} fps</dd>
		</dl>
	{/if}
</div>

<style>
	/* The site keeps a scrollbar's width free at both edges; the projector has
	   no scrollbar, and wants every pixel. */
	:global(html:has(.stream)) {
		scrollbar-gutter: auto;
		overflow: hidden;
	}

	.stream {
		position: fixed;
		inset: 0;
		overflow: hidden;
		cursor: none;
		user-select: none;
		/* The sky shows through: items dim toward it, as if under water. */
	}

	.lens {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 36vh;
		height: 36vh;
		translate: -50% -50%;
		border-radius: 50%;
		border: 2px dashed oklch(0.55 0.09 75 / 0.55);
		background: radial-gradient(circle, oklch(0.95 0.06 85 / 0.55), oklch(0.95 0.06 85 / 0) 70%);
		pointer-events: none;
		z-index: 0;
	}

	.item {
		position: absolute;
		left: 0;
		top: 0;
		will-change: transform;
		border-radius: 6px;
		border: 3px solid rgb(var(--tint));
		background-color: rgb(var(--tint) / 0.35);
		background-size: cover;
		background-position: center;
		box-shadow: 0 6px 18px oklch(0.3 0.03 240 / 0.18);
		overflow: hidden;
		contain: layout paint;
	}
	.item.artefact {
		--tint: 196 176 230;
		/* A scan sits on paper, whole, rather than cropped to its frame. */
		background-color: oklch(0.98 0.01 90);
	}
	.item.photo {
		--tint: 176 222 190;
	}
	.item.event {
		--tint: 168 210 240;
	}

	.item :global(.picture) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.item.artefact :global(.picture) {
		object-fit: contain;
	}
	.item .full {
		opacity: 0;
		transition: opacity 400ms ease-out;
	}
	.item .full:global(.loaded) {
		opacity: 1;
	}

	.item.card {
		container-type: size;
		display: grid;
		place-items: center;
		background-color: oklch(0.98 0.012 90);
		background-image: url('/paper-noise.png');
	}
	.title {
		font-family: var(--font-friendly);
		/* In the card's own units: a percentage would be of the whole screen. */
		padding: 8cqw;
		font-size: calc(11cqw * var(--fit, 1));
		line-height: 1.15;
		text-align: center;
		color: oklch(0.32 0.04 250);
		overflow-wrap: anywhere;
	}

	.caption {
		position: absolute;
		left: 50%;
		top: 85%;
		translate: -50% 0;
		max-width: min(70vw, 60rem);
		margin: 0;
		padding: 0.5em 1em;
		text-align: center;
		font-family: var(--font-friendly);
		color: oklch(0.28 0.04 250);
		background: oklch(0.98 0.01 90 / 0.82);
		border-radius: 999px;
		opacity: 0;
		transition: opacity 600ms ease-out;
		pointer-events: none;
		z-index: 4;
	}
	.caption.shown {
		opacity: 1;
	}
	.caption-title {
		font-size: clamp(1.1rem, 2.2vh, 2rem);
	}
	.caption-date {
		display: block;
		font-size: clamp(0.9rem, 1.6vh, 1.4rem);
		opacity: 0.7;
	}

	.notice {
		position: absolute;
		inset: auto 0 6vh;
		text-align: center;
		font-family: var(--font-friendly);
		font-size: 1.4rem;
		color: oklch(0.3 0.04 250);
	}
	.notice.quiet {
		opacity: 0.6;
	}

	.operator {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		display: grid;
		grid-template-columns: auto auto;
		gap: 0.15rem 0.75rem;
		margin: 0;
		padding: 0.75rem 1rem;
		font:
			0.8rem/1.3 ui-monospace,
			monospace;
		color: white;
		background: oklch(0.2 0.02 250 / 0.75);
		border-radius: 0.5rem;
		z-index: 5;
	}
	.operator dd {
		margin: 0;
	}
</style>
