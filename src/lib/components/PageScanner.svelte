<script lang="ts">
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import ImageSquareIcon from 'phosphor-svelte/lib/ImageSquareIcon';
	import CameraStage from './CameraStage.svelte';
	import ScanFilmstrip from './ScanFilmstrip.svelte';
	import CornerAdjuster from './CornerAdjuster.svelte';
	import { detectCorners, dewarp, scaleCorners, type CornerPoints } from '$lib/scanner/detect';
	import { MAX_DIM, canvasToWebP, downscale, fileToCanvas } from '$lib/scanner/image';
	import type { ScanPage } from '$lib/scanner/types';

	// Emits the current list of uploaded image URLs (display order) so the parent form
	// can store them. `pending` (bindable) is true while an upload is in flight, so the
	// parent can block submit until every image is finalized.
	let {
		onChange,
		// eslint-disable-next-line no-useless-assignment -- prop default, not a dead store
		pending = $bindable(false),
		initial = []
	}: {
		onChange?: (urls: string[]) => void;
		pending?: boolean;
		/** Pre-existing scan URLs to seed the list with (edit flow). */
		initial?: string[];
	} = $props();

	// Multiple pages per artefact; array position is the page order. Seeded from any
	// `initial` URLs (edit flow), where the public URL doubles as its own preview.
	// svelte-ignore state_referenced_locally
	let pages = $state<ScanPage[]>(
		initial.map((url) => ({
			id: url,
			url,
			fileName: url.split('/').pop() ?? 'scan',
			previewUrl: url,
			status: 'done'
		}))
	);

	const emit = () =>
		onChange?.(pages.filter((p) => p.status === 'done' && p.url).map((p) => p.url!));

	let error = $state('');
	let cameraOn = $state(false);
	/** Set while the camera is open to replace one page rather than append. */
	let replacingId = $state<string | null>(null);
	/** Open crop editor, if any. */
	let adjusting = $state<{ id: string; image: HTMLCanvasElement; corners?: CornerPoints } | null>(
		null
	);

	// Live camera is the primary path; the file input is the fallback
	// for browsers or permission states where getUserMedia isn't available.
	const canUseCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

	/** Object URLs minted for optimistic previews, revoked once superseded. */
	const objectUrls: string[] = [];

	function trackObjectUrl(file: Blob) {
		const url = URL.createObjectURL(file);
		objectUrls.push(url);
		return url;
	}

	function releaseObjectUrl(url: string | undefined) {
		const index = url ? objectUrls.indexOf(url) : -1;
		if (index < 0) return;
		objectUrls.splice(index, 1);
		URL.revokeObjectURL(url!);
	}

	function updateItem(id: string, patch: Partial<ScanPage>) {
		const previous = pages.find((p) => p.id === id)?.previewUrl;
		pages = pages.map((p) => (p.id === id ? { ...p, ...patch } : p));
		if (patch.previewUrl && patch.previewUrl !== previous) releaseObjectUrl(previous);
	}

	function stamp() {
		return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
	}

	/** Best-effort cleanup of an object the form will no longer reference. */
	async function discardUpload(url: string | undefined) {
		if (!url || initial.includes(url)) return;
		try {
			await fetch('/keeper/scans', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url })
			});
		} catch {
			// Best-effort cleanup
		}
	}

	async function removeById(id: string) {
		const target = pages.find((p) => p.id === id);
		pages = pages.filter((p) => p.id !== id);
		releaseObjectUrl(target?.previewUrl);
		emit();
		await discardUpload(target?.url);
	}

	/** Swap a page with its neighbour. Order is whatever this array says it is. */
	function moveById(id: string, direction: -1 | 1) {
		const index = pages.findIndex((p) => p.id === id);
		const next = index + direction;
		if (index < 0 || next < 0 || next >= pages.length) return;
		const reordered = [...pages];
		[reordered[index], reordered[next]] = [reordered[next], reordered[index]];
		pages = reordered;
		emit();
	}

	// --- Capture ------------------------------------------------------------

	/**
	 * A full-resolution frame plus the quad that was drawn over it. `corners` is
	 * null when nothing was detected, in which case the frame is stored as shot.
	 */
	function onCaptured(frame: HTMLCanvasElement, cornersFull: CornerPoints | null) {
		const targetId = replacingId;
		replacingId = null;

		const fileName = `scan-${stamp()}.webp`;
		const thumb = downscale(frame, frame.width, frame.height, 640);
		const previewUrl = (thumb ?? frame).toDataURL('image/webp', 0.7);

		// Append the placeholder synchronously so pages land in capture order even
		// though the crop + encode + upload below finish out of order.
		if (targetId) {
			updateItem(targetId, { fileName, previewUrl, status: 'uploading', error: undefined });
			emit();
		} else {
			pages = [...pages, { id: crypto.randomUUID(), fileName, previewUrl, status: 'uploading' }];
		}
		const id = targetId ?? pages[pages.length - 1].id;

		void (async () => {
			try {
				// Work from a 2560-capped copy so the retained original, the crop and
				// the upload all share one pixel space.
				const source = downscale(frame, frame.width, frame.height, MAX_DIM) ?? frame;
				const corners = cornersFull
					? scaleCorners(cornersFull, source.width / frame.width, source.height / frame.height)
					: null;
				await finalizePage(id, source, corners, fileName);
			} catch (e) {
				updateItem(id, {
					status: 'error',
					error: e instanceof Error ? e.message : 'Image processing failed'
				});
			}
		})();
	}

	/** Crop (when we have a quad), encode, keep the original, upload. */
	async function finalizePage(
		id: string,
		source: HTMLCanvasElement,
		corners: CornerPoints | null,
		fileName: string
	) {
		const cropped = corners ? await dewarp(source, corners) : null;
		const encoded = await canvasToWebP(cropped ?? source);
		if (!encoded) throw new Error('Failed to encode image');

		// The un-cropped original rides along as a blob so the crop stays editable.
		const original = await canvasToWebP(source);
		const oldUrl = pages.find((p) => p.id === id)?.url;

		updateItem(id, {
			previewUrl: encoded.previewUrl,
			sourceBlob: original?.blob,
			corners: corners ?? undefined
		});
		await processUpload(id, encoded.blob, fileName, encoded.previewUrl);
		if (oldUrl) await discardUpload(oldUrl);
	}

	/** Optimistically render picked photo(s) and upload the cropped WebP. */
	function onFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (files.length === 0) return;

		for (const file of files) {
			const id = crypto.randomUUID();
			const fileName = file.name.replace(/\.[^/.]+$/, '') + '.webp';

			// Optimistic rendering right away, in selection order.
			pages = [...pages, { id, fileName, previewUrl: trackObjectUrl(file), status: 'uploading' }];

			void (async () => {
				try {
					const source = await fileToCanvas(file);
					if (!source) {
						// Undecodable in this browser (e.g. HEIC): upload it untouched.
						await processUpload(id, file, file.name, trackObjectUrl(file));
						return;
					}
					// Same detection as the camera path; the crop stays editable from
					// the filmstrip, so an over-eager quad is one tap from undone.
					const corners = await detectCorners(source);
					await finalizePage(id, source, corners, fileName);
				} catch (e) {
					updateItem(id, {
						status: 'error',
						error: e instanceof Error ? e.message : 'Image processing failed'
					});
				}
			})();
		}
	}

	/** Push one image to R2 and hand its URL back to the form. */
	async function processUpload(id: string, file: Blob, fileName: string, previewUrl: string) {
		try {
			const body = new FormData();
			body.append('file', file, fileName);
			const res = await fetch('/keeper/scans', { method: 'POST', body });
			if (!res.ok) throw new Error(await res.text());

			const result = (await res.json()) as { url: string; fileName: string };
			updateItem(id, {
				url: result.url,
				fileName: result.fileName,
				previewUrl,
				status: 'done',
				error: undefined
			});
			emit();
		} catch (e) {
			updateItem(id, { status: 'error', error: e instanceof Error ? e.message : 'Upload failed' });
		}
	}

	// --- Crop adjustment ----------------------------------------------------

	async function adjustById(id: string) {
		const page = pages.find((p) => p.id === id);
		if (!page?.sourceBlob) return;
		const image = await fileToCanvas(page.sourceBlob);
		if (!image) {
			error = 'Could not reopen that page for cropping.';
			return;
		}
		adjusting = { id, image, corners: page.corners };
	}

	function applyAdjust(corners: CornerPoints) {
		const open = adjusting;
		adjusting = null;
		if (!open) return;

		const page = pages.find((p) => p.id === open.id);
		updateItem(open.id, { status: 'uploading', error: undefined });
		emit();

		void (async () => {
			try {
				await finalizePage(open.id, open.image, corners, page?.fileName ?? `scan-${stamp()}.webp`);
			} catch (e) {
				updateItem(open.id, {
					status: 'error',
					error: e instanceof Error ? e.message : 'Crop failed'
				});
			}
		})();
	}

	function retakeById(id: string) {
		replacingId = id;
		error = '';
		cameraOn = true;
	}

	function closeCamera() {
		cameraOn = false;
		replacingId = null;
	}

	// Block submit while any upload is in flight.
	$effect(() => {
		pending = pages.some((p) => p.status === 'uploading');
	});

	$effect(() => {
		// Don't leave optimistic previews holding onto picked files.
		return () => {
			for (const url of objectUrls) URL.revokeObjectURL(url);
			objectUrls.length = 0;
		};
	});
