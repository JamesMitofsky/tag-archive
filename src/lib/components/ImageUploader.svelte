<script lang="ts">
	import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import ImageSquareIcon from 'phosphor-svelte/lib/ImageSquareIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import { SvelteSet } from 'svelte/reactivity';
	import type { UploadedImage } from '$lib/images/types';
	import {
		createLimiter,
		deleteUploaded,
		MAX_PUTS_IN_FLIGHT,
		sniffFile,
		UNSUPPORTED_PHOTO,
		uploadImage,
		UploadError,
		type UploadStage
	} from '$lib/images/upload';
	import { createSerialQueue } from '$lib/scanner/serial';
	import { MAX_IMAGES_PER_SET } from '$lib/validation/imageSet';

	// Photographs for an image set: picked or dropped, each uploaded as it
	// arrives (see $lib/images/upload). Emits the ids of the uploaded ones in
	// display order, for the parent form to submit as hidden `imageIds` fields.
	// `pending` (bindable) is true while any is still uploading, and `failed`
	// (bindable) counts the ones that failed and wait to be tried again or
	// removed, so the parent can hold the submit until every one is finalized:
	// a set saved past either would quietly leave those photographs out.
	let {
		onChange,
		// eslint-disable-next-line no-useless-assignment -- prop default, not a dead store
		pending = $bindable(false),
		// eslint-disable-next-line no-useless-assignment -- prop default, not a dead store
		failed = $bindable(0),
		initial = [],
		label,
		required = false,
		max = MAX_IMAGES_PER_SET
	}: {
		onChange?: (ids: number[]) => void;
		pending?: boolean;
		failed?: number;
		/** Photographs already in the set (edit flow). Shown as uploaded. */
		initial?: UploadedImage[];
		/** Section label shown above the uploader, styled like the other form fields'. */
		label?: string;
		/** Mark the section required (the asterisk only; validation is the form's). */
		required?: boolean;
		/** The most photographs that may be added; further picks are refused. */
		max?: number;
	} = $props();

	const labelId = $props.id();

	type Tile = {
		key: string;
		/** The picked file's name, for messages. */
		name: string;
		/** Once finalized, or from `initial`: what the form submits. */
		id?: number;
		/**
		 * From `initial`: already part of the saved set, so removing it is the
		 * form's change to save (the server deletes it then), never a DELETE now.
		 */
		seeded: boolean;
		/** The picked file, kept while it may still need uploading (or retrying). */
		file?: File;
		/** `initial`'s URL, or an object URL of the file and then of its display copy. */
		preview?: string;
		status: 'working' | 'done' | 'error';
		stage: UploadStage;
		/** 0–1, see `uploadImage`. */
		progress: number;
		error?: string;
		/** Failed on the server's "tap the tag again" refusal (see `UploadError.locked`). */
		locked: boolean;
	};

	// Array position is the display order.
	// svelte-ignore state_referenced_locally
	let tiles = $state<Tile[]>(
		initial.map((image, index) => ({
			key: `initial-${index}`,
			name: `Photograph ${image.id}`,
			id: image.id,
			seeded: true,
			preview: image.url,
			status: 'done',
			stage: 'done',
			progress: 1,
			locked: false
		}))
	);

	/** Picks refused outright: unsupported files, and any past `max`. Cleared by the next pick. */
	let notice = $state<{ refused: { name: string; reason: string }[]; overflow: number } | null>(
		null
	);

	const STAGE_LABELS: Record<UploadStage, string> = {
		reading: 'Waiting…',
		uploading: 'Uploading…',
		encoding: 'Preparing…',
		finalizing: 'Finishing…',
		done: 'Uploaded',
		error: 'Failed'
	};

	/** Full-size image work, one photograph at a time: decoded photos are large canvases. */
	const heavy = createSerialQueue();
	/** PUT slots shared by every upload here (see `MAX_PUTS_IN_FLIGHT`). */
	const slots = createLimiter(MAX_PUTS_IN_FLIGHT);

	/** Per working tile: the run uploading it. Aborted when the tile is removed or retried. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read imperatively, never rendered
	const runs = new Map<string, AbortController>();

	let nextKey = 0;
	/** Set on teardown, so a pick still being checked then starts nothing. */
	let destroyed = false;

	// --- Emitting -------------------------------------------------------------

	const doneIds = () =>
		tiles.filter((t) => t.status === 'done' && t.id !== undefined).map((t) => t.id!);

	// What the parent already has: it seeds itself from `initial`, as it would
	// without this component.
	// svelte-ignore state_referenced_locally
	let emitted = initial.map((image) => image.id).join(',');

	/** Tell the parent the ids it should submit, whenever they (or their order) change. */
	function emit() {
		const ids = doneIds();
		const signature = ids.join(',');
		if (signature === emitted) return;
		emitted = signature;
		onChange?.(ids);
	}

	// Block submit while any photograph is still on its way, or has failed to get there.
	$effect(() => {
		pending = tiles.some((t) => t.status === 'working');
	});
	$effect(() => {
		failed = tiles.filter((t) => t.status === 'error').length;
	});

	// --- Previews -------------------------------------------------------------

	/** Object URLs minted for previews; each is revoked once its tile no longer shows it. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read imperatively, never rendered
	const objectUrls = new Set<string>();
	/** Previews this browser couldn't show (a HEIC file outside Safari, say). */
	const broken = new SvelteSet<string>();

	function trackObjectUrl(blob: Blob) {
		const url = URL.createObjectURL(blob);
		objectUrls.add(url);
		return url;
	}

	function releaseObjectUrl(url: string | undefined) {
		if (!url || !objectUrls.delete(url)) return;
		URL.revokeObjectURL(url);
		broken.delete(url);
	}

	function setPreview(key: string, url: string) {
		const tile = tiles.find((t) => t.key === key);
		if (!tile) return releaseObjectUrl(url);
		const previous = tile.preview;
		tile.preview = url;
		releaseObjectUrl(previous);
	}

	// --- Adding ---------------------------------------------------------------

	/** Tiles that will (or do) count toward the set; failed ones don't until retried. */
	const occupied = () => tiles.filter((t) => t.status !== 'error').length;

	/**
	 * Check each file's type from its bytes, refuse what the archive can't take
	 * and anything past `max` (saying so), and start uploading the rest, in the
	 * order picked.
	 */
	async function addFiles(files: File[]) {
		if (files.length === 0) return;
		const checked = await Promise.all(
			files.map(async (file) => {
				try {
					return { file, reason: (await sniffFile(file)) ? null : UNSUPPORTED_PHOTO };
				} catch (e) {
					return { file, reason: e instanceof Error ? e.message : 'This file could not be read' };
				}
			})
		);
		if (destroyed) return;
		const refused = checked.flatMap(({ file, reason }) =>
			reason ? [{ name: file.name, reason }] : []
		);
		const accepted = checked.filter(({ reason }) => !reason).map(({ file }) => file);
		// Counted only now, after the await, so a retry or removal made meanwhile counts too.
		const added = accepted.slice(0, Math.max(0, max - occupied()));
		const overflow = accepted.length - added.length;
		notice = refused.length > 0 || overflow > 0 ? { refused, overflow } : null;

		for (const file of added) {
			const key = `file-${++nextKey}`;
			tiles.push({
				key,
				name: file.name,
				seeded: false,
				file,
				// Shows at once where the browser can decode the file; replaced by
				// the display copy as soon as that is encoded.
				preview: trackObjectUrl(file),
				status: 'working',
				stage: 'reading',
				progress: 0,
				locked: false
			});
			start(key, file);
		}
	}

	/** Upload one tile's file. Only the newest run for a tile that is still there may touch it. */
	function start(key: string, file: File) {
		runs.get(key)?.abort();
		const run = new AbortController();
		runs.set(key, run);
		const holds = () => runs.get(key) === run && !run.signal.aborted;
		const update = (patch: Partial<Tile>) => {
			const tile = holds() ? tiles.find((t) => t.key === key) : undefined;
			if (tile) Object.assign(tile, patch);
		};

		update({ status: 'working', stage: 'reading', progress: 0, error: undefined, locked: false });
		uploadImage(file, {
			heavy,
			slots,
			signal: run.signal,
			onStage: (stage) => update({ stage }),
			onProgress: (progress) => update({ progress }),
			onDisplay: (display) => {
				if (holds()) setPreview(key, trackObjectUrl(display));
			}
		})
			.then(
				(image) => {
					// Removed (or the uploader closed) while it was being finalized:
					// nothing will ever submit this one.
					if (!holds()) return void deleteUploaded(image.id);
					update({ id: image.id, status: 'done', stage: 'done', progress: 1, file: undefined });
					emit();
				},
				(e: unknown) =>
					update({
						status: 'error',
						stage: 'error',
						error: e instanceof Error ? e.message : 'Upload failed',
						locked: e instanceof UploadError && e.locked
					})
			)
			.finally(() => {
				if (runs.get(key) === run) runs.delete(key);
			});
	}

	/** Start failed tiles again, in order, as far as `max` allows (saying so past it). */
	function retry(keys: string[]) {
		let overflow = 0;
		for (const key of keys) {
			const tile = tiles.find((t) => t.key === key);
			if (!tile?.file || tile.status !== 'error') continue;
			// `start` marks each one working at once, so this counts the ones before it.
			if (occupied() >= max) {
				overflow += 1;
				continue;
			}
			start(key, tile.file);
		}
		if (overflow > 0) notice = { refused: [], overflow };
	}

	/**
	 * Once the visitor has tapped the tag again: every photograph the lapsed
	 * access stopped. That refusal is about the visit, so it is retried as one.
	 */
	function retryLocked() {
		retry(tiles.filter((t) => t.status === 'error' && t.locked).map((t) => t.key));
	}

	/** Picks are taken in turn, so a quick second pick can't land its tiles ahead of the first's. */
	let picking: Promise<void> = Promise.resolve();

	function queuePick(files: File[]) {
		const pick = picking.then(() => addFiles(files));
		// A pick that throws still lets the next one through (and still reports).
		picking = pick.catch(() => {});
		return pick;
	}

	function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		// Cleared so picking the same file again still fires `change`.
		input.value = '';
		void queuePick(files);
	}

	// --- Dropping -------------------------------------------------------------

	/** Nested enter/leave pairs as the pointer crosses child elements; > 0 while over the zone. */
	let dragDepth = $state(0);

	/** Only file drags: a dragged link or text selection isn't ours to take. */
	const carriesFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files');

	function onDragEnter(event: DragEvent) {
		if (!carriesFiles(event)) return;
		event.preventDefault();
		dragDepth += 1;
	}

	function onDragOver(event: DragEvent) {
		if (!carriesFiles(event)) return;
		// Without this the browser would open the dropped file in place of the page.
		event.preventDefault();
		event.dataTransfer!.dropEffect = 'copy';
	}

	function onDragLeave(event: DragEvent) {
		if (!carriesFiles(event)) return;
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function onDrop(event: DragEvent) {
		if (!carriesFiles(event)) return;
		event.preventDefault();
		dragDepth = 0;
		void queuePick(Array.from(event.dataTransfer!.files));
	}

	// --- Arranging ------------------------------------------------------------

	function remove(key: string) {
		const tile = tiles.find((t) => t.key === key);
		if (!tile) return;
		tiles = tiles.filter((t) => t.key !== key);
		// A run still working on it stops, and deletes whatever it finalizes regardless.
		runs.get(key)?.abort();
		runs.delete(key);
		releaseObjectUrl(tile.preview);
		emit();
		if (tile.status === 'done' && !tile.seeded && tile.id !== undefined) {
			void deleteUploaded(tile.id);
		}
	}

	/** Swap a tile with its neighbor. Order is whatever this array says it is. */
	function move(key: string, direction: -1 | 1) {
		const index = tiles.findIndex((t) => t.key === key);
		const next = index + direction;
		if (index < 0 || next < 0 || next >= tiles.length) return;
		const reordered = [...tiles];
		[reordered[index], reordered[next]] = [reordered[next], reordered[index]];
		tiles = reordered;
		emit();
	}

	$effect(() => {
		// Leaving the page (or the form) abandons whatever is still uploading;
		// a run caught mid-finalize deletes what it made. Finished uploads stay:
		// the form may just have submitted them.
		return () => {
			destroyed = true;
			for (const run of runs.values()) run.abort();
			runs.clear();
			for (const url of objectUrls) URL.revokeObjectURL(url);
			objectUrls.clear();
			// Nothing is on its way, or waiting to be tried again, any more. A form
			// that outlives the uploader (one that hides it, say) would otherwise
			// wait on it for good.
			pending = false;
			failed = 0;
		};
	});

	/** The locked refusal is about the visit, not any one file: said once, whichever tiles hit it. */
	const lockedMessage = $derived(tiles.find((t) => t.status === 'error' && t.locked)?.error);
	const failures = $derived(tiles.filter((t) => t.status === 'error' && !t.locked));
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
	<!-- The drop zone is a pointer convenience; the file input is the way in
	     for keyboards and screen readers. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		ondragenter={onDragEnter}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		class="rounded-lg border p-4 transition {label ? 'mt-1.5' : ''} {dragDepth > 0
			? 'border-dashed border-gray-500 bg-white/60'
			: 'border-gray-300 bg-white/25'}"
	>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			<!-- The input itself is visually hidden, so its keyboard focus shows on the label. -->
			<label
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gray-500"
			>
				<ImageSquareIcon size={16} /> Add photographs
				<input
					type="file"
					accept="image/*,.heic,.heif"
					multiple
					onchange={onPick}
					class="sr-only"
				/>
			</label>
			<!-- Nothing to drag from on a touch screen. -->
			<span class="text-xs text-gray-500 pointer-coarse:hidden">
				{dragDepth > 0 ? 'Drop to add them' : 'or drop them here'}
			</span>
			{#if tiles.length > 0}
				<span class="ml-auto text-xs text-gray-500">{occupied()} of {max}</span>
			{/if}
		</div>

		{#if notice}
			<div
				class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800"
				role="alert"
			>
				{#if notice.overflow > 0}
					<p class="font-medium">
						A set holds at most {max} photographs, so {notice.overflow}
						{notice.overflow === 1 ? 'was' : 'were'} not added.
					</p>
				{/if}
				{#if notice.refused.length > 0}
					<p class="font-medium">Not added:</p>
					<ul class="mt-1 list-inside list-disc space-y-0.5">
						{#each notice.refused as item, index (index)}
							<li>{item.name}: {item.reason}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#if lockedMessage || failures.length > 0}
			<div
				class="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"
				role="alert"
			>
				{#if lockedMessage}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
						<p class="font-medium">{lockedMessage}</p>
						<button
							type="button"
							onclick={retryLocked}
							class="inline-flex items-center gap-1 rounded-sm border border-red-300 bg-white px-2 py-1 text-red-700 transition hover:bg-red-100"
						>
							<ArrowClockwiseIcon size={12} /> Try again
						</button>
					</div>
				{/if}
				{#if failures.length > 0}
					<p class="font-medium">One or more photographs failed to upload:</p>
					<ul class="mt-1 list-inside list-disc space-y-0.5">
						{#each failures as tile (tile.key)}
							<li>{tile.name}: {tile.error || 'Upload error'}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#if tiles.length > 0}
			<ol class="mt-4 flex flex-wrap gap-3">
				{#each tiles as tile, index (tile.key)}
					<li class="w-40">
						<div
							class="relative overflow-hidden rounded-md border bg-white {tile.status === 'error'
								? 'border-red-400 ring-1 ring-red-400'
								: 'border-gray-200'}"
						>
							{#if tile.preview && !broken.has(tile.preview)}
								<img
									src={tile.preview}
									alt="Photograph {index + 1}"
									decoding="async"
									loading="lazy"
									onerror={(event) => broken.add(event.currentTarget.getAttribute('src') ?? '')}
									class="h-40 w-full object-contain {tile.status === 'working' ? 'opacity-50' : ''}"
								/>
							{:else}
								<div
									role="img"
									aria-label="Photograph {index + 1}"
									class="flex h-40 w-full items-center justify-center bg-gray-50 text-gray-400"
								>
									<ImageSquareIcon size={40} />
								</div>
							{/if}

							<span
								class="absolute top-1 left-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white"
							>
								{index + 1}
							</span>

							{#if tile.status === 'working'}
								<div
									class="absolute inset-0 flex flex-col items-center justify-center bg-black/30 text-white"
								>
									<CircleNotchIcon size={24} class="animate-spin" />
									<span class="mt-1 text-[10px] font-medium">{STAGE_LABELS[tile.stage]}</span>
								</div>
								<div
									class="absolute inset-x-0 bottom-0 h-1 bg-black/30"
									role="progressbar"
									aria-label="Photograph {index + 1} upload"
									aria-valuemin={0}
									aria-valuemax={100}
									aria-valuenow={Math.round(tile.progress * 100)}
								>
									<div
										class="h-full bg-white transition-[width]"
										style:width="{tile.progress * 100}%"
									></div>
								</div>
							{/if}

							{#if tile.status === 'error'}
								<div
									class="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-red-600/90 px-1.5 py-1 text-[10px] font-medium text-white"
									title={tile.error}
								>
									<WarningIcon size={12} class="shrink-0" />
									<!-- The locked message is said once, above. -->
									<span class="truncate"
										>{tile.locked ? 'Not uploaded' : tile.error || 'Failed'}</span
									>
								</div>
							{/if}

							<button
								type="button"
								onclick={() => remove(tile.key)}
								aria-label="Remove photograph {index + 1}"
								class="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-red-600"
							>
								<TrashIcon size={14} />
							</button>
						</div>

						<div class="mt-1 flex items-center gap-1">
							<button
								type="button"
								onclick={() => move(tile.key, -1)}
								disabled={index === 0}
								aria-label="Move photograph {index + 1} earlier"
								class="rounded-sm border border-gray-300 bg-white p-2.5 text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
							>
								<ArrowLeftIcon size={14} />
							</button>
							<button
								type="button"
								onclick={() => move(tile.key, 1)}
								disabled={index === tiles.length - 1}
								aria-label="Move photograph {index + 1} later"
								class="rounded-sm border border-gray-300 bg-white p-2.5 text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
							>
								<ArrowRightIcon size={14} />
							</button>

							{#if tile.status === 'error' && tile.file}
								<button
									type="button"
									onclick={() => retry([tile.key])}
									aria-label="Retry photograph {index + 1}"
									title="Try again"
									class="rounded-sm border border-gray-300 bg-white p-2.5 text-gray-700 transition hover:bg-gray-100"
								>
									<ArrowClockwiseIcon size={14} />
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>
