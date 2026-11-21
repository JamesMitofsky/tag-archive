<!--
	Archive Stream, the projector side. The whole public archive floats here as a
	field on water. A fixed lens sits in the middle of the screen; the iPad moves
	the water under it, and whatever drifts into the lens blooms. A minute after
	the last touch the lens rests, and the field goes back to a wash of the
	archive floating by, with nothing drawn into focus.

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
	connection drops.
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
		openHeight,
		parting,
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

	/** A bloom's share of the screen's width, for each share of its height. */
	const BLOOM_WIDTH = 0.5 / 0.62;
	/**
	 * How quickly an event card grows to hold its details, per second: about
	 * as long as its details take to unfold (see `.details`).
	 */
	const OPEN_RATE = 6;
	/** Items are mounted this far (in cells) past the screen's edge, so they never pop in. */
	const MARGIN_CELLS = 1;

	let world = $state.raw<World | null>(null);
	let visible = $state.raw<Placed[]>([]);
	let bloomId = $state<string | null>(null);
	/**
	 * The focused item once the field has been still on it for `captionAfter`.
	 * Then it says what it is: a picture by a caption under it, an event card by
	 * opening to its details.
	 */
	let settledId = $state<string | null>(null);
	/** The focused picture's caption. An event card carries its own words instead. */
	let caption = $state<{ title: string; date: string | null } | null>(null);
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
	const sizes = new Map<string, { width: number; height: number }>();
	/**
	 * How far each event card is through opening to its details, 0..1: rising
	 * while it is the settled one, falling once it isn't. Only cards on their
	 * way open or closed are in here.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const openness = new Map<string, number>();
	/** Each card's height when open, as a multiple of its width (see `needOf`). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const needs = new Map<string, number>();
	/**
	 * Where an event card is measured (see `needOf`): off screen, wide enough
	 * that rounding doesn't matter, and a container, so the copy's type
	 * resolves as it would on a card this wide. Made here rather than in the
	 * markup because what goes in it is a copy the page puts there itself.
	 */
	let measurer: HTMLElement | null = null;
	const MEASURE_WIDTH = 1000;
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
		openness.clear();
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

	/**
	 * Fades a description's last lines when the card can't hold all of it, and
	 * only then, so a short one isn't faded at its end for nothing. Watched
	 * rather than checked once, because the card is still growing as it opens.
	 */
	function fadeWhenClipped(node: HTMLElement) {
		const check = () => node.classList.toggle('clipped', node.scrollHeight > node.clientHeight + 1);
		const observer = new ResizeObserver(check);
		observer.observe(node);
		return () => observer.disconnect();
	}

	/**
	 * The height an event card's words take when it is open, as a multiple of
	 * its width. Measured once per card, on a copy laid out open at no fixed
	 * height. Every size inside the card is a share of its width, so one
	 * measurement holds at whatever size the card is drawn.
	 */
	function needOf(id: string): number {
		const known = needs.get(id);
		if (known !== undefined) return known;
		const body = elements.get(id)?.querySelector('.card-body');
		if (!body) return 0;
		if (!measurer) {
			measurer = document.createElement('div');
			measurer.style.cssText = `position: fixed; left: -${2 * MEASURE_WIDTH}px; top: 0; width: ${MEASURE_WIDTH}px; container-type: inline-size; visibility: hidden; pointer-events: none;`;
			document.body.append(measurer);
		}
		const copy = body.cloneNode(true) as HTMLElement;
		copy.classList.add('open');
		measurer.replaceChildren(copy);
		const need = copy.offsetHeight / MEASURE_WIDTH;
		measurer.replaceChildren();
		needs.set(id, need);
		return need;
	}

	/** An event's date and time, on one line. */
	function when(date: string | null, time: string | null): string {
		return [date && formatPartialDate(date), time].filter(Boolean).join(' · ');
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

			// The settled event card opens; any other on its way open closes again.
			const settledItem = best?.placed.item.id === settledId ? best?.placed.item : null;
			if (settledItem && !settledItem.src && settledItem.details && !openness.has(settledItem.id)) {
				openness.set(settledItem.id, 0);
			}
			const toward = 1 - Math.exp(-dt * OPEN_RATE);
			for (const [id, amount] of openness) {
				const target = id === settledId ? 1 : 0;
				const next = amount + (target - amount) * toward;
				if (target === 0 && next < 0.001) openness.delete(id);
				else openness.set(id, next);
			}
			/** An item's size at a scale: an opening card is taller than its bloom. */
			const sizeOf = (placed: Placed, scale: number) => {
				const width = placed.w * scale;
				const height = placed.h * scale;
				const open = openness.get(placed.item.id);
				if (!open) return { width, height };
				const max = viewH * view.cardMax;
				return { width, height: openHeight(width, height, needOf(placed.item.id), max, open) };
			};
			const bestSize = best ? sizeOf(best.placed, bestScale) : null;
			const reach = bestSize ? Math.max(bestSize.width, bestSize.height) / 2 + w.cell * 0.35 : 0;

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

				const { width, height } = isBest && bestSize ? bestSize : sizeOf(placed, scale);
				// Sized rather than scaled, so a bloomed picture or card text is
				// drawn crisp at its full size instead of stretched.
				const drawn = sizes.get(placed.item.id);
				if (
					!drawn ||
					Math.abs(drawn.width - width) > 0.5 ||
					Math.abs(drawn.height - height) > 0.5
				) {
					sizes.set(placed.item.id, { width, height });
					element.style.width = `${width}px`;
					element.style.height = `${height}px`;
				}
				element.style.transform = `translate3d(${viewW / 2 + x - width / 2}px, ${viewH / 2 + y - height / 2}px, 0)`;
				const rest = 0.45 + 0.35 * calm;
				element.style.opacity = String(rest + (1 - rest) * entry.focus);
				element.style.zIndex = isBest ? '3' : entry.focus > 0 ? '2' : '1';
			}

			if (lens) lens.style.opacity = String(0.6 * lensAt * (1 - Math.min(1, bloomAmount * 1.4)));

			// What's in focus, for the caption, the card's details and the full-size picture.
			const focused = best && best.focus > 0.5 ? best : null;
			const id = focused?.placed.item.id ?? null;
			if (id !== focusedId) {
				focusedId = id;
				stillSince = null;
				settledId = null;
				const item = focused?.placed.item;
				caption = item?.src ? { title: item.title, date: item.date } : null;
			}
			const settled = !!focused && focused.focus > 0.85 && calm > 0.9;
			if (settled) stillSince ??= t;
			else stillSince = null;
			const nextSettled = stillSince !== null && t - stillSince > view.captionAfter ? id : null;
			if (nextSettled !== settledId) settledId = nextSettled;
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

		window.addEventListener('resize', onResize);
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);

		return () => {
			disposed = true;
			measurer?.remove();
			measurer = null;
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

<div class="stream" class:operating={overlay || unconfigured} aria-label="Archive Stream">
	<div
		class="lens"
		bind:this={lens}
		style:width="{knobs.lens * 200}vh"
		style:height="{knobs.lens * 200}vh"
		aria-hidden="true"
	></div>

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
				<!-- An event card. Settled on, it opens: the title shrinks and rises, and
				     the event's details unfold beneath it. They stay mounted while closed
				     (at no height) so that closing plays the same unfolding backwards. -->
				<div class="card-body" class:open={settledId === item.id}>
					<!-- Smaller type for a longer title, so the whole of it fits. -->
					<span
						class="title"
						style:--fit={Math.min(1, Math.sqrt(36 / Math.max(1, item.title.length)))}
					>
						{item.title}
					</span>
					{#if item.details}
						{@const details = item.details}
						{@const whenLine = when(item.date, details.time)}
						<div class="details">
							<div class="details-inner">
								{#if whenLine}<p class="when">{whenLine}</p>{/if}
								{#if details.hosts.length}
									<ul class="hosts">
										{#each details.hosts as host, i (i)}<li>{host}</li>{/each}
									</ul>
								{/if}
								{#if details.description}
									<p class="description" {@attach fadeWhenClipped}>{details.description}</p>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/each}

	<p
		class="caption"
		class:shown={caption && settledId !== null}
		bind:this={captionEl}
		aria-live="polite"
	>
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
		background-color: oklch(0.98 0.012 90);
		background-image: url('/paper-noise.png');
	}
	/* Padded here rather than on the card: `cqw` is a share of the container's
	   content box, so padding the container would shrink the unit it's sized in.
	   Everything is in the card's own units, since a percentage would be of the
	   whole screen. */
	.card-body {
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 100%;
		padding: 8cqw;
		font-family: var(--font-friendly);
		color: oklch(0.32 0.04 250);
		overflow-wrap: anywhere;
	}
	.title {
		flex: none;
		font-size: calc(11cqw * var(--fit, 1));
		line-height: 1.15;
		text-align: center;
		transition: font-size 700ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.open .title {
		font-size: calc(6.5cqw * var(--fit, 1));
	}

	/* Unfolds from no height to its own (or to what's left of the card, if
	   less). Animating the row rather than a height lets it land on a size
	   nobody has to measure, and the title, centered with it, rises as it grows. */
	.details {
		flex: 0 1 auto;
		min-height: 0;
		display: grid;
		grid-template-rows: 0fr;
		opacity: 0;
		transition:
			grid-template-rows 700ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 300ms ease-out;
	}
	.open .details {
		grid-template-rows: 1fr;
		opacity: 1;
		transition:
			grid-template-rows 700ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 600ms ease-out 150ms;
	}
	/* All spacing lives inside this clipped box (the spacer, the margins), so the
	   closed card has nothing left over to push its title off center. */
	.details-inner {
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.details-inner::before {
		content: '';
		flex: none;
		height: 1.5cqw;
	}
	.details-inner > * {
		flex: none;
		margin: 2.2cqw 0 0;
	}
	.when {
		font-size: 3.4cqw;
		text-align: center;
		opacity: 0.7;
	}
	.hosts {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1.2cqw;
		padding: 0;
		list-style: none;
	}
	.hosts li {
		padding: 0.35em 0.9em;
		font-size: 2.8cqw;
		border-radius: 999px;
		background: oklch(0.32 0.04 250 / 0.08);
	}
	/* The one part that gives way when the card is full. Its line breaks are the
	   source's paragraphs. */
	.details-inner > .description {
		flex: 0 1 auto;
		min-height: 0;
		overflow: hidden;
		margin-top: 3cqw;
		font-size: 3.3cqw;
		line-height: 1.45;
		white-space: pre-line;
		color: oklch(0.36 0.03 250);
	}
	.description:global(.clipped) {
		mask-image: linear-gradient(to bottom, #000 calc(100% - 2.6em), transparent);
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