</script>

<div class="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-4">
	{#if cameraOn}
		<CameraStage
			pageCount={pages.length}
			replacing={!!replacingId}
			onCapture={onCaptured}
			onDone={closeCamera}
			onError={(message) => (error = message)}
		/>
	{:else}
		<div class="flex flex-wrap gap-2">
			{#if canUseCamera}
				<button
					type="button"
					onclick={() => {
						error = '';
						cameraOn = true;
					}}
					class="inline-flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
				>
					<CameraIcon size={16} />
					{pages.length > 0 ? 'Scan more pages' : 'Scan pages'}
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

	{#if pages.some((p) => p.status === 'error')}
		<div
			class="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"
			role="alert"
		>
			<p class="font-medium">One or more image uploads failed:</p>
			<ul class="mt-1 list-inside list-disc space-y-0.5">
				{#each pages.filter((p) => p.status === 'error') as errItem (errItem.id)}
					<li>{errItem.fileName}: {errItem.error || 'Upload error'}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if adjusting}
		<CornerAdjuster
			image={adjusting.image}
			corners={adjusting.corners}
			onApply={applyAdjust}
			onCancel={() => (adjusting = null)}
		/>
	{/if}

	<ScanFilmstrip
		{pages}
		canRetake={canUseCamera}
		onMove={moveById}
		onRemove={removeById}
		onAdjust={adjustById}
		onRetake={retakeById}
	/>
</div>
