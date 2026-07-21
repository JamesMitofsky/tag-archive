<script lang="ts">
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import ImageSquareIcon from 'phosphor-svelte/lib/ImageSquareIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';

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

	type Attached = {
		id: string;
		url?: string;
		fileName: string;
		previewUrl: string;
		status: 'uploading' | 'done' | 'error';
		error?: string;
	};

	// Multiple scans per artefact; kept in the order they were added. Seeded from any
	// `initial` URLs (edit flow), where the public URL doubles as its own preview.
	// svelte-ignore state_referenced_locally
	let attached = $state<Attached[]>(
		initial.map((url) => ({
			id: url,
			url,
			fileName: url.split('/').pop() ?? 'scan',
			previewUrl: url,
			status: 'done'
		}))
	);

	const emit = () =>
		onChange?.(attached.filter((a) => a.status === 'done' && a.url).map((a) => a.url!));

	let error = $state('');

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

	function updateItem(id: string, patch: Partial<Attached>) {
		attached = attached.map((a) => (a.id === id ? { ...a, ...patch } : a));
	}

	async function removeById(id: string) {
		const target = attached.find((a) => a.id === id);
		attached = attached.filter((a) => a.id !== id);
		emit();

		if (target?.url && !initial.includes(target.url)) {
			try {
				await fetch('/keeper/scans', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ url: target.url })
				});
			} catch {
				// Best-effort cleanup
			}
		}
	}

	/** Draw the current video frame to a canvas and upload it as a WebP image. */
	function capture() {
		if (!video?.videoWidth) return;
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, 0, 0);

		const itemId = crypto.randomUUID();
		const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
		const fileName = `scan-${stamp}.webp`;
		const previewUrl = canvas.toDataURL('image/webp', 0.85);

		stopCamera();

		attached = [
			...attached,
			{
				id: itemId,
				fileName,
				previewUrl,
				status: 'uploading'
			}
		];

		canvas.toBlob(
			(blob) => {
				if (!blob) {
					updateItem(itemId, { status: 'error', error: 'Failed to capture frame' });
					return;
				}
				void processUpload(itemId, blob, fileName, previewUrl);
			},
			'image/webp',
			0.85
		);
	}

	/** Convert an uploaded File to a WebP Blob (scaling down if larger than 2560px). */
	async function convertToWebP(
		file: File,
		maxDim = 2560,
		quality = 0.85
	): Promise<{ blob: Blob; fileName: string; previewUrl: string }> {
		const webpFileName = file.name.replace(/\.[^/.]+$/, '') + '.webp';

		try {
			const bitmap = await createImageBitmap(file);
			let { width, height } = bitmap;

			if (width > maxDim || height > maxDim) {
				if (width > height) {
					height = Math.round((height * maxDim) / width);
					width = maxDim;
				} else {
					width = Math.round((width * maxDim) / height);
					height = maxDim;
				}
			}

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.drawImage(bitmap, 0, 0, width, height);
				const webpBlob = await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, 'image/webp', quality)
				);
				if (webpBlob) {
					return {
						blob: webpBlob,
						fileName: webpFileName,
						previewUrl: canvas.toDataURL('image/webp', quality)
					};
				}
			}
		} catch {
			// Fall back to original file if bitmap conversion fails
		}

		return {
			blob: file,
			fileName: file.name,
			previewUrl: URL.createObjectURL(file)
		};
	}

	/** Optimistically render picked photo(s) and upload converted WebP. */
	async function onFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (files.length === 0) return;

		for (const file of files) {
			const itemId = crypto.randomUUID();
			const immediatePreview = URL.createObjectURL(file);

			// Optimistic rendering right away
			attached = [
				...attached,
				{
					id: itemId,
					fileName: file.name,
					previewUrl: immediatePreview,
					status: 'uploading'
				}
			];

			void (async () => {
				try {
					const { blob, fileName, previewUrl } = await convertToWebP(file);
					updateItem(itemId, { previewUrl });
					await processUpload(itemId, blob, fileName, previewUrl);
				} catch (e) {
					updateItem(itemId, {
						status: 'error',
						error: e instanceof Error ? e.message : 'Image processing failed'
					});
				}
			})();
		}
	}

	/** Push one image to R2 and hand its URL back to the form. */
	async function processUpload(itemId: string, file: Blob, fileName: string, previewUrl: string) {
		try {
			const body = new FormData();
			body.append('file', file, fileName);
			const res = await fetch('/keeper/scans', { method: 'POST', body });
			if (!res.ok) throw new Error(await res.text());

			const result = (await res.json()) as { url: string; fileName: string };
			updateItem(itemId, {
				url: result.url,
				fileName: result.fileName,
				previewUrl,
				status: 'done',
				error: undefined
			});
			emit();
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : 'Upload failed';
			updateItem(itemId, { status: 'error', error: errMsg });
		}
	}

	// Block submit while any upload is in flight.
	$effect(() => {
		pending = attached.some((a) => a.status === 'uploading');
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
				<input type="file" accept="image/*" multiple onchange={onFiles} class="sr-only" />
			</label>
		</div>
	{/if}

	{#if error}
		<p class="mt-2 text-xs text-red-600" role="alert">{error}</p>
	{/if}

	{#if attached.some((a) => a.status === 'error')}
		<div
			class="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"
			role="alert"
		>
			<p class="font-medium">One or more image uploads failed:</p>
			<ul class="mt-1 list-inside list-disc space-y-0.5">
				{#each attached.filter((a) => a.status === 'error') as errItem (errItem.id)}
					<li>{errItem.fileName}: {errItem.error || 'Upload error'}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Image slot: attached scans and optimistic previews -->
	{#if attached.length > 0}
		<div class="mt-4 flex flex-wrap gap-3">
			{#each attached as scan (scan.id)}
				<div
					class="relative inline-block overflow-hidden rounded-md border bg-white {scan.status ===
					'error'
						? 'border-red-400 ring-1 ring-red-400'
						: 'border-gray-200'}"
				>
					<img
						src={scan.previewUrl}
						alt="Attached scan"
						class="max-h-40 w-auto object-contain {scan.status === 'uploading' ? 'opacity-50' : ''}"
					/>

					{#if scan.status === 'uploading'}
						<div
							class="absolute inset-0 flex flex-col items-center justify-center bg-black/30 text-white"
						>
							<CircleNotchIcon size={24} class="animate-spin" />
							<span class="mt-1 text-[10px] font-medium">Uploading...</span>
						</div>
					{/if}

					{#if scan.status === 'error'}
						<div
							class="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-red-600/90 px-1.5 py-1 text-[10px] font-medium text-white"
							title={scan.error}
						>
							<WarningIcon size={12} class="shrink-0" />
							<span class="truncate">{scan.error || 'Failed'}</span>
						</div>
					{/if}

					<button
						type="button"
						onclick={() => removeById(scan.id)}
						aria-label="Remove image"
						class="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-red-600"
					>
						<TrashIcon size={14} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
