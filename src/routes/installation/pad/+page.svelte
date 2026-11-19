<!--
	Archive Stream, the iPad side: a frosted pane of slowly moving color that
	shows nothing of the archive. It is the water. One finger in it moves the
	field on the projector. Its glow takes the color of whatever is in focus
	there, and a ripple answers the finger at once, whatever the network is
	doing, so the touch never feels unanswered.

	One finger only: the first to touch owns the gesture and any others are
	ignored, so a resting palm or a second hand can't make the field jitter.

	Set up once per iPad: open this page with ?relay=…&room=…&key=… (they're
	remembered), Add to Home Screen, and lock it with Guided Access.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_INSTALLATION_RELAY_URL } from '$app/env/public';
	import { releaseVelocity, type Sample } from '#lib/installation/physics.ts';
	import {
		connectRelay,
		readRelayConfig,
		type Relay,
		type RelayState
	} from '#lib/installation/relay.ts';

	/** Seconds without a touch before the invitation shows again. */
	const INVITE_AFTER = 30;
	/** A new ripple once the finger has moved this far (px) since the last. */
	const RIPPLE_EVERY = 46;
	const MAX_RIPPLES = 14;

	type Ripple = { id: number; x: number; y: number };

	let surface: HTMLElement | undefined = $state();
	let ripples = $state<Ripple[]>([]);
	let inviting = $state(true);
	let glow = $state<[number, number, number]>([148, 202, 231]);
	let connection = $state<RelayState | 'unconfigured'>('connecting');

	let nextRipple = 0;
	function ripple(x: number, y: number) {
		const id = nextRipple++;
		ripples = [...ripples.slice(-(MAX_RIPPLES - 1)), { id, x, y }];
		setTimeout(() => (ripples = ripples.filter((r) => r.id !== id)), 1400);
	}

	onMount(() => {
		let relay: Relay | null = null;
		const config = readRelayConfig(page.url.searchParams, PUBLIC_INSTALLATION_RELAY_URL);
		if (config) {
			relay = connectRelay({
				config,
				role: 'pad',
				onMessage(message) {
					if (message.t === 'focus' && message.rgb) glow = message.rgb;
				},
				onStatus(status) {
					connection = status.state;
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

		// Finger travel is gathered and sent once a frame, not once per event:
		// the iPad reports touches at up to 240 Hz, far more than the projector draws.
		let finger: number | null = null;
		let last = { x: 0, y: 0 };
		let lastRipple = { x: 0, y: 0 };
		let pendingX = 0;
		let pendingY = 0;
		let samples: Sample[] = [];
		let lastTouch = performance.now();
		let frame = 0;

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
		};
		const tick = () => {
			frame = requestAnimationFrame(tick);
			flush();
			if (!inviting && finger === null && performance.now() - lastTouch > INVITE_AFTER * 1000) {
				inviting = true;
			}
		};
		frame = requestAnimationFrame(tick);

		const onDown = (event: PointerEvent) => {
			event.preventDefault();
			keepAwake();
			if (finger !== null) return;
			finger = event.pointerId;
			node.setPointerCapture(event.pointerId);
			last = { x: event.clientX, y: event.clientY };
			lastRipple = last;
			samples = [{ t: event.timeStamp, ...last }];
			lastTouch = performance.now();
			inviting = false;
			ripple(last.x, last.y);
			relay?.send({ t: 'down' });
		};

		const onMove = (event: PointerEvent) => {
			if (event.pointerId !== finger) return;
			event.preventDefault();
			// Every sample the hardware took since the last event, for an exact
			// release velocity.
			const points = event.getCoalescedEvents?.() ?? [];
			for (const point of points.length ? points : [event]) {
				samples.push({ t: point.timeStamp, x: point.clientX, y: point.clientY });
			}
			const cutoff = event.timeStamp - 200;
			while (samples.length > 2 && samples[0].t < cutoff) samples.shift();

			pendingX += event.clientX - last.x;
			pendingY += event.clientY - last.y;
			last = { x: event.clientX, y: event.clientY };
			lastTouch = performance.now();
			if (Math.hypot(last.x - lastRipple.x, last.y - lastRipple.y) > RIPPLE_EVERY) {
				lastRipple = last;
				ripple(last.x, last.y);
			}
		};

		const onUp = (event: PointerEvent) => {
			if (event.pointerId !== finger) return;
			finger = null;
			// For a touch, the lift is what counts as the user's activation.
			keepAwake();
			flush();
			const v =
				event.type === 'pointercancel' ? { x: 0, y: 0 } : releaseVelocity(samples, event.timeStamp);
			relay?.send({ t: 'up', vx: Math.round(v.x), vy: Math.round(v.y) });
			lastTouch = performance.now();
		};

		node.addEventListener('pointerdown', onDown);
		node.addEventListener('pointermove', onMove);
		node.addEventListener('pointerup', onUp);
		node.addEventListener('pointercancel', onUp);

		return () => {
			cancelAnimationFrame(frame);
			relay?.close();
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

<div class="pad" bind:this={surface} style:--glow="{glow[0]} {glow[1]} {glow[2]}">
	<div class="water" aria-hidden="true">
		<span class="current one"></span>
		<span class="current two"></span>
		<span class="current three"></span>
	</div>

	{#each ripples as r (r.id)}
		<span class="ripple" style:left="{r.x}px" style:top="{r.y}px" aria-hidden="true"></span>
	{/each}

	<p class="invite" class:shown={inviting}>Touch &amp; drag to navigate the Archive</p>

	<!-- For whoever is running the night, not the visitors: a tiny mark in the
	     corner that shows only when the connection is down. -->
	{#if connection !== 'open'}
		<span class="status" title={connection}>
			{connection === 'unconfigured' ? 'no relay set (open with ?relay=…&key=…)' : ''}
		</span>
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
		background: oklch(0.93 0.02 230);
		z-index: 50;
	}

	/* Three soft pools of color drifting slowly under frosted glass. */
	.water {
		position: absolute;
		inset: -20%;
		filter: blur(70px) saturate(1.1);
	}
	.current {
		position: absolute;
		width: 70%;
		height: 70%;
		border-radius: 50%;
		background: rgb(var(--glow) / 0.85);
		transition: background-color 1.6s ease;
		animation: drift 26s ease-in-out infinite alternate;
	}
	.current.one {
		left: 0;
		top: 5%;
	}
	.current.two {
		right: 0;
		top: 25%;
		background: oklch(0.9 0.05 230 / 0.9);
		animation-duration: 33s;
		animation-delay: -9s;
	}
	.current.three {
		left: 20%;
		bottom: 0;
		background: rgb(var(--glow) / 0.55);
		animation-duration: 41s;
		animation-delay: -17s;
	}
	@keyframes drift {
		from {
			translate: -8% -6%;
			scale: 1;
		}
		to {
			translate: 10% 8%;
			scale: 1.15;
		}
	}

	.ripple {
		position: absolute;
		width: 160px;
		height: 160px;
		margin: -80px 0 0 -80px;
		border-radius: 50%;
		border: 3px solid oklch(1 0 0 / 0.9);
		/* A faint shadow ring and a soft inner glow, so it reads on pale glass too. */
		box-shadow:
			0 0 0 1px oklch(0.45 0.05 240 / 0.22),
			inset 0 0 28px oklch(1 0 0 / 0.55);
		pointer-events: none;
		animation: ripple 1.4s ease-out forwards;
	}
	@keyframes ripple {
		from {
			scale: 0.15;
			opacity: 0.9;
		}
		to {
			scale: 1.6;
			opacity: 0;
		}
	}

	.invite {
		position: absolute;
		inset: auto 0 12%;
		margin: 0;
		text-align: center;
		font-family: var(--font-friendly);
		font-size: clamp(1.4rem, 3.4vw, 2.4rem);
		color: oklch(0.42 0.06 70);
		opacity: 0;
		transition: opacity 1.2s ease;
		pointer-events: none;
	}
	.invite.shown {
		opacity: 0.85;
		animation: breathe 5s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			opacity: 0.5;
		}
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
