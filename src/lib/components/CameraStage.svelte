<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { MAX_DIM, fitWithin } from '$lib/scanner/image';

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
		latestPreview,
		replacingPage
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
		/** Retake mode: the 1-based page the next shot replaces. */
		replacingPage?: number;
	} = $props();

	let video = $state<HTMLVideoElement>();
	let ready = $state(false);
	/** Bumped per capture to replay the shutter flash. */
	let shutterCount = $state(0);

	let stream: MediaStream | null = null;
	let stopped = false;

	const replacing = $derived(replacingPage !== undefined);
	/** With nothing shot, leaving is quitting; after that it is finishing. */
	const finishing = $derived(shotCount > 0);
	const photos = $derived(`${shotCount} ${shotCount === 1 ? 'photo' : 'photos'}`);
	const exitLabel = $derived(
		finishing ? `Done, crop ${photos}` : replacing ? 'Cancel retake' : 'Close camera'
	);

	async function start() {
		try {
			const acquired = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			// Closed while the permission prompt was up: `stop()` has already run
			// and never saw this stream, so release it here or the camera stays on.
			if (stopped) {
				acquired.getTracks().forEach((track) => track.stop());
				return;
			}
			stream = acquired;
			await Promise.resolve();
			if (stopped || !video) return;
			video.srcObject = stream;
			await video.play();
		} catch {
			// Unmounting mid-start aborts `play()`; that is not a camera failure.
			if (stopped) return;
			onError('Camera unavailable. Use “Add from photos” instead.');
			onDone();
		}
	}

	function stop() {
		stopped = true;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	function onMeta() {
		if (video?.videoWidth) ready = true;
	}

	function capture() {
		if (!video?.videoWidth) return;

		// Drawn straight at the size everything downstream works at: a run of
		// shots waiting their turn then holds no more pixels than it will use.
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

<div class="flex h-full flex-col">
	<header class="px-4 py-3 text-sm">
		<!-- Announced: for a non-sighted user the thumbnail is not feedback. -->
		<span aria-live="polite" class="text-white/80">
			<!-- Photos, not pages: they aren't pages until they're cropped and kept,
			     and the form's own pages are numbered separately. -->
			{#if replacing}
				Retaking page {replacingPage}
			{:else if shotCount === 0}
				No photos yet
			{:else}
				{photos}
			{/if}
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
			aria-label={replacing ? 'Retake page' : 'Capture page'}
			class="group size-18 justify-self-center rounded-full border-4 border-white p-1 transition aria-disabled:opacity-40"
		>
			<span class="block h-full w-full rounded-full bg-white transition group-active:scale-90"
			></span>
		</button>

		<!-- One button whose meaning follows the shot count, so focus stays put
		     when it turns from "quit" into "done". -->
		<button
			type="button"
			onclick={onDone}
			aria-label={exitLabel}
			title={exitLabel}
			class="flex size-12 items-center justify-center justify-self-end rounded-full transition {finishing
				? 'bg-white text-black hover:bg-white/90'
				: 'bg-white/10 hover:bg-white/20'}"
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
		</button>
	</footer>
</div>
