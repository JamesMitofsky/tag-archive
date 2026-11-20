<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import FlashlightIcon from 'phosphor-svelte/lib/FlashlightIcon';
	import { dev } from '$app/env';
	import { MAX_DIM, fitWithin } from '#lib/scanner/image.ts';

	// Live camera stage. Fills whatever box it is given (the immersive view hands
	// it the viewport); the video letterboxes inside on black so the frame never
	// changes size once the stream starts. It only takes pictures: finding the
	// page and cropping to it happen afterwards, on the still photos, so nothing
	// on screen moves with the user's hands while they shoot. The camera is
	// deliberately NOT torn down after a capture — that is the multi-page loop.
	let {
		onCapture,
		onDone,
		onError,
		shotCount = 0,
		latestPreview
	}: {
		/** The frame as shot, capped at MAX_DIM on its longest edge. */
		onCapture: (frame: HTMLCanvasElement) => void;
		/** The exit button: closes the camera, or moves on once something was shot. */
		onDone: () => void;
		onError: (message: string) => void;
		/** Photos taken since the camera opened. */
		shotCount?: number;
		/** Thumbnail of the most recent photo, shown in the tray as capture feedback. */
		latestPreview?: string;
	} = $props();

	/**
	 * Every value is `ideal`, so a camera that can't match one opens at its
	 * nearest mode rather than failing. Asked for nothing, browsers open at
	 * 640×480, a third of a megapixel: too soft to read a page. 2560×1920 is
	 * MAX_DIM at a phone sensor's own 4:3. WebKit and Chromium both match it
	 * against the sensor's landscape modes and rotate the frames afterwards, so
	 * a phone held upright gets 1920×2560, not a landscape crop of the view.
	 * 30 fps keeps the preview smooth where a sensor's largest modes run slower.
	 */
	const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
		facingMode: { ideal: 'environment' },
		width: { ideal: MAX_DIM },
		height: { ideal: (MAX_DIM * 3) / 4 },
		frameRate: { ideal: 30 }
	};

	let video = $state<HTMLVideoElement>();
	let ready = $state(false);
	/** Dev builds only: what the camera actually delivered, to check on real phones. */
	let delivered = $state('');
	/** Bumped per capture to replay the shutter flash. */
	let shutterCount = $state(0);

	let stream: MediaStream | null = null;
	let stopped = false;

	/**
	 * Why the camera would not open, in terms of what to do about it. A refused
	 * permission is the common one on a phone and the only one the user can fix,
	 * but only if told where: the browser does not ask a second time.
	 */
	function failureMessage(error: unknown): string {
		const name = error instanceof DOMException ? error.name : '';
		if (name === 'NotAllowedError' || name === 'SecurityError') {
			return 'Camera access is blocked. Allow the camera for this site in your browser settings, or use “Add from photos”.';
		}
		if (name === 'NotFoundError' || name === 'OverconstrainedError') {
			return 'No camera found on this device. Use “Add from photos” instead.';
		}
		if (name === 'NotReadableError' || name === 'AbortError') {
			return 'The camera is in use by another app. Close that app and try again, or use “Add from photos”.';
		}
		return 'Camera unavailable. Use “Add from photos” instead.';
	}

	// --- Light ---------------------------------------------------------------
	// Archive items get scanned indoors, on a table, under the phone's own
	// shadow. Where the camera reports a torch (Chrome on Android does), offer
	// it; elsewhere the button is simply not there.

	let torchAvailable = $state(false);
	let torchOn = $state(false);

	function readTorch() {
		const track = stream?.getVideoTracks()[0];
		// `torch` is in the Image Capture spec, not yet in TypeScript's DOM types.
		const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined;
		torchAvailable = !!capabilities?.torch;
		// A fresh stream starts dark, whatever the last one was left at.
		torchOn = false;
	}

	async function toggleTorch() {
		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		const next = !torchOn;
		try {
			await track.applyConstraints({
				advanced: [{ torch: next } as MediaTrackConstraintSet]
			});
			torchOn = next;
		} catch {
			// Reported but refused (some front cameras): stop offering it.
			torchAvailable = false;
		}
	}

	/** With nothing shot, leaving is quitting; after that it is finishing. */
	const finishing = $derived(shotCount > 0);
	const photos = $derived(`${shotCount} ${shotCount === 1 ? 'photo' : 'photos'}`);
	const exitLabel = $derived(finishing ? `Done, crop ${photos}` : 'Close camera');

	async function start() {
		try {
			const acquired = await navigator.mediaDevices.getUserMedia({
				video: VIDEO_CONSTRAINTS,
				audio: false
			});
			// Closed while the permission prompt was up: `stop()` has already run
			// and never saw this stream, so release it here or the camera stays on.
			if (stopped) {
				acquired.getTracks().forEach((track) => track.stop());
				return;
			}
			stream = acquired;
			readTorch();
			await Promise.resolve();
			if (stopped || !video) return;
			video.srcObject = stream;
			await video.play();
		} catch (error) {
			// Unmounting mid-start aborts `play()`; that is not a camera failure.
			if (stopped) return;
			onError(failureMessage(error));
			onDone();
		}
	}

	/**
	 * Back from another app, or from a locked screen. A phone takes the camera
	 * away from a page it has put in the background, and does not always hand it
	 * back: the track is ended, or the video is left paused on its last frame,
	 * and the shutter would go on photographing that frame. Checked on return
	 * rather than on the track's own `ended`, which also fires for a camera
	 * another app is still holding.
	 */
	function onVisible() {
		if (document.visibilityState !== 'visible' || stopped) return;
		const track = stream?.getVideoTracks()[0];
		if (!track || track.readyState === 'ended') {
			stream?.getTracks().forEach((each) => each.stop());
			stream = null;
			ready = false;
			void start();
		} else if (video?.paused) {
			void video.play().catch(() => {});
		}
	}

	function stop() {
		stopped = true;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	function onMeta() {
		if (video?.videoWidth) ready = true;
		reportDelivered();
	}

	/** Rerun on `resize` too: turning the phone swaps the frame's width and height. */
	function reportDelivered() {
		if (!dev) return;
		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		const settings = track.getSettings();
		delivered = `${settings.width}×${settings.height} @ ${Math.round(settings.frameRate ?? 0)} fps`;
		console.info('[camera] settings', settings, 'capabilities', track.getCapabilities?.());
	}

	function capture() {
		if (!video?.videoWidth) return;

		// Drawn straight at the size everything downstream works at, so the one
		// canvas a shot ever holds is no bigger than it needs to be.
		const { width, height } = fitWithin(video.videoWidth, video.videoHeight, MAX_DIM);
		const frame = document.createElement('canvas');
		frame.width = width;
		frame.height = height;
		const ctx = frame.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, 0, 0, width, height);

		shutterCount += 1;
		onCapture(frame);
	}

	$effect(() => {
		stopped = false;
		void start();
		return () => stop();
	});
