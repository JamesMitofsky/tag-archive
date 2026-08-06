<script lang="ts">
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import {
		containFit,
		cornerList,
		detectCorners,
		scaleCorners,
		type CornerPoints
	} from '$lib/scanner/detect';

	// Live camera stage. Detects the document quad on a downscaled copy of each
	// frame and draws it over the video; the shutter stays manual. The camera is
	// deliberately NOT torn down after a capture — that is the multi-page loop.
	let {
		onCapture,
		onDone,
		onError,
		pageCount = 0,
		replacing = false
	}: {
		/** Full-resolution frame plus the quad that was on screen (image-space px). */
		onCapture: (frame: HTMLCanvasElement, corners: CornerPoints | null) => void;
		onDone: () => void;
		onError: (message: string) => void;
		/** Pages captured so far, shown in the header. */
		pageCount?: number;
		/** Retake mode: one shot replaces an existing page, then the stage closes. */
		replacing?: boolean;
	} = $props();

	/** Longest edge of the frame we run detection on. Small enough to stay smooth on a phone. */
	const DETECT_MAX = 480;
	/** Minimum gap between detection runs, so a slow device drops detections, not frames. */
	const DETECT_INTERVAL_MS = 120;
	/** How long a quad stays on screen after a frame fails to find one (anti-flicker). */
	const QUAD_HOLD_MS = 500;

	let video = $state<HTMLVideoElement>();
	let overlay = $state<HTMLCanvasElement>();
	let aspect = $state('4 / 3');
	let ready = $state(false);

	let stream: MediaStream | null = null;
	let frame = 0;
	let inFlight = false;
	let lastRun = 0;
	let stopped = false;

	// Detection-space state: corners are in `detect` canvas pixels.
	let detect: HTMLCanvasElement | null = null;
	let detectW = 0;
	let detectH = 0;
	let liveCorners: CornerPoints | null = null;
	let liveAt = 0;

	/** True while a quad is being drawn — the only cue the user gets that cropping will happen. */
	let locked = $state(false);

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
		aspect = `${video.videoWidth} / ${video.videoHeight}`;
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

	function draw(now: number) {
		if (!overlay || !video) return;

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

		const fresh = liveCorners && now - liveAt <= QUAD_HOLD_MS;
		locked = !!fresh;
		if (!fresh || !liveCorners || !detectW || !detectH || !video.videoWidth) return;

		// Map detection pixels → where object-contain actually paints the video.
		// The wrapper's aspect-ratio normally makes the offsets zero, but computing
		// them keeps the quad aligned if an ancestor clamps the stage's height.
		const fit = containFit(video.videoWidth, video.videoHeight, box.width, box.height);
		const k = (fit.scale * video.videoWidth) / detectW;
		const pts = cornerList(scaleCorners(liveCorners, k, k)).map((p) => ({
			x: p.x + fit.offsetX,
			y: p.y + fit.offsetY
		}));

		ctx.beginPath();
		ctx.moveTo(pts[0].x, pts[0].y);
		for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
		ctx.closePath();
		ctx.lineWidth = 3;
		ctx.strokeStyle = '#22c55e';
		ctx.stroke();

		for (const p of pts) {
			ctx.beginPath();
			ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
			ctx.fillStyle = '#22c55e';
			ctx.fill();
		}
	}

	function capture() {
		if (!video?.videoWidth) return;

		const full = document.createElement('canvas');
		full.width = video.videoWidth;
		full.height = video.videoHeight;
		const ctx = full.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, 0, 0);

		// Reuse the quad that was on screen rather than re-detecting at full
		// resolution, so the crop is exactly what the user was looking at.
		const fresh = liveCorners && performance.now() - liveAt <= QUAD_HOLD_MS;
		const corners =
			fresh && liveCorners && detectW && detectH
				? scaleCorners(liveCorners, full.width / detectW, full.height / detectH)
				: null;

		onCapture(full, corners);
		if (replacing) onDone();
	}

	$effect(() => {
		stopped = false;
		void start();
		return () => stop();
	});
</script>

<div class="mt-3 space-y-2">
	<div class="flex items-center justify-between text-xs text-gray-600">
		<!-- Announced: for a non-sighted user the thumbnail is not feedback. -->
		<span aria-live="polite">
			{#if replacing}
				Retaking a page
			{:else if pageCount === 0}
				No pages captured yet
			{:else}
				{pageCount}
				{pageCount === 1 ? 'page' : 'pages'} captured
			{/if}
		</span>
		<span>{locked ? 'Edges detected' : 'Looking for edges…'}</span>
	</div>

	<div class="relative overflow-hidden rounded-md bg-black" style="aspect-ratio: {aspect}">
		<video
			bind:this={video}
			onloadedmetadata={onMeta}
			playsinline
			class="block h-full w-full object-contain"
		></video>
		<canvas
			bind:this={overlay}
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 h-full w-full"
		></canvas>
	</div>

	<div class="flex flex-wrap gap-2">
		<button
			type="button"
			onclick={capture}
			disabled={!ready}
			class="inline-flex items-center gap-1.5 rounded-sm bg-[#14120f] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#33302a] disabled:opacity-50"
		>
			<CameraIcon size={16} />
			{replacing ? 'Retake page' : 'Capture page'}
		</button>
		<button
			type="button"
			onclick={onDone}
			class="inline-flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
		>
			{#if replacing}
				Cancel
			{:else}
				<CheckIcon size={16} /> Done
			{/if}
		</button>
	</div>
</div>
