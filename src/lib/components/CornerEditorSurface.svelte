<script lang="ts">
	import { on } from 'svelte/events';
	import { cornerList, fullFrameCorners, type CornerPoints } from '#lib/scanner/detect.ts';
	import type { CornerEditor } from 'scanic';

	// scanic's imperative corner editor, mounted into a box that fills its parent.
	// It already ships drag handles with a 44px hit area and keyboard nudging, so
	// screens around it only add their own buttons (`toolbar` off). Its magnifier
	// is replaced by the one below.
	// Its on-screen nudge arrows stay off too: they crowd the photo's top-right
	// corner, and arrow keys still nudge a focused corner without them.
	// `image` and `corners` are read once, when the editor mounts: wrap this in
	// a {#key} to show a different image.
	let {
		image,
		corners,
		onChange,
		onConfirm,
		focusHandle = false,
		failed = $bindable(false)
	}: {
		/** The un-cropped original, in its own pixel space. */
		image: HTMLCanvasElement;
		/** Starting quad; defaults to the whole image. */
		corners?: CornerPoints | null;
		/** Every change: drag, arrow keys and `setCorners`. */
		onChange?: (corners: CornerPoints) => void;
		/** Enter on a focused corner handle. */
		onConfirm?: (corners: CornerPoints) => void;
		/** Focus the first corner handle once the editor is up. */
		focusHandle?: boolean;
		/** True once the editor has failed to load; the image is then not shown. */
		failed?: boolean;
	} = $props();

	let container = $state<HTMLDivElement>();
	let editor: CornerEditor | null = null;

	// --- Magnifier -------------------------------------------------------------
	// A corner being dragged is under the finger dragging it, so where it is
	// going has to be shown somewhere else. scanic's own magnifier floats 36px
	// from the touch, and for a corner near the top of the photo it flips to
	// below the corner, which is where the hand is. This one is pinned to the
	// top of the crop area, on the side away from the corner: a hand reaching up
	// from the bottom of a phone never covers that. It shows the photo around
	// the corner enlarged, with the crop's edges drawn over it, so the page's
	// edge can be lined up against them.

	type Corner = keyof CornerPoints;
	/** Across, in CSS pixels. */
	const LOUPE = 144;
	/** Against the photo as it is shown, not against its own pixels. */
	const LOUPE_ZOOM = 3;
	/** The magnifier's gap from the crop area's edges. */
	const LOUPE_INSET = 8;
	/** How near the corner may come before the magnifier moves to the other side. */
	const LOUPE_CLEARANCE = 48;
	/** How long it stays after an arrow-key nudge. */
	const NUDGE_LINGER_MS = 1500;

	let wrapper = $state<HTMLDivElement>();
	let loupe = $state<HTMLCanvasElement>();
	/** The corner being moved, by finger or by arrow keys. */
	let active = $state<Corner | null>(null);
	let side = $state<'left' | 'right'>('right');
	/** The quad as of the last change; not rendered, only drawn from. */
	let latest: CornerPoints | null = null;
	let frame = 0;
	let linger: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Where scanic has put the photo, in the wrapper's coordinates: fitted
	 * inside its container with 12px to spare on each side, and centered.
	 */
	function placement() {
		if (!container || !wrapper || !image.width || !image.height) return null;
		const width = container.clientWidth;
		const height = container.clientHeight;
		const scale = Math.min((width - 24) / image.width, (height - 24) / image.height);
		if (!(scale > 0)) return null;
		return {
			scale,
			left: container.offsetLeft + (width - image.width * scale) / 2,
			top: container.offsetTop + (height - image.height * scale) / 2
		};
	}

	/**
	 * Keep the magnifier on the far side from the corner. Chosen when the move
	 * starts and then left alone, so it doesn't jump as the corner crosses the
	 * middle; it only changes sides if the corner is dragged up underneath it.
	 */
	function chooseSide(starting: boolean) {
		const placed = placement();
		const point = active && latest?.[active];
		if (!placed || !point || !wrapper) return;
		const x = placed.left + point.x * placed.scale;
		const y = placed.top + point.y * placed.scale;
		if (starting) {
			side = x < wrapper.clientWidth / 2 ? 'right' : 'left';
			return;
		}
		const reach = LOUPE_INSET + LOUPE + LOUPE_CLEARANCE;
		if (y > reach) return;
		if (side === 'left' && x < reach) side = 'right';
		else if (side === 'right' && x > wrapper.clientWidth - reach) side = 'left';
	}

	function drawLoupe() {
		frame = 0;
		const placed = placement();
		const point = active && latest?.[active];
		const ctx = loupe?.getContext('2d');
		if (!placed || !point || !latest || !loupe || !ctx) return;

		const ratio = window.devicePixelRatio || 1;
		const pixels = Math.round(LOUPE * ratio);
		if (loupe.width !== pixels) loupe.width = loupe.height = pixels;

		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.fillStyle = '#0b0f19';
		ctx.fillRect(0, 0, LOUPE, LOUPE);

		// Image pixels to magnifier pixels, with the corner at the center.
		const zoom = placed.scale * LOUPE_ZOOM;
		ctx.translate(LOUPE / 2, LOUPE / 2);
		ctx.scale(zoom, zoom);
		ctx.translate(-point.x, -point.y);
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(image, 0, 0);

		// Dimmed outside the crop and edged in green, as the editor draws it, so
		// which side of the line is kept reads the same in both.
		const quad = cornerList(latest);
		const span = LOUPE / zoom;
		ctx.beginPath();
		ctx.rect(point.x - span, point.y - span, span * 2, span * 2);
		ctx.moveTo(quad[0].x, quad[0].y);
		for (const next of quad.slice(1)) ctx.lineTo(next.x, next.y);
		ctx.closePath();
		ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
		ctx.fill('evenodd');

		ctx.beginPath();
		ctx.moveTo(quad[0].x, quad[0].y);
		for (const next of quad.slice(1)) ctx.lineTo(next.x, next.y);
		ctx.closePath();
		ctx.lineJoin = 'round';
		ctx.lineWidth = 2 / zoom;
		ctx.strokeStyle = '#22c55e';
		ctx.stroke();

		// The corner itself: a ring, so the pixels it marks stay visible inside it.
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.beginPath();
		ctx.arc(LOUPE / 2, LOUPE / 2, 9, 0, Math.PI * 2);
		ctx.lineWidth = 3.5;
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.stroke();
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();
	}

	/** At most one draw a frame, however many pointer moves land in it. */
	function refreshLoupe() {
		if (!active) return;
		chooseSide(false);
		if (!frame) frame = requestAnimationFrame(drawLoupe);
	}

	function startMove(corner: Corner) {
		clearTimeout(linger);
		const starting = active !== corner;
		active = corner;
		latest = editor?.getCorners() ?? latest;
		if (starting) chooseSide(true);
		refreshLoupe();
	}

	function endMove() {
		clearTimeout(linger);
		active = null;
	}

	const cornerOf = (event: Event): Corner | null => {
		const handle =
			event.target instanceof Element ? event.target.closest<HTMLElement>('.scanic-handle') : null;
		return (handle?.dataset.corner as Corner | undefined) ?? null;
	};

	// scanic's handles carry the corner they move (`data-corner`) and let their
	// pointer events bubble; it captures the pointer on the handle, so the
	// release reaches here too, wherever on the screen the finger lifts.
	$effect(() => {
		const host = container;
		if (!host) return;
		const stops = [
			on(host, 'pointerdown', (event) => {
				const corner = cornerOf(event);
				if (corner) startMove(corner);
			}),
			on(host, 'pointerup', endMove),
			on(host, 'pointercancel', endMove),
			// An arrow-key nudge moves the corner a pixel at a time: shown for as
			// long as the keys keep coming, and a moment after.
			on(host, 'keydown', (event) => {
				const corner = event.key.startsWith('Arrow') ? cornerOf(event) : null;
				if (!corner) return;
				startMove(corner);
				linger = setTimeout(endMove, NUDGE_LINGER_MS);
			}),
			on(host, 'focusout', endMove)
		];
		return () => {
			for (const stop of stops) stop();
			clearTimeout(linger);
			cancelAnimationFrame(frame);
			frame = 0;
			// Freed now, not when collected: see `releaseCanvas`.
			if (loupe) loupe.width = loupe.height = 0;
		};
	});

	$effect(() => {
		const host = container;
		if (!host) return;

		let disposed = false;
		void (async () => {
			try {
				const { createCornerEditor } = await import('scanic');
				if (disposed) return;
				editor = createCornerEditor({
					container: host,
					image,
					corners: corners ?? fullFrameCorners(image.width, image.height),
					toolbar: { enabled: false },
					magnifier: { enabled: false },
					theme: { accent: '#22c55e' },
					onChange: (next) => {
						latest = next;
						refreshLoupe();
						onChange?.(next);
					},
					onConfirm: (next) => onConfirm?.(next)
				});
				if (focusHandle) host.querySelector<HTMLElement>('.scanic-handle')?.focus();
			} catch {
				failed = true;
			}
		})();

		return () => {
			disposed = true;
			editor?.destroy();
			editor = null;
		};
	});

	/** The quad as it stands, or null until the editor has mounted. */
	export function getCorners(): CornerPoints | null {
		return editor?.getCorners() ?? null;
	}

	/** Reset the quad to the whole image. */
	export function useWhole() {
		editor?.setCorners(fullFrameCorners(image.width, image.height));
	}

	/** Put the quad where the caller says, as when going back to the edges found. */
	export function setCorners(next: CornerPoints) {
		editor?.setCorners(next);
	}
</script>

<!-- scanic draws the photo 12px inside its container, so a corner on the
     photo's edge would sit 12px from the edge of a phone's screen: half its
     44px touch target cut off, and inside the strip where iOS and Android take
     a drag for the system back gesture. The padding moves the corners inboard;
     it is on a wrapper so that the clip is at the wrapper's edge, and a
     corner's touch target can spill into the padding rather than be cut by it. -->
<div bind:this={wrapper} class="relative h-full w-full overflow-hidden px-4 py-2.5">
	<div bind:this={container} class="relative h-full w-full"></div>
	<canvas
		bind:this={loupe}
		aria-hidden="true"
		data-crop-magnifier={side}
		data-active={active ? '' : undefined}
		class="pointer-events-none absolute top-2 size-36 rounded-full shadow-lg ring-2 ring-white transition-opacity duration-100 motion-reduce:transition-none {side ===
		'left'
			? 'left-2'
			: 'right-2'} {active ? 'opacity-100' : 'opacity-0'}"
	></canvas>
</div>