</script>

<svelte:document onvisibilitychange={onVisible} />

<div class="flex h-full flex-col">
	<header class="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5 text-sm">
		<!-- Announced: for a non-sighted user the thumbnail is not feedback. -->
		<span aria-live="polite" class="text-white/80">
			<!-- Photos, not pages: they aren't pages until they're cropped and kept,
			     and the form's own pages are numbered separately. -->
			{#if shotCount === 0}
				No photos yet
			{:else}
				{photos}
			{/if}
		</span>
		{#if dev && delivered}
			<span class="text-xs text-white/50 tabular-nums">{delivered}</span>
		{/if}
		{#if torchAvailable}
			<button
				type="button"
				onclick={toggleTorch}
				aria-pressed={torchOn}
				class="flex h-11 items-center gap-1.5 rounded-full px-3 transition {torchOn
					? 'bg-white text-black'
					: 'bg-white/10 hover:bg-white/20'}"
			>
				<FlashlightIcon size={18} weight={torchOn ? 'fill' : 'regular'} />
				Light
			</button>
		{/if}
	</header>

	<div class="relative min-h-0 flex-1">
		<video
			bind:this={video}
			onloadedmetadata={onMeta}
			onresize={reportDelivered}
			playsinline
			muted
			class="absolute inset-0 h-full w-full object-contain"
		></video>

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
					class="pointer-events-none absolute inset-0 animate-out bg-white duration-300 fill-mode-forwards fade-out motion-reduce:hidden"
				></div>
			{/if}
		{/key}
	</div>

	<footer class="grid grid-cols-3 items-center px-6 py-5">
		<div class="justify-self-start">
			{#if latestPreview}
				{#key latestPreview}
					<div
						class="relative size-14 animate-in overflow-hidden rounded-md ring-2 ring-white/80 duration-300 zoom-in-75 fade-in"
					>
						<img src={latestPreview} alt="" class="h-full w-full object-cover" />
						<span
							class="absolute right-0.5 bottom-0.5 rounded-sm bg-black/70 px-1 text-[10px] font-medium tabular-nums"
						>
							{shotCount}
						</span>
					</div>
				{/key}
			{/if}
		</div>

		<!-- aria-disabled, not disabled, while the video starts: a disabled
		     shutter can't take focus, and focus would land on the exit button,
		     where Space finishes the run instead of taking a photo. -->
		<button
			type="button"
			onclick={capture}
			aria-disabled={!ready}
			aria-label="Capture page"
			class="group size-18 justify-self-center rounded-full border-4 border-white p-1 transition aria-disabled:opacity-40"
		>
			<span class="block h-full w-full rounded-full bg-white transition group-active:scale-90"
			></span>
		</button>

		<!-- One button whose meaning follows the shot count, so focus stays put
		     when it turns from "quit" into "done". It says which in words: the
		     icon alone changes from an X to a check without the screen moving, and
		     a touch screen shows no tooltip to explain it. -->
		<button
			type="button"
			onclick={onDone}
			aria-label={exitLabel}
			class="group flex flex-col items-center gap-1 justify-self-end text-[11px] leading-none"
		>
			<span
				class="flex size-12 items-center justify-center rounded-full transition {finishing
					? 'bg-white text-black group-hover:bg-white/90'
					: 'bg-white/10 group-hover:bg-white/20'}"
			>
				{#key finishing}
					<span class="animate-in duration-200 zoom-in-50 fade-in">
						{#if finishing}
							<CheckIcon size={22} weight="bold" />
						{:else}
							<XIcon size={22} />
						{/if}
					</span>
				{/key}
			</span>
			<span aria-hidden="true" class={finishing ? 'font-medium text-white' : 'text-white/80'}>
				{finishing ? `Crop ${shotCount}` : 'Close'}
			</span>
		</button>
	</footer>
</div>
