<script lang="ts">
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import ImageSquareIcon from 'phosphor-svelte/lib/ImageSquareIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';

	// Emits the current list of uploaded image URLs (display order) so the parent form
	// can store them. `pending` (bindable) is true while an upload is in flight, so the
	// parent can block submit until every image is finalized.
	let {
		onChange,
		pending = $bindable(false),
		initial = []
	}: {
		onChange?: (urls: string[]) => void;
		pending?: boolean;
		/** Pre-existing scan URLs to seed the list with (edit flow). */
		initial?: string[];
	} = $props();

	type Attached = { url: string; fileName: string; previewUrl: string };

	// Multiple scans per artefact; kept in the order they were added. Seeded from any
	// `initial` URLs (edit flow), where the public URL doubles as its own preview.
	// svelte-ignore state_referenced_locally
	let attached = $state<Attached[]>(
		initial.map((url) => ({ url, fileName: url.split('/').pop() ?? 'scan', previewUrl: url }))
	);
	const emit = () => onChange?.(attached.map((a) => a.url));
	// Local previews shown in the image slot while uploads are in flight.
	let pendingPreviews = $state<string[]>([]);
	let status = $state<'idle' | 'uploading' | 'error'>('idle');
	let error = $state('');
	let uploadError = $state('');

	let cameraOn = $state(false);
	let video = $state<HTMLVideoElement>();
	let stream: MediaStream | null = null;

	// Live camera is the primary path; the file input is the fallback
	// for browsers or permission states where getUserMedia isn't available.
	const canUseCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

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
				uploadSingle(blob, `scan-${stamp}.jpg`, canvas.toDataURL('image/jpeg', 0.85));
			},
			'image/jpeg',
			0.85
		);
	}

	/** Upload picked image file(s) directly. */
	function onFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (files.length === 0) return;
		uploadBatch(files);
	}

	/** Push image file(s) to R2 and hand their URLs back to the form in selection order. */
	async function uploadBatch(files: File[]) {
		status = 'uploading';
		uploadError = '';

		const items = files.map((file) => ({
			file,
			fileName: file.name,
			previewUrl: URL.createObjectURL(file)
		}));

		const batchPreviews = items.map((i) => i.previewUrl);
		pendingPreviews = [...pendingPreviews, ...batchPreviews];

		const results = await Promise.all(
			items.map(async (item) => {
				try {
					const body = new FormData();
					body.append('file', item.file, item.fileName);
					const res = await fetch('/keeper/scans', { method: 'POST', body });
					if (!res.ok) throw new Error(await res.text());

					const result = (await res.json()) as { url: string; fileName: string };
					return { ...result, previewUrl: item.previewUrl, success: true as const };
				} catch (e) {
					return {
						error: e instanceof Error ? e.message : 'Upload failed',
						previewUrl: item.previewUrl,
						success: false as const
					};
				}
			})
		);

		pendingPreviews = pendingPreviews.filter((p) => !batchPreviews.includes(p));

		const successful = results.filter((r): r is Extract<typeof r, { success: true }> => r.success);
		const failed = results.filter((r) => !r.success);

		if (successful.length > 0) {
			attached = [
				...attached,
				...successful.map((s) => ({ url: s.url, fileName: s.fileName, previewUrl: s.previewUrl }))
			];
			emit();
		}

		if (failed.length > 0) {
			uploadError = failed[0].error || 'One or more uploads failed';
			status = attached.length === 0 && pendingPreviews.length === 0 ? 'error' : 'idle';
		} else {
			status = 'idle';
		}
	}

	async function uploadSingle(file: Blob, fileName: string, previewUrl: string) {
		status = 'uploading';
		uploadError = '';
		pendingPreviews = [...pendingPreviews, previewUrl];
		try {
			const body = new FormData();
			body.append('file', file, fileName);
			const res = await fetch('/keeper/scans', { method: 'POST', body });
			if (!res.ok) throw new Error(await res.text());

			const result = (await res.json()) as { url: string; fileName: string };
			attached = [...attached, { url: result.url, fileName: result.fileName, previewUrl }];
			status = 'idle';
			emit();
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Upload failed';
			status = 'error';
		} finally {
			pendingPreviews = pendingPreviews.filter((p) => p !== previewUrl);
		}
	}

	function remove(index: number) {
		attached = attached.filter((_, i) => i !== index);
		if (attached.length === 0 && pendingPreviews.length === 0) {
			status = 'idle';
			uploadError = '';
		}
		emit();
	}

	// Block submit while an upload is in flight.
	$effect(() => {
		pending = pendingPreviews.length > 0 || status === 'uploading';
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
					multiple
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

	<!-- Image slot: every attached scan, plus a spinner tile for each image currently uploading -->
	{#if attached.length > 0 || pendingPreviews.length > 0}
		<div class="mt-4 flex flex-wrap gap-3">
			{#each attached as scan, i (scan.url)}
				<div
					class="relative inline-block overflow-hidden rounded-md border border-gray-200 bg-white"
				>
					<img src={scan.previewUrl} alt="Attached scan" class="max-h-40 w-auto object-contain" />
					<button
						type="button"
						onclick={() => remove(i)}
						aria-label="Remove image"
						class="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-red-600"
					>
						<TrashIcon size={14} />
					</button>
				</div>
			{/each}
			{#each pendingPreviews as previewUrl (previewUrl)}
				<div
					class="relative flex h-40 min-w-40 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50"
				>
					<img src={previewUrl} alt="" class="h-full w-auto object-contain opacity-30" />
					<CircleNotchIcon size={28} class="absolute animate-spin text-gray-500" />
				</div>
			{/each}
		</div>
	{/if}
</div>
