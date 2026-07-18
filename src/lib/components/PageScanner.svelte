<script lang="ts">
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import ImageSquareIcon from 'phosphor-svelte/lib/ImageSquareIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';

	// Emits the uploaded image's public URL + file name so the parent form can store them.
	// `pending` (bindable) is true while an upload is in flight, so the parent can block
	// submit until the image is finalized.
	let {
		onUploaded,
		pending = $bindable(false)
	}: {
		onUploaded?: (r: { url: string; fileName: string }) => void;
		pending?: boolean;
	} = $props();

	type Attached = { url: string; fileName: string; previewUrl: string };

	let attached = $state<Attached | null>(null);
	// Local preview shown in the image slot while the upload is in flight.
	let pendingPreview = $state<string | null>(null);
	let status = $state<'idle' | 'uploading' | 'error'>('idle');
	let error = $state('');
	let uploadError = $state('');

	let cameraOn = $state(false);
	let video = $state<HTMLVideoElement>();
	let stream: MediaStream | null = null;

	// Live camera is the primary path; the file input (with `capture`) is the fallback
	// for browsers or permission states where getUserMedia isn't available.
	const canUseCamera =
		typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

	async function startCamera() {
		error = '';
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			cameraOn = true;
			// Wait for the element to render before wiring the stream in.
			await Promise.resolve();
			if (video) {
				video.srcObject = stream;
				await video.play();
			}
		} catch {
			error = 'Camera unavailable. Use “Add from photos” instead.';
			stopCamera();
		}
	}

	function stopCamera() {
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		cameraOn = false;
	}

	/** Draw the current video frame to a canvas and upload it as a JPEG. */
	function capture() {
		if (!video?.videoWidth) return;
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, 0, 0);
		canvas.toBlob(
			(blob) => {
				if (!blob) return;
				const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
				stopCamera();
				upload(blob, `scan-${stamp}.jpg`, canvas.toDataURL('image/jpeg', 0.85));
			},
			'image/jpeg',
			0.85
		);
	}

	/** Upload a picked image file directly. */
	function onFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		upload(file, file.name, URL.createObjectURL(file));
	}

	/** Push one image to R2 and hand its URL back to the form. */
	async function upload(file: Blob, fileName: string, previewUrl: string) {
		status = 'uploading';
		uploadError = '';
		pendingPreview = previewUrl;
		try {
			const body = new FormData();
			body.append('file', file, fileName);
			const res = await fetch('/scans', { method: 'POST', body });
			if (!res.ok) throw new Error(await res.text());

			const result = (await res.json()) as { url: string; fileName: string };
			attached = { url: result.url, fileName: result.fileName, previewUrl };
			status = 'idle';
			onUploaded?.(result);
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Upload failed';
			status = 'error';
		} finally {
			pendingPreview = null;
		}
	}

	function remove() {
		attached = null;
		status = 'idle';
		uploadError = '';
		onUploaded?.({ url: '', fileName: '' });
	}

	// Block submit while an upload is in flight.
	$effect(() => {
		pending = status === 'uploading';
	});

	$effect(() => {
		// Tear the camera down when the component leaves the page.
		return () => stopCamera();
	});
</script>

<div class="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-4">
	<!-- Camera stage -->
	{#if cameraOn}
		<div class="mt-3 overflow-hidden rounded-md bg-black">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} playsinline class="block max-h-80 w-full object-contain"></video>
		</div>
		<div class="mt-2 flex flex-wrap gap-2">
			<button
				type="button"
				onclick={capture}
				class="inline-flex items-center gap-1.5 rounded-sm bg-[#14120f] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#33302a]"
			>
				<CameraIcon size={16} /> Capture
			</button>
			<button
				type="button"
				onclick={stopCamera}
				class="rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
			>
				Stop camera
			</button>
		</div>
	{:else}
		<div class="flex flex-wrap gap-2">
			{#if canUseCamera}
				<button
					type="button"
					onclick={startCamera}
					class="inline-flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
				>
					<CameraIcon size={16} /> Open camera
				</button>
			{/if}
			<label
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
			>
				<ImageSquareIcon size={16} /> Add from photos
				<input
					type="file"
					accept="image/*"
					capture="environment"
					onchange={onFiles}
					class="sr-only"
				/>
			</label>
		</div>
	{/if}

	{#if error}
		<p class="mt-2 text-xs text-red-600" role="alert">{error}</p>
	{/if}

	{#if status === 'error'}
		<p class="mt-3 text-xs text-red-600" role="alert">{uploadError}</p>
	{/if}

	<!-- Image slot: spinner while uploading, then the attached scan -->
	{#if status === 'uploading'}
		<div class="mt-4">
			<div
				class="relative flex h-40 min-w-40 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50"
			>
				{#if pendingPreview}
					<img
						src={pendingPreview}
						alt=""
						class="h-full w-auto object-contain opacity-30"
					/>
				{/if}
				<CircleNotchIcon
					size={28}
					class="absolute animate-spin text-gray-500"
				/>
			</div>
		</div>
	{:else if attached}
		<div class="mt-4">
			<div class="relative inline-block overflow-hidden rounded-md border border-gray-200 bg-white">
				<img src={attached.previewUrl} alt="Attached scan" class="max-h-40 w-auto object-contain" />
				<button
					type="button"
					onclick={remove}
					aria-label="Remove image"
					class="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-red-600"
				>
					<TrashIcon size={14} />
				</button>
			</div>
		</div>
	{/if}
</div>
