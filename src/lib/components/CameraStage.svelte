<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import {
		containFit,
		cornerList,
		detectCorners,
		lerpCorners,
		scaleCorners,
		type CornerPoints
	} from '$lib/scanner/detect';

	// Live camera stage. Fills whatever box it is given (the immersive view hands
	// it the viewport); the video letterboxes inside on black so the frame never
	// changes size once the stream starts. Detects the document quad on a
	// downscaled copy of each frame and draws it over the video; the shutter
	// stays manual. The camera is deliberately NOT torn down after a capture —
	// that is the multi-page loop.
	let {
		onCapture,
		onDone,
		onError,
		pageCount = 0,
		latestPreview,
		replacing = false
	}: {
		/** Full-resolution frame plus the quad that was on screen (image-space px). */
		onCapture: (frame: HTMLCanvasElement, corners: CornerPoints | null) => void;
		onDone: () => void;
		onError: (message: string) => void;
		/** Pages captured so far, shown in the header. */
		pageCount?: number;
		/** Thumbnail of the most recent page, shown in the tray as capture feedback. */
		latestPreview?: string;
		/** Retake mode: one shot replaces an existing page, then the stage closes. */
		replacing?: boolean;
	} = $props();

	/** Longest edge of the frame we run detection on. Small enough to stay smooth on a phone. */
	const DETECT_MAX = 480;
	/** Minimum gap between detection runs, so a slow device drops detections, not frames. */
	const DETECT_INTERVAL_MS = 120;
	/** How long a quad stays on screen after a frame fails to find one (anti-flicker). */
	const QUAD_HOLD_MS = 500;
	/**
	 * Time constants for the overlay's motion. Detections arrive in discrete
	 * ~120ms steps; the drawn quad glides towards the latest one (position) and
	 * fades rather than blinks when detection is lost (opacity). Both are
	 * exponential so they are frame-rate independent.
	 */
	const POSITION_TAU_MS = 90;
	const OPACITY_TAU_MS = 160;

	let video = $state<HTMLVideoElement>();
	let overlay = $state<HTMLCanvasElement>();
	let ready = $state(false);

	let stream: MediaStream | null = null;
	let frame = 0;
	let inFlight = false;
	let lastRun = 0;
	let lastDraw = 0;
	let stopped = false;

	// Detection-space state: corners are in `detect` canvas pixels.
	let detect: HTMLCanvasElement | null = null;
	let detectW = 0;
	let detectH = 0;
	/** Most recent detection — what a capture crops to. */
	let liveCorners: CornerPoints | null = null;
	let liveAt = 0;
	/** What is actually drawn: `liveCorners` after smoothing. */
	let shownCorners: CornerPoints | null = null;
	let shownAlpha = 0;

	/** True while a quad is being drawn — the only cue the user gets that cropping will happen. */
	let locked = $state(false);
	/** Bumped per capture to replay the shutter flash. */
	let shutterCount = $state(0);

	async function start() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			await Promise.resolve();
			if (stopped || !video) return;
			video.srcObject = stream;
			await video.play();
		} catch {
			onError('Camera unavailable. Use “Add from photos” instead.');
			onDone();
		}
	}

	function stop() {
		stopped = true;
		cancelAnimationFrame(frame);
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	function onMeta() {
		if (!video?.videoWidth) return;
		const scale = DETECT_MAX / Math.max(video.videoWidth, video.videoHeight);
		detectW = Math.max(1, Math.round(video.videoWidth * Math.min(1, scale)));
		detectH = Math.max(1, Math.round(video.videoHeight * Math.min(1, scale)));
		detect = document.createElement('canvas');
		detect.width = detectW;
		detect.height = detectH;
		ready = true;
		frame = requestAnimationFrame(tick);
	}

	async function tick(now: number) {
		if (stopped) return;
		frame = requestAnimationFrame(tick);

		if (!inFlight && now - lastRun >= DETECT_INTERVAL_MS && detect && video?.videoWidth) {
			inFlight = true;
			lastRun = now;
			const ctx = detect.getContext('2d');
			if (ctx) {
				ctx.drawImage(video, 0, 0, detectW, detectH);
				const found = await detectCorners(detect);
				if (found) {
					liveCorners = found;
					liveAt = now;
				} else if (now - liveAt > QUAD_HOLD_MS) {
					liveCorners = null;
				}
			}
			inFlight = false;
		}

		draw(now);
	}

	/** Exponential approach factor for a step of `dt` ms with time constant `tau`. */
	function approach(dt: number, tau: number) {
		return 1 - Math.exp(-dt / tau);
	}

	/** Advance the smoothed quad one frame towards the live detection. */
	function settle(now: number) {
		const dt = Math.min(64, lastDraw ? now - lastDraw : 16);
		lastDraw = now;

		const fresh = liveCorners && now - liveAt <= QUAD_HOLD_MS ? liveCorners : null;
		locked = !!fresh;

		if (fresh) {
			shownCorners = shownCorners
				? lerpCorners(shownCorners, fresh, approach(dt, POSITION_TAU_MS))
				: fresh;
		}
		shownAlpha += ((fresh ? 1 : 0) - shownAlpha) * approach(dt, OPACITY_TAU_MS);
		if (!fresh && shownAlpha < 0.02) {
			shownAlpha = 0;
			shownCorners = null;
		}
	}

	function draw(now: number) {
		if (!overlay || !video) return;
		settle(now);

		// Measure the video, never the overlay's own parent: the overlay's backing
		// store is set from this measurement, so reading a box the overlay can
		// contribute to would be a feedback loop that grows the stage every frame.
		const box = video.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(box.width * dpr));
		const height = Math.max(1, Math.round(box.height * dpr));
		if (overlay.width !== width || overlay.height !== height) {
			overlay.width = width;
			overlay.height = height;
		}

		const ctx = overlay.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, box.width, box.height);

		if (!shownCorners || shownAlpha <= 0 || !detectW || !detectH || !video.videoWidth) return;

		// Map detection pixels → where object-contain actually paints the video.
		const fit = containFit(video.videoWidth, video.videoHeight, box.width, box.height);
		const k = (fit.scale * video.videoWidth) / detectW;
		const pts = cornerList(scaleCorners(shownCorners, k, k)).map((p) => ({
			x: p.x + fit.offsetX,
			y: p.y + fit.offsetY
		}));

		ctx.globalAlpha = shownAlpha;
		ctx.beginPath();
		ctx.moveTo(pts[0].x, pts[0].y);
		for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
		ctx.closePath();
		ctx.fillStyle = 'rgba(34, 197, 94, 0.12)';
		ctx.fill();
		ctx.lineWidth = 3;
		ctx.lineJoin = 'round';
		ctx.strokeStyle = '#22c55e';
		ctx.stroke();

		for (const p of pts) {
			ctx.beginPath();
			ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
			ctx.fillStyle = '#22c55e';
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	function capture() {
		if (!video?.videoWidth) return;

		const full = document.createElement('canvas');
		full.width = video.videoWidth;
		full.height = video.videoHeight;
		const ctx = full.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, 0, 0);

		// Crop to the latest detection, not the smoothed quad: the overlay is only
		// ever a few frames behind it, and the detection is the accurate one.
		const fresh = liveCorners && performance.now() - liveAt <= QUAD_HOLD_MS;
		const corners =
			fresh && liveCorners && detectW && detectH
				? scaleCorners(liveCorners, full.width / detectW, full.height / detectH)
				: null;

		shutterCount += 1;
		onCapture(full, corners);
		if (replacing) onDone();
	}

	$effect(() => {
		stopped = false;
		void start();
		return () => stop();
	});
