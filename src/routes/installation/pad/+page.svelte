<!--
	Archive Stream, the iPad side: a hazy wash of light blue and white, like
	clouds, that shows nothing of the archive. It is the water. One finger in
	it moves the field on the projector, and the haze moves with the finger
	right here, at once, whatever the network is doing, so the touch never
	feels unanswered. After a flick it glides on and slows just as the
	projector's field does. Two fingers pinch the projector's field closer or
	farther (and drag it by their midpoint), and the haze swells or shrinks
	under them. Its colors never change.

	Two fingers at most: the first two to touch own the gesture and any others
	are ignored, so a resting palm or a third finger can't make the field jitter
	(see #lib/installation/gesture).

	Set up once per iPad: open this page with ?relay=…&room=…&key=… (they're
	remembered), Add to Home Screen, and lock it with Guided Access.

	Operator overlay: hold three fingers on the screen for a second to show or
	hide it (the iPad has no keyboard for the projector's `d`), or open the
	page with ?debug. The water ignores every finger after the second, and three
	fingers held still pinch nothing, so the gesture barely steers anything.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_INSTALLATION_RELAY_URL } from '$app/env/public';
	import { wrapDelta } from '#lib/installation/field.ts';
	import { createGesture } from '#lib/installation/gesture.ts';
	import { decay, TUNING, type Sample } from '#lib/installation/physics.ts';
	import {
		connectRelay,
		readRelayConfig,
		type Relay,
		type RelayConfig,
		type RelayState,
		type RelayStatus
	} from '#lib/installation/relay.ts';
	import RelayOverlay from '#lib/installation/RelayOverlay.svelte';

	/** How many fingers, held how long (ms), show or hide the operator overlay. */
	const OVERLAY_FINGERS = 3;
	const OVERLAY_HOLD_MS = 1000;

	/** The water's own slow drift when nobody is touching it (px/s). */
	const DRIFT = { x: 7, y: 3 };

	/**
	 * The pools of color. `u`, `v` place each on the wrapping water (0..1);
	 * `size` is its diameter as a share of the screen's longer side; `depth`
	 * is how far it moves for a finger's travel, so the pools slide past one
	 * another like water rather than as one rigid sheet; `tone` picks its
	 * color: white haze, a deeper blue, or a light blue a shade off the ground.
	 */
	const POOLS = [
		{ u: 0.12, v: 0.2, size: 0.95, depth: 1, tone: 'blue' },
		{ u: 0.55, v: 0.1, size: 0.95, depth: 0.82, tone: 'white' },
		{ u: 0.82, v: 0.55, size: 1.05, depth: 1.12, tone: 'deep' },
		{ u: 0.35, v: 0.68, size: 1, depth: 0.9, tone: 'white' },
		{ u: 0.68, v: 0.88, size: 0.7, depth: 1.2, tone: 'blue' },
		{ u: 0.05, v: 0.82, size: 0.75, depth: 0.75, tone: 'deep' },
		{ u: 0.45, v: 0.38, size: 0.75, depth: 1.05, tone: 'white' }
	] as const;

	let surface: HTMLElement | undefined = $state();
	const pools: HTMLElement[] = $state([]);
	let connection = $state<RelayState | 'unconfigured'>('connecting');
	let relayConfig = $state.raw<RelayConfig | null>(null);
	let relayStatus = $state<RelayStatus | null>(null);
	let overlay = $state(false);
	let fingers = $state(0);

	onMount(() => {
		let relay: Relay | null = null;
		overlay = page.url.searchParams.has('debug');
		const config = readRelayConfig(page.url.searchParams, PUBLIC_INSTALLATION_RELAY_URL);
		relayConfig = config;
		if (config) {
			relay = connectRelay({
				config,
				role: 'pad',
				// The projector sends nothing back but its round-trip pings.
				onMessage() {},
				onStatus(status) {
					connection = status.state;
					relayStatus = status;
				}
			});
		} else {
			connection = 'unconfigured';
		}

		// Keep the screen awake. iPadOS grants the lock only after a touch, so
		// it is asked for again on each one until it holds, and again whenever
		// the page comes back into view (the lock lapses while it is hidden).
		let wakeLock: WakeLockSentinel | null = null;
		const keepAwake = () => {
			if (wakeLock && !wakeLock.released) return;
			navigator.wakeLock
				?.request('screen')
				.then((lock) => (wakeLock = lock))
				.catch(() => {});
		};
		keepAwake();
		const onVisibility = () => {
			if (document.visibilityState === 'visible') keepAwake();
		};
		document.addEventListener('visibilitychange', onVisibility);

		// Safari zooms on a pinch even when told not to; refuse its gesture events.
		const refuse = (event: Event) => event.preventDefault();
		document.addEventListener('gesturestart', refuse);
		document.addEventListener('gesturechange', refuse);
		document.addEventListener('dblclick', refuse);
		document.addEventListener('contextmenu', refuse);
		// And never let a touch scroll or bounce the page.
		const node = surface!;
		node.addEventListener('touchmove', refuse, { passive: false });
		node.addEventListener('touchstart', refuse, { passive: false });

		// Finger travel and pinching are gathered and sent once a frame, not once
		// per event: the iPad reports touches at up to 240 Hz, far more than the
		// projector draws.
		let pendingX = 0;
		let pendingY = 0;
		let pendingZoom = 1;
		let frame = 0;

		// The water: how far it has been moved, how fast it glides on, and how
		// far it has been pinched (its pools swell and shrink with the field).
		const water = { x: 0, y: 0 };
		let glide = { x: 0, y: 0 };
		let waterZoom = 1;
		let viewW = window.innerWidth;
		let viewH = window.innerHeight;
		let lastFrame = performance.now();
		const still = window.matchMedia('(prefers-reduced-motion: reduce)');
		const onResize = () => {
			viewW = window.innerWidth;
			viewH = window.innerHeight;
		};
		window.addEventListener('resize', onResize);

		/**
		 * Place every pool. The water wraps around a span one pool wider than
		 * the screen on each side, so a pool leaves one edge wholly faded out
		 * before it comes back in at the other, and the jump is never seen.
		 */
		const drawWater = (seconds: number) => {
			const longer = Math.max(viewW, viewH);
			// Gentler than the field's zoom: the haze only answers the pinch.
			const swell = Math.pow(waterZoom, 0.4);
			const reach = longer * 0.6;
			const spanW = viewW + 2 * reach;
			const spanH = viewH + 2 * reach;
			POOLS.forEach((pool, i) => {
				const node = pools[i];
				if (!node) return;
				const size = pool.size * longer * swell;
				// A slow sway of its own, so the water is never quite still.
				const swayX = still.matches ? 0 : Math.sin(seconds / (11 + i * 2) + i) * 18;
				const swayY = still.matches ? 0 : Math.cos(seconds / (13 + i * 3) + i * 2) * 14;
				const x =
					viewW / 2 + wrapDelta((pool.u - 0.5) * spanW + water.x * pool.depth + swayX, spanW);
				const y =
					viewH / 2 + wrapDelta((pool.v - 0.5) * spanH + water.y * pool.depth + swayY, spanH);
				node.style.width = `${size}px`;
				node.style.height = `${size}px`;
				node.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0)`;
			});
		};

		const flush = () => {
			if (pendingX !== 0 || pendingY !== 0) {
				relay?.send({
					t: 'd',
					dx: Math.round(pendingX * 10) / 10,
					dy: Math.round(pendingY * 10) / 10
				});
				pendingX = 0;
				pendingY = 0;
			}
			if (Math.abs(pendingZoom - 1) > 1e-4) {
				// What rounding leaves out is carried to the next frame, not lost.
				const f = Math.round(pendingZoom * 1e4) / 1e4;
				relay?.send({ t: 'z', f });
				pendingZoom /= f;
			}
		};
		const tick = (ms: number) => {
			frame = requestAnimationFrame(tick);
			const dt = Math.min(Math.max((ms - lastFrame) / 1000, 0), TUNING.maxStep);
			lastFrame = ms;
			flush();
			if (gesture.count === 0) {
				// Glide on after a flick, slowing as the projector's field does.
				const keep = decay(TUNING.glideHalfLife, dt);
				glide = { x: glide.x * keep, y: glide.y * keep };
				const drift = still.matches ? { x: 0, y: 0 } : DRIFT;
				water.x += (glide.x + drift.x) * dt;
				water.y += (glide.y + drift.y) * dt;
			}
			drawWater(ms / 1000);
		};
		frame = requestAnimationFrame(tick);

		const gesture = createGesture({
			down() {
				// A finger in the water stops it gliding.
				glide = { x: 0, y: 0 };
				relay?.send({ t: 'down' });
			},
			drag(dx, dy) {
				pendingX += dx;
				pendingY += dy;
				// The water under the finger moves with it, drawn on the next frame.
				water.x += dx;
				water.y += dy;
			},
			pinch(factor) {
				pendingZoom *= factor;
				waterZoom = Math.min(
					TUNING.maxZoom,
					Math.max(TUNING.minZoom, waterZoom * Math.pow(factor, TUNING.zoomGain))
				);
			},
			up(vx, vy) {
				flush();
				relay?.send({ t: 'up', vx: Math.round(vx), vy: Math.round(vy) });
				glide = { x: vx, y: vy };
			}
		});

		const onDown = (event: PointerEvent) => {
			event.preventDefault();
			keepAwake();
			if (gesture.pointerDown(event.pointerId, event.clientX, event.clientY, event.timeStamp)) {
				node.setPointerCapture(event.pointerId);
			}
		};

		const onMove = (event: PointerEvent) => {
			// Every sample the hardware took since the last event, for an exact
			// release velocity.
			const coalesced = event.getCoalescedEvents?.() ?? [];
			const points: Sample[] = (coalesced.length ? coalesced : [event]).map((point) => ({
				t: point.timeStamp,
				x: point.clientX,
				y: point.clientY
			}));
			if (gesture.pointerMove(event.pointerId, points)) event.preventDefault();
		};

		const onUp = (event: PointerEvent) => {
			// For a touch, the lift is what counts as the user's activation.
			if (gesture.pointerUp(event.pointerId, event.timeStamp, event.type === 'pointercancel')) {
				keepAwake();
			}
		};

		// The operator's gesture: every finger on the glass is counted, and
		// holding OVERLAY_FINGERS still for OVERLAY_HOLD_MS toggles the overlay.
		// Any finger added or lifted starts the count again, so it can't fire
		// mid-swipe.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- only its size is rendered, via `fingers`
		const touching = new Set<number>();
		let holdTimer: ReturnType<typeof setTimeout> | undefined;
		const recount = () => {
			fingers = touching.size;
			clearTimeout(holdTimer);
			if (touching.size === OVERLAY_FINGERS) {
				holdTimer = setTimeout(() => (overlay = !overlay), OVERLAY_HOLD_MS);
			}
		};
		const onFingerDown = (event: PointerEvent) => {
			touching.add(event.pointerId);
			recount();
		};
		const onFingerUp = (event: PointerEvent) => {
			if (touching.delete(event.pointerId)) recount();
		};

		node.addEventListener('pointerdown', onDown);
		node.addEventListener('pointermove', onMove);
		node.addEventListener('pointerup', onUp);
		node.addEventListener('pointercancel', onUp);
		node.addEventListener('pointerdown', onFingerDown);
		node.addEventListener('pointerup', onFingerUp);
		node.addEventListener('pointercancel', onFingerUp);

		return () => {
			cancelAnimationFrame(frame);
			relay?.close();
			window.removeEventListener('resize', onResize);
			void wakeLock?.release().catch(() => {});
			document.removeEventListener('visibilitychange', onVisibility);
			document.removeEventListener('gesturestart', refuse);
			document.removeEventListener('gesturechange', refuse);
			document.removeEventListener('dblclick', refuse);
			document.removeEventListener('contextmenu', refuse);
			node.removeEventListener('touchmove', refuse);
			node.removeEventListener('touchstart', refuse);
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', onUp);
			node.removeEventListener('pointercancel', onUp);
			node.removeEventListener('pointerdown', onFingerDown);
			node.removeEventListener('pointerup', onFingerUp);
			node.removeEventListener('pointercancel', onFingerUp);
			clearTimeout(holdTimer);
		};
	});
</script>

<svelte:head>
	<title>Archive Stream</title>
	<meta name="robots" content="noindex" />
	<!-- Opened from the Home Screen, it fills the screen with no browser around it. -->
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Archive Stream" />
</svelte:head>

<div class="pad" bind:this={surface}>
	<div class="water" aria-hidden="true">
		{#each POOLS as pool, i (i)}
			<span class="pool {pool.tone}" bind:this={pools[i]}></span>
		{/each}
	</div>

	<!-- For whoever is running the night, not the visitors: a tiny mark in the
	     corner that shows only when the connection is down. -->
	{#if connection !== 'open'}
		<span class="status" title={connection}>
			{connection === 'unconfigured' ? 'no relay set (open with ?relay=…&key=…)' : ''}
		</span>
	{/if}

	{#if overlay}
		<RelayOverlay config={relayConfig} status={relayStatus} peerName="projector">
			<dt>fingers</dt>
			<dd>{fingers}</dd>
		</RelayOverlay>
	{/if}
</div>

<style>
	/* No scrollbar gutter (the site keeps one at both edges) and no scrolling. */
	:global(html:has(.pad)) {
		scrollbar-gutter: auto;
		overflow: hidden;
	}

	.pad {
		position: fixed;
		inset: 0;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		overscroll-behavior: none;
		/* The ground: a light blue the haze drifts over. */
		background: oklch(0.9 0.045 230);
		z-index: 50;
	}

	/* Soft pools of haze, each a radial gradient fading to nothing at its
	   edge: blurry without a blur filter, so moving them every frame is cheap. */
	.water {
		position: absolute;
		inset: 0;
	}
	.pool {
		position: absolute;
		left: 0;
		top: 0;
		border-radius: 50%;
		will-change: transform;
		background: radial-gradient(circle closest-side, currentColor 15%, transparent);
	}
	.pool.white {
		color: oklch(0.99 0.006 230);
		opacity: 0.95;
	}
	.pool.blue {
		color: oklch(0.86 0.06 232);
		opacity: 0.8;
	}
	.pool.deep {
		color: oklch(0.78 0.08 236);
		opacity: 0.55;
	}

	.status {
		position: absolute;
		right: 10px;
		bottom: 10px;
		min-width: 8px;
		min-height: 8px;
		border-radius: 999px;
		background: oklch(0.6 0.15 30 / 0.55);
		font:
			0.75rem ui-monospace,
			monospace;
		color: white;
		padding: 0 0.4em;
	}
	.status:empty {
		padding: 0;
	}
</style>
