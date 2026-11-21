<!--
	Archive Stream, the projector side. The whole public archive floats here as a
	field on water. A fixed lens sits in the middle of the screen; the iPad moves
	the water under it, and whatever drifts into the lens blooms. A minute after
	the last touch the lens rests, and the field goes back to a wash of the
	archive floating by, with nothing drawn into focus.

	The archive floats as archipelagos, one per season, each gathering that
	season from every year; within one, each year is an island of its own, the
	years in date order. A bubble at the head of each archipelago names its
	season ("Winter"), and a smaller one at the center of each island its year
	("2024", or "2023–24" for a winter), so the drift keeps a sense of when you
	are. Zoomed out, the years' names step aside, and the seasons' stay.

	A pinch on the iPad zooms the field about the lens. Zoomed out, things step
	aside so the view stays legible: first the lens, then the event cards, and
	then pictures thin out evenly while those left stop shrinking (the order is
	in #lib/installation/field). Each thing that goes or comes back fades and
	shrinks or grows over LOD_FADE rather than popping.

	The motion is decided in #lib/installation/physics and the layout in
	#lib/installation/field. This page only draws them: every frame it places
	the items near the screen (sixty to a couple of hundred of the archive's
	~1,400, whatever the zoom) and leaves the rest unmounted.

	Operator keys: `d` shows the overlay, `f` toggles fullscreen. The overlay
	reports on the connection and holds the filter: artefacts, images and events
	can each be left out of the field, which is then laid out again without them.
	Beside it sit sliders for how the field moves and how it is drawn (see
	#lib/installation/knobs), each taking hold as it is dragged.
	A mouse drag on this page moves the field too, and a trackpad or touch
	pinch zooms it, as a fallback if the iPad's connection drops. Two fingers
	swiping on the laptop's trackpad steer it as one finger on the iPad does
	(see #lib/installation/trackpad).
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
		floorZoom,
		focusAmount,
		focusScale,
		isPicture,
		itemScale,
		layoutField,
		nearestItem,
		offsetFrom,
		openHeight,
		parting,
		roomNeeded,
		smoothstep,
		thinningRoom,
		thinningStarts,
		widestZoom,
		type Group,
		type Placed,
		type World
	} from '#lib/installation/field.ts';
	import { createGesture } from '#lib/installation/gesture.ts';
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
	import { createSim, TUNING, type Sim, type Tuning } from '#lib/installation/physics.ts';
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
	/**
	 * How quickly an event card grows to hold its details, per second: about
	 * as long as its details take to unfold (see `.details`).
	 */
	const OPEN_RATE = 6;
	/** How long a thing takes to step aside, or come back, as the zoom changes (s). */
	const LOD_FADE = 0.45;
	/**
	 * How far back past its threshold the zoom must go before a thing changes
	 * its mind, as a share: so a pinch resting on a threshold doesn't flicker.
	 */
	const HYSTERESIS = 0.06;
	/**
	 * The share of its size a thing keeps as it finishes stepping aside, or
	 * starts coming back: it dwindles almost to a point rather than vanishing
	 * at full size.
	 */
	const LOD_SMALLEST = 0.03;
	/**
	 * How far into its fade (presence, 0..1) a thing stays solid: it only turns
	 * clear over this last stretch, once it has already shrunk to a speck.
	 */
	const LOD_CLEAR = 0.2;
	/**
	 * A bubble's type size, as a share of a layout cell at zoom 1: a season's
	 * larger than a year's, so it reads as the heading it is.
	 */
	const BUBBLE_FONT: Record<Group['level'], number> = { season: 0.32, year: 0.2 };
	/**
	 * The smallest type (px) a bubble is drawn at. A year's steps aside below
	 * it; a season's stays at it, so however far out the field is zoomed, the
	 * seasons are still named. Its head is two cells tall and the channels
	 * either side of it two cells wide, so even at the widest zoom there is
	 * water enough for it.
	 */
	const BUBBLE_MIN_FONT = 13;
	/** The farthest a trackpad's ctrl-wheel step may zoom at once (as wheel px). */
	const WHEEL_STEP = 50;

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
	let stats = $state({ fps: 0, mounted: 0, mode: '', speed: 0, zoom: 1, shown: 0 });
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

	// Level of detail, by placed index: each item's room (see thinningRoom),
	// whether it is wanted at the shown zoom, and how far it is in (0..1).
	// Made afresh with each layout.
	let room: Float64Array = new Float64Array(0);
	let wanted = new Uint8Array(0);
	let presence = new Float32Array(0);
	/** Where the event cards go and the lens rests, set by the pictures' rooms. */
	let cardZoom = 0;
	let lensZoom = 0;
	let lensWanted = true;
	let lensDetail = 1;

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const elements = new Map<string, HTMLElement>();
	/**
	 * The size each mounted item was last laid out at. While the zoom or a
	 * fade is under way, items are scaled from it rather than laid out afresh
	 * every frame, which hundreds at once would make slow, and they are laid out
	 * at their exact size, crisp, once it settles.
	 */
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
	/** Each season's and year's bubble, by its group's key. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const bubbles = new Map<string, HTMLElement>();
	/** Each bubble's level of detail, as the items': wanted, how far in, and its type size. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the frame loop, never rendered
	const bubbleState = new Map<string, { wanted: boolean; presence: number; font: number }>();
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

	/** Registers a season's or year's bubble for the frame loop to place. */
	function trackBubble(key: string) {
		return (node: HTMLElement) => {
			bubbles.set(key, node);
			return () => {
				bubbles.delete(key);
				bubbleState.delete(key);
			};
		};
	}

	/** Eases a presence (0..1) for drawing, so a fade starts and lands gently. */
	const ease = (p: number) => smoothstep(0, 1, p);
	/** The share of its size a thing is drawn at, by its eased presence. */
	const dwindle = (shown: number) => LOD_SMALLEST + (1 - LOD_SMALLEST) * shown;
	/** How solid a thing is drawn, by its presence: clear only at the very end. */
	const solidity = (p: number) => smoothstep(0, LOD_CLEAR, p);

	/** The zooms that depend on the layout and the screen: thresholds, and how far out it may go. */
	function fitZoom() {
		if (!world || !sim) return;
		const w = world;
		const viewH = window.innerHeight;
		// Cards step aside just before the first picture would, and the lens
		// just before them, so no picture is thinned while a card still shows.
		const pictureRooms = w.placed.flatMap((p, i) => (isPicture(p.item) ? [room[i]] : []));
		cardZoom = Math.min(0.9, Math.max(0.5, thinningStarts(pictureRooms, viewH) * 1.08));
		lensZoom = Math.min(0.95, cardZoom * 1.08);
		sim.setZoomRange(
			Math.max(TUNING.minZoom, widestZoom(w, window.innerWidth, viewH, viewH * 0.1)),
			TUNING.maxZoom
		);
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
		// Items that stay are a new size in the new layout: draw them all afresh,
		// fading in. Pictures outrank cards: every picture is placed in the
		// thinning order before any card.
		sizes.clear();
		openness.clear();
		visibleKey = null;
		room = thinningRoom(laid, (p) => (isPicture(p.item) ? 0 : 1));
		wanted = new Uint8Array(laid.placed.length);
		presence = new Float32Array(laid.placed.length);
		world = laid;
		fitZoom();
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
					else if (message.t === 'z') sim.pinch(message.f, now());
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
			if (!sim || !world) return;
			const w = world;
			const t = ms / 1000;

			sim.step(dt, t, (point) => nearestItem(w, point, w.cell * 1.5));
			// Keep the numbers small over a long night; the view is the same.
			const cam = sim.cam;
			if (Math.abs(cam.x) > w.width * 4 || Math.abs(cam.y) > w.height * 4) {
				sim.shift(-Math.round(cam.x / w.width) * w.width, -Math.round(cam.y / w.height) * w.height);
			}

			const zoom = sim.scale;
			// How much bigger than at rest items are drawn, and the room a picture
			// needs to be shown, at this zoom.
			const grown = itemScale(zoom, floorZoom(w.cell, viewH));
			const need = roomNeeded(zoom, viewH);
			// A long hitch (a hidden tab) finishes a fade rather than skipping it.
			const fade = Math.min(Math.max(dt, 0), 0.1) / LOD_FADE;
			const step = (p: number, on: boolean) => Math.min(1, Math.max(0, p + (on ? fade : -fade)));

			lensWanted = zoom >= lensZoom * (lensWanted ? 1 - HYSTERESIS : 1);
			lensDetail = step(lensDetail, lensWanted);

			const calm = calmness(sim.speed);
			// 0 while the field is left to the current, or zoomed too far out:
			// nothing comes into focus.
			const lensAt = sim.lens * ease(lensDetail);
			const lensRadius = viewH * view.lens;
			// Items are mounted this far (screen px) past the screen's edge, so
			// they never pop in.
			const margin = w.cell * grown;
			const halfW = viewW / 2 + margin;
			const halfH = viewH / 2 + margin;

			// Which items are wanted and near the screen, and which is most in focus.
			const near: {
				placed: Placed;
				x: number;
				y: number;
				focus: number;
				shown: number;
				solid: number;
			}[] = [];
			let best: (typeof near)[number] | null = null;
			let shownCount = 0;
			for (let i = 0; i < w.placed.length; i++) {
				const placed = w.placed[i];
				const slack = wanted[i] ? 1 - HYSTERESIS : 1;
				const want =
					room[i] >= need * slack && (isPicture(placed.item) || zoom >= cardZoom * slack);
				wanted[i] = want ? 1 : 0;
				if (want) shownCount++;
				presence[i] = step(presence[i], want);
				if (presence[i] === 0) continue;

				const offset = offsetFrom(sim.cam, placed, w);
				const x = offset.x * zoom;
				const y = offset.y * zoom;
				if (Math.abs(x) > halfW || Math.abs(y) > halfH) continue;
				const shown = ease(presence[i]);
				const focus = focusAmount(Math.hypot(x, y), lensRadius) * lensAt * shown;
				const entry = { placed, x, y, focus, shown, solid: solidity(presence[i]) };
				near.push(entry);
				if (focus > 0 && (!best || focus > best.focus)) best = entry;
			}

			if (ms - fpsSince > 1000) {
				stats = {
					fps: Math.round((frames * 1000) / (ms - fpsSince)),
					mounted: elements.size,
					mode: sim.mode,
					speed: Math.round(sim.speed),
					zoom: Math.round(zoom * 100) / 100,
					shown: shownCount
				};
				frames = 0;
				fpsSince = ms;
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
				bloomScale(p.w * grown, p.h * grown, viewW, viewH, view.bloom, view.bloom * BLOOM_WIDTH);
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
			const bestSize = best ? sizeOf(best.placed, grown * bestScale) : null;
			const reach = bestSize
				? Math.max(bestSize.width, bestSize.height) / 2 + w.cell * grown * 0.35
				: 0;
			// Laid out afresh only once the size has drifted this far, while moving.
			const tolerance = sim.zooming ? 0.35 : 0.002;

			for (const entry of near) {
				const element = elements.get(entry.placed.item.id);
				if (!element) continue;
				const { placed } = entry;
				const isBest = entry === best;
				const focused = isBest ? bestScale : focusScale(entry.focus, calm, bloomOf(placed));
				const scale = grown * focused;
				let x = entry.x;
				let y = entry.y;
				if (!isBest && best) {
					const push = parting(
						{ x: x - best.x, y: y - best.y },
						reach + (Math.max(placed.w, placed.h) * grown) / 2,
						bloomAmount
					);
					x += push.x;
					y += push.y;
				}
				// A slow bob, stilled as an item comes into focus.
				const bob = (1 - entry.focus) * 5;
				x += Math.sin((t / 9 + placed.phase) * Math.PI * 2) * bob * 0.6;
				y += Math.sin((t / 7 + placed.phase) * Math.PI * 2) * bob;

				const full = sizeOf(placed, scale);
				// Sized rather than scaled once still, so a bloomed picture or card
				// text is drawn crisp at its full size instead of stretched. A scale
				// keeps the shape an item was laid out at, so an event card growing
				// taller as it opens is laid out afresh whenever its height parts from it.
				// It is laid out at the size it has when fully present, so a card
				// stepping aside dwindles whole instead of its text rewrapping into a sliver.
				let laid = sizes.get(placed.item.id);
				const drift = entry.shown === 1 ? tolerance : 0.35;
				if (
					!laid ||
					Math.abs(full.width / laid.width - 1) > drift ||
					Math.abs((full.height * laid.width) / full.width - laid.height) > 0.5
				) {
					laid = full;
					sizes.set(placed.item.id, laid);
					element.style.width = `${full.width}px`;
					element.style.height = `${full.height}px`;
				}
				// Stepping aside, an item dwindles almost to a point before it clears.
				const shrink = dwindle(entry.shown);
				const width = full.width * shrink;
				const height = full.height * shrink;
				element.style.transform = `translate3d(${viewW / 2 + x - width / 2}px, ${viewH / 2 + y - height / 2}px, 0) scale(${width / laid.width})`;
				const rest = 0.45 + 0.35 * calm;
				element.style.opacity = String((rest + (1 - rest) * entry.focus) * entry.solid);
				element.style.zIndex = isBest ? '3' : entry.focus > 0 ? '2' : '1';
			}

			// The season and year bubbles ride the water with the items, part around
			// a bloom like them, and fade a little while one is open, so it holds
			// the eye. A bubble is sized with the zoom, so it keeps to the clear
			// water the layout leaves for it, and steps aside (fading, like the
			// items) once its name would be too small to read. A season's never
			// does: it keeps to the smallest readable size instead.
			for (const group of w.groups) {
				const element = bubbles.get(group.key);
				if (!element) continue;
				const natural = w.cell * BUBBLE_FONT[group.level] * zoom;
				const bubbleFont = group.level === 'season' ? Math.max(natural, BUBBLE_MIN_FONT) : natural;
				const state = bubbleState.get(group.key) ?? { wanted: false, presence: 0, font: 0 };
				bubbleState.set(group.key, state);
				state.wanted = bubbleFont >= BUBBLE_MIN_FONT * (state.wanted ? 1 - HYSTERESIS : 1);
				state.presence = step(state.presence, state.wanted);
				const offset = offsetFrom(sim.cam, group, w);
				let x = offset.x * zoom;
				let y = offset.y * zoom;
				if (state.presence === 0 || Math.abs(x) > halfW || Math.abs(y) > halfH) {
					element.style.visibility = 'hidden';
					continue;
				}
				if (best) {
					const push = parting(
						{ x: x - best.x, y: y - best.y },
						reach + w.cell * zoom * 0.7,
						bloomAmount
					);
					x += push.x;
					y += push.y;
				}
				y += Math.sin((t / 8 + bubblePhase(group)) * Math.PI * 2) * 4;
				// Set as type, not scaled, so the name stays crisp; only when it has
				// changed enough to matter, as with the items' sizes.
				if (Math.abs(bubbleFont / state.font - 1) > (sim.zooming ? 0.08 : 0.002)) {
					state.font = bubbleFont;
					element.style.fontSize = `${bubbleFont}px`;
				}
				const shown = ease(state.presence);
				element.style.visibility = 'visible';
				element.style.transform = `translate3d(${viewW / 2 + x}px, ${viewH / 2 + y}px, 0) scale(${(bubbleFont / state.font) * dwindle(shown)})`;
				element.style.opacity = String(0.92 * (1 - 0.6 * bloomAmount) * solidity(state.presence));
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
				const bottom = viewH / 2 + focused.y + (focused.placed.h * grown * bestScale) / 2;
				captionEl.style.top = `${Math.min(bottom + 18, viewH - 90)}px`;
			}
		};
		frame = requestAnimationFrame(tick);

		const onResize = () => {
			viewW = window.innerWidth;
			viewH = window.innerHeight;
			fitZoom();
		};

		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'd') overlay = !overlay;
			if (event.key === 'f') {
				if (document.fullscreenElement) void document.exitFullscreen();
				else void document.documentElement.requestFullscreen().catch(() => {});
			}
		};

		// The fallback: a mouse, or fingers on a touch screen, move the field
		// directly (gain 1), and two fingers pinch it.
		const gesture = createGesture({
			down: () => sim?.down(now()),
			drag: (dx, dy) => sim?.drag(dx, dy, now(), 1),
			pinch: (factor) => sim?.pinch(factor, now(), 1),
			up: (vx, vy) => sim?.up(vx, vy, now(), 1)
		});
		const onDown = (event: PointerEvent) => {
			// A click on the overlay's filter or sliders is not a hand on the water.
			if (event.target instanceof Element && event.target.closest('.kinds, .knobs')) return;
			gesture.pointerDown(event.pointerId, event.clientX, event.clientY, event.timeStamp);
		};
		const onMove = (event: PointerEvent) => {
			gesture.pointerMove(event.pointerId, [
				{ t: event.timeStamp, x: event.clientX, y: event.clientY }
			]);
		};
		const onUp = (event: PointerEvent) => {
			gesture.pointerUp(event.pointerId, event.timeStamp, event.type === 'pointercancel');
		};

		// A trackpad's pinch. Chromium and Firefox send it as a wheel with ctrlKey
		// set, and zoom the page unless told not to; Safari sends its own gesture
		// events instead, with the scale since the pinch began. A wheel during a
		// Safari gesture is ignored, so a browser sending both can't zoom twice,
		// and so is a gesture while two fingers are already pinching on a touch
		// screen, which the pointers above have counted.
		//
		// Any other wheel is two fingers swiping on the trackpad (or a mouse's
		// wheel), and steers like a finger on the iPad. The sliders' panel still
		// scrolls as any panel does; nowhere else scrolls or swipes back a page.
		let safariPinch = false;
		let safariScale = 1;
		const onWheel = (event: WheelEvent) => {
			if (event.ctrlKey) {
				event.preventDefault();
				if (safariPinch || !sim) return;
				const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewH : 1;
				const delta = Math.max(-WHEEL_STEP, Math.min(WHEEL_STEP, event.deltaY * unit));
				sim.pinch(Math.exp(-delta * 0.01), now(), 1);
				return;
			}
			if (event.target instanceof Element && event.target.closest('.kinds, .knobs')) return;
			event.preventDefault();
			// A mouse button or a finger on a touch screen is already steering.
			if (gesture.count > 0) return;
			trackpad.feed(wheelInput(event, viewH));
		};
		const onGestureStart = (event: Event) => {
			event.preventDefault();
			safariPinch = true;
			safariScale = 1;
		};
		const onGestureChange = (event: Event) => {
			event.preventDefault();
			const scale = (event as Event & { scale?: number }).scale ?? 1;
			if (sim && scale > 0 && gesture.count < 2) sim.pinch(scale / safariScale, now(), 1);
			safariScale = scale;
		};
		const onGestureEnd = (event: Event) => {
			event.preventDefault();
			safariPinch = false;
		};

		window.addEventListener('resize', onResize);
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
		// Not passive, or the browser scrolls, zooms or swipes back before it can be refused.
		window.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('gesturestart', onGestureStart);
		window.addEventListener('gesturechange', onGestureChange);
		window.addEventListener('gestureend', onGestureEnd);

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
			window.removeEventListener('wheel', onWheel);
			window.removeEventListener('gesturestart', onGestureStart);
			window.removeEventListener('gesturechange', onGestureChange);
			window.removeEventListener('gestureend', onGestureEnd);
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
		<div
			class="bubble"
			class:season={group.level === 'season'}
			style:visibility="hidden"
			{@attach trackBubble(group.key)}
		>
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
			<dt>zoom</dt>
			<dd>{stats.zoom}× ({stats.shown} shown)</dd>
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
		/* Fingers on a touch screen steer the field, not the page. */
		touch-action: none;
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
		will-change: transform, opacity;
		/* Scaled from its top left corner while the zoom moves (see `sizes`). */
		transform-origin: 0 0;
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

	/* A year's name, at the center of its island, or a season's, at the head
	   of its archipelago. Sized by the layout's cell, so it fits the clear
	   water the layout keeps for it on any projector: a year's three cells
	   wide and one tall, a season's a band two cells tall across its whole
	   width. The frame loop sets the size it is drawn at; these match it at
	   zoom 1 (see BUBBLE_FONT). */
	.bubble {
		position: absolute;
		left: 0;
		top: 0;
		translate: -50% -50%;
		will-change: transform;
		padding: 0.3em 0.8em;
		font-family: var(--font-friendly);
		font-size: calc(var(--cell) * 0.2);
		line-height: 1.1;
		white-space: nowrap;
		color: oklch(0.32 0.04 250);
		background: oklch(0.98 0.012 90 / 0.88);
		border-radius: 999px;
		box-shadow: 0 0.1em 0.6em oklch(0.3 0.04 250 / 0.12);
		pointer-events: none;
		z-index: 2;
	}
	/* A season's name heads the years under it, so it is set apart from theirs:
	   larger, bolder, and dark on the water where theirs are light. */
	.bubble.season {
		padding: 0.25em 0.9em;
		font-size: calc(var(--cell) * 0.32);
		font-weight: 600;
		letter-spacing: 0.02em;
		color: oklch(0.97 0.012 90);
		background: oklch(0.34 0.05 250 / 0.9);
		box-shadow: 0 0.1em 0.8em oklch(0.3 0.04 250 / 0.22);
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
