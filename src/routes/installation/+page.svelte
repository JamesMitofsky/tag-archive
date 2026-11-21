<!--
	Archive Stream, the projector side. The whole public archive floats here as a
	field on water. A fixed lens sits in the middle of the screen; the iPad moves
	the water under it, and whatever drifts into the lens blooms. A minute after
	the last touch the lens rests, and the field goes back to a wash of the
	archive floating by, with nothing drawn into focus.

	The archive floats as islands, one per season, in date order; a bubble at
	each island's center names its season ("Winter 2024"), so the drift keeps a
	sense of when you are.

	The motion is decided in #lib/installation/physics and the layout in
	#lib/installation/field. This page only draws them: every frame it places
	the items near the screen (about sixty of the archive's ~1,400) and leaves
	the rest unmounted.

	Operator keys: `d` shows the overlay, `f` toggles fullscreen. The overlay
	reports on the connection and holds the filter: artefacts, images and events
	can each be left out of the field, which is then laid out again without them.
	Beside it sit sliders for how the field moves and how it is drawn (see
	#lib/installation/knobs), each taking hold as it is dragged.
	A mouse drag on this page moves the field too, as a fallback if the iPad's
	connection drops, and so do two fingers on the laptop's trackpad, read as
	one finger on the iPad (see #lib/installation/trackpad).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_INSTALLATION_RELAY_URL } from '$app/env/public';
	import OptimizedImage from '#lib/components/OptimizedImage.svelte';
	import { loadDataset, type Dataset } from '#lib/dataset.ts';
	import { placeholderUrl } from '#lib/images/placeholder.ts';
	import { formatPartialDate } from '#lib/partialDate.ts';
	import {
		bloomScale,
		calmness,
		carryCamera,
		focusAmount,
		focusScale,
		layoutField,
		nearestItem,
		offsetFrom,
		parting,
		type Group,
		type Placed,
		type World
	} from '#lib/installation/field.ts';
	import { buildFieldItems } from '#lib/installation/items.ts';
	import {
		defaultKnobs,
		KNOBS,
		readKnobs,
		rememberKnobs,
		VIEW,
		type Knob,
		type Knobs
	} from '#lib/installation/knobs.ts';
	import {
		kindSet,
		KINDS,
		readShownKinds,
		rememberShownKinds,
		type ShownKinds
	} from '#lib/installation/kinds.ts';
	import {
		createSim,
		releaseVelocity,
		TUNING,
		type Sample,
		type Sim,
		type Tuning
	} from '#lib/installation/physics.ts';
	import {
		connectRelay,
		readRelayConfig,
		type Relay,
		type RelayConfig,
		type RelayStatus
	} from '#lib/installation/relay.ts';
	import RelayOverlay from '#lib/installation/RelayOverlay.svelte';
	import { createTrackpad, wheelInput } from '#lib/installation/trackpad.ts';

	/** A bloom's share of the screen's width, for each share of its height. */
	const BLOOM_WIDTH = 0.5 / 0.62;
	/** Items are mounted this far (in cells) past the screen's edge, so they never pop in. */
	const MARGIN_CELLS = 1;

	let world = $state.raw<World | null>(null);
	let visible = $state.raw<Placed[]>([]);
	let bloomId = $state<string | null>(null);
	let caption = $state<{ title: string; date: string | null } | null>(null);
	let captionShown = $state(false);
	let loadError = $state<string | null>(null);
	let overlay = $state(false);
	let relayStatus = $state<RelayStatus | null>(null);
	let relayConfig = $state.raw<RelayConfig | null>(null);
	let unconfigured = $state(false);
	let stats = $state({ fps: 0, mounted: 0, mode: '', speed: 0 });
	let shown = $state<ShownKinds>(readShownKinds());

	let dataset: Dataset | null = null;
	let sim: Sim | null = null;
	let knobs = $state<Knobs>(readKnobs());
	/**
	 * What the frame loop and the sim read, kept plain so sixty reads a second
	 * skip the reactive proxy. `setKnobs` writes each change through to both.
	 */
	const tuning: Tuning = { ...TUNING, currentHeading: { ...TUNING.currentHeading } };
	const view = { ...VIEW };
	/**
	 * The ids last handed to the template, so it is only told when they change.
	 * Null after a new layout, which no set of ids matches, not even none.
	 */
	let visibleKey: string | null = null;

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const elements = new Map<string, HTMLElement>();
	/** The size each mounted item was last given, so unchanged ones are left alone. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const sizes = new Map<string, number>();
	/** Each season's bubble, by its group's key. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const bubbles = new Map<string, HTMLElement>();
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

	/** Registers a season's bubble for the frame loop to place. */
	function trackBubble(key: string) {
		return (node: HTMLElement) => {
			bubbles.set(key, node);
			return () => bubbles.delete(key);
		};
	}

	/**
	 * Lays the field out with the kinds now shown. The first time, the view
	 * starts somewhere different on each load; after that it stays with what
	 * it was on, since the same item sits elsewhere in a field of fewer things.
	 */
	function layout() {
		if (!dataset) return;
		const items = buildFieldItems({
			artefacts: dataset.artefacts,
			events: dataset.events,
			imageSets: dataset.images,
			kinds: kindSet(shown)
		});
		const laid = layoutField(items, {
			viewW: window.innerWidth,
			viewH: window.innerHeight,
			perScreen: view.perScreen
		});
		const pick = () => laid.placed[Math.floor(Math.random() * laid.placed.length)];
		if (sim && world) {
			const cam = sim.cam;
			const to = carryCamera(world, laid, cam) ?? pick() ?? cam;
			sim.rehome(to.x - cam.x, to.y - cam.y);
		} else {
			const start = pick() ?? { x: 0, y: 0 };
			sim = createSim({ x: start.x, y: start.y }, tuning);
		}
		// Items that stay are a new size in the new layout: draw them all afresh.
		sizes.clear();
		visibleKey = null;
		world = laid;
	}

	function toggle(kind: keyof ShownKinds) {
		shown[kind] = !shown[kind];
		rememberShownKinds(shown);
		layout();
	}

	/** Takes the sliders' values into what the field runs on, and remembers them. */
	function setKnobs(next: Knobs) {
		const zoomed = next.perScreen !== view.perScreen;
		knobs = next;
		for (const { key } of KNOBS) {
			if (key in view) view[key as keyof typeof view] = next[key];
			else tuning[key as Exclude<keyof Knobs, keyof typeof view>] = next[key];
		}
		rememberKnobs(next);
		// A different zoom is a different layout; the rest is read every frame.
		if (zoomed) layout();
	}

	function shownValue(knob: Knob): string {
		const digits = knob.step < 0.1 ? 2 : knob.step < 1 ? 1 : 0;
		return `${knobs[knob.key].toFixed(digits)}${knob.unit ? ` ${knob.unit}` : ''}`;
	}

	onMount(() => {
		// ?gain= still sets the drag gain for this visit, over what is remembered.
		const gain = Number(page.url.searchParams.get('gain'));
		setKnobs(gain > 0 ? { ...knobs, gain } : knobs);
		let relay: Relay | null = null;
		let frame = 0;
		let disposed = false;
		let viewW = window.innerWidth;
		let viewH = window.innerHeight;
		let last = performance.now();
		let stillSince: number | null = null;
		let focusedId: string | null = null;
		let frames = 0;
		let fpsSince = last;

		const now = () => performance.now() / 1000;
		/** Where a bubble is in its bob, 0..1: fixed by its place, so bubbles don't bob in step. */
		const bubblePhase = (group: Group) => ((group.x * 7 + group.y * 13) / (world?.cell ?? 1)) % 1;

		const config = readRelayConfig(page.url.searchParams, PUBLIC_INSTALLATION_RELAY_URL);
		relayConfig = config;
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
				dataset = data;
				layout();
			})
			.catch((error) => {
				loadError = error instanceof Error ? error.message : String(error);
			});

		// Two fingers on the trackpad steer like one on the iPad, at this
		// screen's own scale (gain 1), as the mouse does.
		const trackpad = createTrackpad({
			down: () => sim?.down(now()),
			drag: (dx, dy) => sim?.drag(dx, dy, now(), 1),
			up: (vx, vy) => sim?.up(vx, vy, now(), 1)
		});

		const tick = (ms: number) => {
			frame = requestAnimationFrame(tick);
			// A trackpad gesture that has gone quiet lifts before the field moves on.
			trackpad.tick(ms);
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
			// 0 while the field is left to the current: nothing comes into focus.
			const lensAt = sim.lens;
			const lensRadius = viewH * view.lens;
			const halfW = viewW / 2 + w.cell * MARGIN_CELLS;
			const halfH = viewH / 2 + w.cell * MARGIN_CELLS;

			// Which items are near the screen, and which is most in focus.
			const near: { placed: Placed; x: number; y: number; focus: number }[] = [];
			let best: (typeof near)[number] | null = null;
			for (const placed of w.placed) {
				const offset = offsetFrom(sim.cam, placed, w);
				if (Math.abs(offset.x) > halfW || Math.abs(offset.y) > halfH) continue;
				const focus = focusAmount(Math.hypot(offset.x, offset.y), lensRadius) * lensAt;
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
			// The width's share keeps its proportion to the height's.
			const bloomOf = (p: Placed) =>
				bloomScale(p.w, p.h, viewW, viewH, view.bloom, view.bloom * BLOOM_WIDTH);
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

			// The season bubbles ride the water with the items, part around a bloom
			// like them, and fade a little while one is open, so it holds the eye.
			for (const group of w.groups) {
				const element = bubbles.get(group.key);
				if (!element) continue;
				const offset = offsetFrom(sim.cam, group, w);
				if (Math.abs(offset.x) > halfW || Math.abs(offset.y) > halfH) {
					element.style.visibility = 'hidden';
					continue;
				}
				let { x, y } = offset;
				if (best) {
					const push = parting({ x: x - best.x, y: y - best.y }, reach + w.cell * 0.7, bloomAmount);
					x += push.x;
					y += push.y;
				}
				y += Math.sin((t / 8 + bubblePhase(group)) * Math.PI * 2) * 4;
				element.style.visibility = 'visible';
				element.style.transform = `translate3d(${viewW / 2 + x}px, ${viewH / 2 + y}px, 0)`;
				element.style.opacity = String(0.92 * (1 - 0.6 * bloomAmount));
			}

			if (lens) lens.style.opacity = String(0.6 * lensAt * (1 - Math.min(1, bloomAmount * 1.4)));

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
			const showCaption = stillSince !== null && t - stillSince > view.captionAfter;
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
			// A click on the overlay's filter is not a hand on the water.
			if (event.target instanceof Element && event.target.closest('.kinds, .knobs')) return;
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

		const onWheel = (event: WheelEvent) => {
			// The sliders' panel scrolls as any panel does.
			if (event.target instanceof Element && event.target.closest('.kinds, .knobs')) return;
			// Nothing else scrolls, zooms or swipes back a page here.
			event.preventDefault();
			// A pinch reaches the page as a wheel with ctrl held; it doesn't steer.
			if (event.ctrlKey || mouse !== null) return;
			trackpad.feed(wheelInput(event, viewH));
		};
		// Safari pinches with its own gesture events instead.
		const refuse = (event: Event) => event.preventDefault();

		window.addEventListener('resize', onResize);
		window.addEventListener('keydown', onKey);
		// Not passive, or the browser scrolls (and swipes back) before it can be refused.
		window.addEventListener('wheel', onWheel, { passive: false });
		document.addEventListener('gesturestart', refuse);
		document.addEventListener('gesturechange', refuse);
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
			window.removeEventListener('wheel', onWheel);
			document.removeEventListener('gesturestart', refuse);
			document.removeEventListener('gesturechange', refuse);
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

<div
	class="stream"
	class:operating={overlay || unconfigured}
	aria-label="Archive Stream"
	style:--cell={world ? `${world.cell}px` : undefined}
>
	<div
		class="lens"
		bind:this={lens}
		style:width="{knobs.lens * 200}vh"
		style:height="{knobs.lens * 200}vh"
		aria-hidden="true"
	></div>

	{#each world?.groups ?? [] as group (group.key)}
		<div class="bubble" style:visibility="hidden" {@attach trackBubble(group.key)}>
			{group.label}
		</div>
	{/each}

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
	{:else if world.placed.length === 0}
		<p class="notice quiet">Nothing is set to show.</p>
	{/if}

	{#if overlay || unconfigured}
		<RelayOverlay config={relayConfig} status={relayStatus} peerName="iPad">
			<dt>show</dt>
			<dd class="kinds">
				{#each KINDS as { kind, label } (kind)}
					<label>
						<input type="checkbox" checked={shown[kind]} onchange={() => toggle(kind)} />
						{label}
					</label>
				{/each}
			</dd>
			<dt>items</dt>
			<dd>{world?.placed.length ?? 0} ({stats.mounted} mounted)</dd>
			<dt>motion</dt>
			<dd>{stats.mode} · {stats.speed} px/s</dd>
			<dt>frames</dt>
			<dd>{stats.fps} fps</dd>
		</RelayOverlay>
		<div class="knobs">
			{#each KNOBS as knob (knob.key)}
				<label>
					<span>{knob.label}</span>
					<input
						type="range"
						min={knob.min}
						max={knob.max}
						step={knob.step}
						value={knobs[knob.key]}
						oninput={(event) =>
							setKnobs({ ...knobs, [knob.key]: event.currentTarget.valueAsNumber })}
					/>
					<output>{shownValue(knob)}</output>
				</label>
			{/each}
			<button type="button" onclick={() => setKnobs(defaultKnobs())}>reset to defaults</button>
		</div>
	{/if}
</div>

<style>
	/* The site keeps a scrollbar's width free at both edges; the projector has
	   no scrollbar, and wants every pixel. */
	:global(html:has(.stream)) {
		scrollbar-gutter: auto;
		overflow: hidden;
		/* A sideways swipe on the trackpad steers; it never goes back a page. */
		overscroll-behavior: none;
	}

	.stream {
		position: fixed;
		inset: 0;
		overflow: hidden;
		cursor: none;
		user-select: none;
		/* The sky shows through: items dim toward it, as if under water. */
	}

	/* The operator needs to see the pointer to reach the filter. */
	.stream.operating {
		cursor: auto;
	}

	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.9rem;
		/* The overlay lets touches through to the water; these take them. */
		pointer-events: auto;
	}
	.kinds label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}
	.kinds input {
		margin: 0;
	}

	.knobs {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		display: grid;
		grid-template-columns: auto 11rem auto;
		gap: 0.2rem 0.75rem;
		align-items: center;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		padding: 0.75rem 1rem;
		font:
			0.8rem/1.3 ui-monospace,
			monospace;
		color: white;
		background: oklch(0.2 0.02 250 / 0.75);
		border-radius: 0.5rem;
		z-index: 5;
	}
	.knobs label {
		display: contents;
	}
	.knobs input {
		width: 100%;
		margin: 0;
	}
	.knobs output {
		min-width: 6.5em;
	}
	.knobs button {
		grid-column: 1 / -1;
		justify-self: start;
		margin-top: 0.35rem;
		padding: 0.15rem 0.6rem;
		font: inherit;
		color: inherit;
		background: oklch(1 0 0 / 0.15);
		border: 0;
		border-radius: 0.3rem;
		cursor: pointer;
	}

	.lens {
		position: absolute;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		border-radius: 50%;
		background: radial-gradient(circle, oklch(0.95 0.06 85 / 0.55), oklch(0.95 0.06 85 / 0) 70%);
		/* Set every frame; hidden until the field is there to steer. */
		opacity: 0;
		pointer-events: none;
		z-index: 0;
	}

	.item {
		position: absolute;
		left: 0;
		top: 0;
		will-change: transform;
		/* No frame: a picture floats bare, with only its blurred stand-in
		   behind it while the real one loads. */
		background-size: cover;
		background-position: center;
		overflow: hidden;
		contain: layout paint;
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

	/* A season's name, at the center of its island. Sized by the layout's cell,
	   so it fits the clear water the layout keeps for it (about three cells
	   wide and one tall) on any projector. */
	.bubble {
		position: absolute;
		left: 0;
		top: 0;
		translate: -50% -50%;
		will-change: transform;
		padding: 0.3em 0.8em;
		font-family: var(--font-friendly);
		font-size: calc(var(--cell) * 0.17);
		line-height: 1.1;
		white-space: nowrap;
		color: oklch(0.32 0.04 250);
		background: oklch(0.98 0.012 90 / 0.88);
		border-radius: 999px;
		box-shadow: 0 0.1em 0.6em oklch(0.3 0.04 250 / 0.12);
		pointer-events: none;
		z-index: 2;
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
</style>