</script>

<div class="flex h-full flex-col">
	<header class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
		<!-- Announced: for a non-sighted user the thumbnail is not feedback. -->
		<span aria-live="polite" class="text-white/80">
			{#if replacing}
				Retaking a page
			{:else if pageCount === 0}
				No pages yet
			{:else}
				{pageCount}
				{pageCount === 1 ? 'page' : 'pages'}
			{/if}
		</span>
		<!-- Fixed width so the label swapping doesn't nudge the layout. -->
		<span
			class="inline-flex w-40 items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs"
		>
			<span
				class="size-2 shrink-0 rounded-full transition-colors duration-300 {locked
					? 'bg-green-500'
					: 'animate-pulse bg-white/50'}"
			></span>
			{locked ? 'Edges found' : 'Looking for edges'}
		</span>
	</header>

	<div class="relative min-h-0 flex-1">
		<video
			bind:this={video}
			onloadedmetadata={onMeta}
			playsinline
			muted
			class="absolute inset-0 h-full w-full object-contain"
		></video>
		<canvas
			bind:this={overlay}
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 h-full w-full"
		></canvas>

		{#if !ready}
			<div class="absolute inset-0 flex items-center justify-center text-white/60">
				<CircleNotchIcon size={28} class="animate-spin" />
			</div>
		{/if}

		<!-- Shutter flash: a fresh element per capture so the animation replays. -->
		{#key shutterCount}
			{#if shutterCount > 0}
				<div
					aria-hidden="true"
					class="pointer-events-none absolute inset-0 animate-out bg-white duration-300 fill-mode-forwards fade-out"
				></div>
			{/if}
		{/key}
	</div>

	<footer class="grid grid-cols-3 items-center px-6 py-5">
		<div class="justify-self-start">
			{#if !replacing && latestPreview}
				{#key latestPreview}
					<div
						class="relative size-14 animate-in overflow-hidden rounded-md ring-2 ring-white/80 duration-300 zoom-in-75 fade-in"
					>
						<img src={latestPreview} alt="" class="h-full w-full object-cover" />
						<span
							class="absolute right-0.5 bottom-0.5 rounded-sm bg-black/70 px-1 text-[10px] font-medium tabular-nums"
						>
							{pageCount}
						</span>
					</div>
				{/key}
			{/if}
		</div>

		<button
			type="button"
			onclick={capture}
			disabled={!ready}
			aria-label={replacing ? 'Retake page' : 'Capture page'}
			class="group size-18 justify-self-center rounded-full border-4 border-white p-1 transition disabled:opacity-40"
		>
			<span class="block h-full w-full rounded-full bg-white transition group-active:scale-90"
			></span>
		</button>

		<button
			type="button"
			onclick={onDone}
			aria-label={replacing ? 'Cancel' : 'Done'}
			class="flex size-12 items-center justify-center justify-self-end rounded-full bg-white/10 transition hover:bg-white/20"
		>
			{#if replacing}
				<XIcon size={22} />
			{:else}
				<CheckIcon size={22} weight="bold" />
			{/if}
		</button>
	</footer>
</div>
