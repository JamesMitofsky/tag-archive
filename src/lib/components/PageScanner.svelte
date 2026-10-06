<script lang="ts">
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import ImageSquareIcon from 'phosphor-svelte/lib/ImageSquareIcon';
	import CameraStage from './CameraStage.svelte';
	import ImmersiveView from './ImmersiveView.svelte';
	import ScanFilmstrip from './ScanFilmstrip.svelte';
	import ScanReview from './ScanReview.svelte';
	import CornerAdjuster from './CornerAdjuster.svelte';
	import {
		detectCorners,
		dewarp,
		isFullFrame,
		refineDetection,
		type CornerPoints
	} from '$lib/scanner/detect';
	import {
		MAX_DIM,
		canvasToWebP,
		downscale,
		encodeWebP,
		fileToCanvas,
		releaseCanvas
	} from '$lib/scanner/image';
	import { createSerialQueue } from '$lib/scanner/serial';
	import type { ScanPage } from '$lib/scanner/types';

	// Emits the current list of uploaded image URLs (display order) so the parent form
	// can store them. `pending` (bindable) is true while an upload is in flight, so the
	// parent can block submit until every image is finalized.
	let {
		onChange,
		// eslint-disable-next-line no-useless-assignment -- prop default, not a dead store
		pending = $bindable(false),
		initial = [],
		prepareUpload,
		label,
		required = false
	}: {
		onChange?: (urls: string[]) => void;
		pending?: boolean;
		/** Pre-existing scan URLs to seed the list with (edit flow). */
		initial?: string[];
		/**
		 * Awaited before each upload — how an anonymous contributor's draft session
		 * is obtained, or renewed (`renew`) after the server reports it expired.
		 */
		prepareUpload?: (options?: { renew?: boolean }) => Promise<void>;
		/** Section label shown above the scanner, styled like the other form fields'. */
		label?: string;
		/** Mark the section required (the asterisk only; validation is the form's). */
		required?: boolean;
	} = $props();

	const labelId = $props.id();

	const SCANS_ENDPOINT = '/api/scans';

	/** The server's message for a failed upload, rather than a raw JSON body. */
	async function failureMessage(res: Response): Promise<string> {
		const text = await res.text();
		try {
			return (JSON.parse(text) as { message?: string }).message || text;
		} catch {
			return text || `Upload failed (${res.status})`;
		}
	}

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
	/**
	 * A camera run: shoot (`camera`), then crop what was shot (`review`). Only
	 * finishing the review turns the photos into pages and uploads them.
	 */
	let stage = $state<'closed' | 'camera' | 'review'>('closed');
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
			await fetch(SCANS_ENDPOINT, {
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

	/** One photo from the current camera run. Becomes a page when the run is finished. */
	type Shot = { id: string; fileName: string; thumbUrl: string };
	/** What the review and the upload need from a photo, worked out off-screen after it was shot. */
	type Prepared = { blob: Blob; detected: CornerPoints | null };

	const THUMB_DIM = 640;

	let shots = $state<Shot[]>([]);
	// The two maps below are deliberately not reactive: one is written on every
	// corner drag, and nothing on screen reads either of them.
	/** Per shot: its original (2560-capped WebP) and the page found in it. Resolves null if discarded first. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read imperatively, never rendered
	const prepared = new Map<string, Promise<Prepared | null>>();
	/** Per shot: the corners as the user left them in the review. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read imperatively, never rendered
	const edits = new Map<string, CornerPoints>();
	/** Full-size image work, one photo at a time. */
	const heavy = createSerialQueue();

	/** The shutter: keep the frame, find the page in it later. Nothing is uploaded yet. */
	function onCaptured(frame: HTMLCanvasElement) {
		// A retake is one photo; a second tap landing before the review opens is dropped.
		if (replacingId && shots.length > 0) return releaseCanvas(frame);

		const id = crypto.randomUUID();
		const thumb = downscale(frame, frame.width, frame.height, THUMB_DIM);
		const thumbUrl = (thumb ?? frame).toDataURL('image/webp', 0.7);
		releaseCanvas(thumb);

		shots = [...shots, { id, fileName: `scan-${stamp()}.webp`, thumbUrl }];
		const task = heavy.run(() => prepareShot(id, frame));
		// Failures surface where the photo is used (the review, the upload).
		task.catch(() => {});
		prepared.set(id, task);

		if (replacingId) stage = 'review';
	}

	/**
	 * Find the page in a still photo and keep a compact original. Runs behind the
	 * camera while the user carries on shooting; nothing of it is shown until
	 * the review.
	 */
	async function prepareShot(id: string, frame: HTMLCanvasElement): Promise<Prepared | null> {
		const source = downscale(frame, frame.width, frame.height, MAX_DIM);
		try {
			// Discarded in the review before its turn came round.
			if (!prepared.has(id) || !source) return null;
			releaseCanvas(frame);
			const found = await detectCorners(source);
			const detected = found ? refineDetection(source, found) : null;
			const blob = await encodeWebP(source);
			if (!blob) throw new Error('Failed to encode image');
			return { blob, detected };
		} finally {
			releaseCanvas(frame);
			releaseCanvas(source);
		}
	}

	/** The review's view of a shot: the photo, and the quad to start from. */
	async function loadShot(id: string) {
		const ready = await prepared.get(id);
		if (!ready) return null;
		const image = await fileToCanvas(ready.blob);
		if (!image) return null;
		return { image, corners: edits.get(id) ?? ready.detected, detected: !!ready.detected };
	}

	function discardShot(id: string) {
		prepared.delete(id);
		edits.delete(id);
		shots = shots.filter((s) => s.id !== id);
		if (shots.length === 0) stage = 'camera';
	}

	/** Back from the first photo: shoot more, or shoot the retake again. */
	function backToCamera() {
		if (replacingId) for (const shot of shots) discardShot(shot.id);
		stage = 'camera';
	}

	/**
	 * The exit button and Escape. With nothing shot it quits; once something is,
	 * it moves on, and leaving the review finishes it. Photos are never thrown
	 * away by leaving: they can be removed from the page list afterwards.
	 */
	function exit() {
		if (stage === 'review') finishRun();
		else if (shots.length > 0) stage = 'review';
		else closeRun();
	}

	function closeRun() {
		stage = 'closed';
		replacingId = null;
	}

	/** Turn the run's photos into pages, in the order shot, and upload them. */
	function finishRun() {
		const run = shots;
		const target = replacingId ? pages.find((p) => p.id === replacingId) : undefined;
		shots = [];
		closeRun();
		if (run.length === 0) return;

		if (target && run.length === 1) {
			const [shot] = run;
			updateItem(target.id, {
				fileName: shot.fileName,
				previewUrl: shot.thumbUrl,
				status: 'uploading',
				error: undefined
			});
			emit();
			void commitShot(target.id, shot);
			return;
		}

		pages = [
			...pages,
			...run.map((shot) => ({
				id: shot.id,
				fileName: shot.fileName,
				previewUrl: shot.thumbUrl,
				status: 'uploading' as const
			}))
		];
		for (const shot of run) void commitShot(shot.id, shot);
	}

	/** Crop a finished shot as the review left it, then upload it as page `pageId`. */
	async function commitShot(pageId: string, shot: Shot) {
		try {
			const ready = await prepared.get(shot.id);
			if (!ready) throw new Error('Image processing failed');
			const corners = edits.get(shot.id) ?? ready.detected;
			const rendered = await heavy.run(async () => {
				const source = await fileToCanvas(ready.blob);
				if (!source) throw new Error('Could not reopen the photo');
				try {
					return await cropAndEncode(source, corners);
				} finally {
					releaseCanvas(source);
				}
			});
			// The upload runs outside the queue, so the next photo's crop overlaps it.
			await commitPage(pageId, rendered, ready.blob, shot.fileName);
		} catch (e) {
			updateItem(pageId, {
				status: 'error',
				error: e instanceof Error ? e.message : 'Image processing failed'
			});
		} finally {
			prepared.delete(shot.id);
			edits.delete(shot.id);
		}
	}

	/** Crop (when there is a quad that isn't the whole frame) and encode for upload. */
	async function cropAndEncode(source: HTMLCanvasElement, corners: CornerPoints | null) {
		const crop = corners && !isFullFrame(corners, source.width, source.height) ? corners : null;
		const cropped = crop ? await dewarp(source, crop) : null;
		try {
			const encoded = await canvasToWebP(cropped ?? source);
			if (!encoded) throw new Error('Failed to encode image');
			return { encoded, corners: crop };
		} finally {
			releaseCanvas(cropped);
		}
	}

	/** Show the cropped page, keep its original for re-cropping, upload it. */
	async function commitPage(
		id: string,
		{ encoded, corners }: Awaited<ReturnType<typeof cropAndEncode>>,
		original: Blob | undefined,
		fileName: string
	) {
		const oldUrl = pages.find((p) => p.id === id)?.url;
		updateItem(id, {
			previewUrl: encoded.previewUrl,
			sourceBlob: original,
			corners: corners ?? undefined
		});
		await processUpload(id, encoded.blob, fileName, encoded.previewUrl);
		if (oldUrl) await discardUpload(oldUrl);
	}

	/** Crop (when we have a quad), encode, keep the original, upload. */
	async function finalizePage(
		id: string,
		source: HTMLCanvasElement,
		corners: CornerPoints | null,
		fileName: string,
		/** The original, when it is already encoded. */
		original?: Blob
	) {
		const rendered = await cropAndEncode(source, corners);
		// The un-cropped original rides along as a blob so the crop stays editable.
		const kept = original ?? (await encodeWebP(source)) ?? undefined;
		await commitPage(id, rendered, kept, fileName);
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
					const detected = await detectCorners(source);
					const corners = detected ? refineDetection(source, detected) : null;
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
			const send = () => {
				const body = new FormData();
				body.append('file', file, fileName);
				return fetch(SCANS_ENDPOINT, { method: 'POST', body });
			};
			await prepareUpload?.();
			let res = await send();
			// An anonymous session that lapsed mid-form: renew it once, then retry.
			if (res.status === 401 && prepareUpload) {
				await prepareUpload({ renew: true });
				res = await send();
			}
			if (!res.ok) throw new Error(await failureMessage(res));

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
				await finalizePage(
					open.id,
					open.image,
					corners,
					page?.fileName ?? `scan-${stamp()}.webp`,
					page?.sourceBlob
				);
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
		stage = 'camera';
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

<div role="group" aria-labelledby={label ? labelId : undefined}>
	{#if label}
		<span id={labelId} class="block text-sm font-medium text-gray-700">
			{label}
			{#if required}
				<span class="text-red-600" title="Required" aria-label="required">*</span>
			{/if}
		</span>
	{/if}
	<div class="rounded-lg border border-gray-300 bg-white/25 p-4 {label ? 'mt-1.5' : ''}">
		<div class="flex flex-wrap gap-2">
			{#if canUseCamera}
				<button
					type="button"
					onclick={() => {
						error = '';
						stage = 'camera';
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

		<ScanFilmstrip
			{pages}
			canRetake={canUseCamera}
			onMove={moveById}
			onRemove={removeById}
			onAdjust={adjustById}
			onRetake={retakeById}
		/>
	</div>
</div>

<!-- Shooting and cropping take over the screen: the form is a lot to look at
     around a live viewfinder, and a fixed viewport means nothing reflows as
     pages land. One view for both steps, so moving between them is a swap of
     content, not a close and reopen. -->
<ImmersiveView
	open={stage !== 'closed'}
	title={stage === 'review' ? 'Crop pages' : replacingId ? 'Retake page' : 'Scan pages'}
	onClose={exit}
>
	{#if stage === 'camera'}
		<CameraStage
			shotCount={shots.length}
			latestPreview={shots.at(-1)?.thumbUrl}
			replacing={!!replacingId}
			onCapture={onCaptured}
			onDone={exit}
			onError={(message) => (error = message)}
		/>
	{:else if stage === 'review'}
		<ScanReview
			{shots}
			load={loadShot}
			replacing={!!replacingId}
			onChange={(id, corners) => edits.set(id, corners)}
			onDiscard={discardShot}
			onBack={backToCamera}
			onDone={finishRun}
		/>
	{/if}
</ImmersiveView>

<ImmersiveView open={!!adjusting} title="Adjust crop" onClose={() => (adjusting = null)}>
	{#if adjusting}
		<CornerAdjuster
			image={adjusting.image}
			corners={adjusting.corners}
			onApply={applyAdjust}
			onCancel={() => (adjusting = null)}
		/>
	{/if}
</ImmersiveView>
