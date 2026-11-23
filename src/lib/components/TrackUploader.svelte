<script lang="ts">
	import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import MusicNotesIcon from 'phosphor-svelte/lib/MusicNotesIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import { formatClock, titleFromFileName } from '#lib/albums/format.ts';
	import { MAX_TRACK_TITLE, MAX_TRACKS_PER_ALBUM } from '#lib/albums/limits.ts';
	import type { UploadedTrack } from '#lib/albums/types.ts';
	import {
		deleteUploadedTrack,
		MAX_TRACK_PUTS_IN_FLIGHT,
		uploadTrack,
		type TrackUploadStage
	} from '#lib/albums/upload.ts';
	import { AUDIO_ACCEPT, AUDIO_TYPE_NAMES } from '#lib/audioType.ts';
	import { createLimiter } from '#lib/uploads/transfer.ts';
	import { formatFileSize } from '#lib/fileSize.ts';

	// An album's tracks: picked or dropped, each uploaded as it arrives (see
	// #lib/albums/upload), and named and put in order here.
	//
	// The rows write the form's track fields themselves, a hidden `trackIds`
	// and a `trackTitles` text field per uploaded track, in play order, so the
	// two lists the server reads always pair up (see `parseAlbumForm`). A row
	// still uploading, or failed, has a title field that submits nothing, so a
	// title is never sent without its track. `pending` (bindable) is true while
	// any track is still uploading and `failed` (bindable) counts the failed
	// ones, so the parent can hold the submit until every track is in: an album
	// saved past either would quietly leave those tracks out. `onChange` reports
	// the uploaded ids whenever they or their order change.
	let {
		onChange,
		pending = $bindable(false),
		failed = $bindable(0),
		initial = [],
		label,
		required = false,
		max = MAX_TRACKS_PER_ALBUM
	}: {
		onChange?: (ids: number[]) => void;
		pending?: boolean;
		failed?: number;
		/** Tracks already in the album (edit flow). Shown as uploaded. */
		initial?: UploadedTrack[];
		label?: string;
		/** Mark the section required (the asterisk only; validation is the form's). */
		required?: boolean;
		max?: number;
	} = $props();

	const labelId = $props.id();

	type Row = {
		key: string;
		/** The picked file's name, for messages. */
		name: string;
		/** What the form submits as this track's title. */
		title: string;
		/** Once finalized, or from `initial`: what the form submits. */
		id?: number;
		/**
		 * From `initial`: already part of the saved album, so removing it is the
		 * form's change to save (the server deletes it then), never a DELETE now.
		 */
		seeded: boolean;
		/** The picked file, kept while it may still need uploading (or retrying). */
		file?: File;
		/** What is known of the uploaded file, for its line of particulars. */
		uploaded?: Pick<UploadedTrack, 'type' | 'bytes' | 'duration'>;
		status: 'working' | 'done' | 'error';
		stage: TrackUploadStage;
		/** 0–1, see `uploadTrack`. */
		progress: number;
		error?: string;
	};

	// Array position is the play order.
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(
		initial.map((t, index) => ({
			key: `initial-${index}`,
			name: t.originalName ?? t.title,
			title: t.title,
			id: t.id,
			seeded: true,
			uploaded: { type: t.type, bytes: t.bytes, duration: t.duration },
			status: 'done',
			stage: 'done',
			progress: 1
		}))
	);

	/** Picks refused outright: past `max`. Cleared by the next pick. */
	let overflow = $state(0);

	const STAGE_LABELS: Record<TrackUploadStage, string> = {
		reading: 'Waiting…',
		uploading: 'Uploading…',
		finalizing: 'Finishing…',
		done: 'Uploaded',
		error: 'Failed'
	};

	/** PUT slots shared by every upload here (see `MAX_TRACK_PUTS_IN_FLIGHT`). */
	const slots = createLimiter(MAX_TRACK_PUTS_IN_FLIGHT);

	/** Per working row: the run uploading it. Aborted when the row is removed or retried. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read imperatively, never rendered
	const runs = new Map<string, AbortController>();

	let nextKey = 0;

	// --- Emitting -------------------------------------------------------------

	const doneIds = () =>
		rows.filter((r) => r.status === 'done' && r.id !== undefined).map((r) => r.id!);

	// What the parent already has: it seeds itself from `initial`.
	// svelte-ignore state_referenced_locally
	let emitted = initial.map((t) => t.id).join(',');

	function emit() {
		const ids = doneIds();
		const signature = ids.join(',');
		if (signature === emitted) return;
		emitted = signature;
		onChange?.(ids);
	}

	$effect(() => {
		pending = rows.some((r) => r.status === 'working');
	});
	$effect(() => {
		failed = rows.filter((r) => r.status === 'error').length;
	});

	// --- Adding ---------------------------------------------------------------

	/** Rows that will (or do) count toward the album; failed ones don't until retried. */
	const occupied = () => rows.filter((r) => r.status !== 'error').length;

	/**
	 * Start uploading picked files, as far as `max` allows. Each pick is put in
	 * file-name order, numbers counted as numbers (`2 - …` before `10 - …`):
	 * an album's files are nearly always numbered, and the order a file picker
	 * hands them over in is the operating system's to choose. A file that isn't
	 * audio fails in its own row, where the keeper can see which one and why.
	 */
	function addFiles(files: File[]) {
		if (files.length === 0) return;
		const sorted = [...files].sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
		);
		const added = sorted.slice(0, Math.max(0, max - occupied()));
		overflow = sorted.length - added.length;

		for (const file of added) {
			const key = `file-${++nextKey}`;
			rows.push({
				key,
				name: file.name,
				title: Array.from(titleFromFileName(file.name)).slice(0, MAX_TRACK_TITLE).join(''),
				seeded: false,
				file,
				status: 'working',
				stage: 'reading',
				progress: 0
			});
			start(key, file);
		}
	}

	/** Upload one row's file. Only the newest run for a row that is still there may touch it. */
	function start(key: string, file: File) {
		runs.get(key)?.abort();
		const run = new AbortController();
		runs.set(key, run);
		const holds = () => runs.get(key) === run && !run.signal.aborted;
		const update = (patch: Partial<Row>) => {
			const row = holds() ? rows.find((r) => r.key === key) : undefined;
			if (row) Object.assign(row, patch);
		};

		update({ status: 'working', stage: 'reading', progress: 0, error: undefined });
		uploadTrack(file, {
			slots,
			signal: run.signal,
			onStage: (stage) => update({ stage }),
			onProgress: (progress) => update({ progress })
		})
			.then(
				(uploaded) => {
					// Removed (or the uploader closed) while it was being finalized:
					// nothing will ever submit this one.
					if (!holds()) return void deleteUploadedTrack(uploaded.id);
					// The title typed meanwhile stays; the server's guess is the same
					// one this row started from.
					update({
						id: uploaded.id,
						uploaded,
						status: 'done',
						stage: 'done',
						progress: 1,
						file: undefined
					});
					emit();
				},
				(e: unknown) =>
					update({
						status: 'error',
						stage: 'error',
						error: e instanceof Error ? e.message : 'Upload failed'
					})
			)
			.finally(() => {
				if (runs.get(key) === run) runs.delete(key);
			});
	}

	function retry(key: string) {
		const row = rows.find((r) => r.key === key);
		if (!row?.file || row.status !== 'error') return;
		if (occupied() >= max) {
			overflow = 1;
			return;
		}
		start(key, row.file);
	}

	function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		// Cleared so picking the same file again still fires `change`.
		input.value = '';
		addFiles(files);
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
		addFiles(Array.from(event.dataTransfer!.files));
	}

	// --- Arranging ------------------------------------------------------------

	function remove(key: string) {
		const row = rows.find((r) => r.key === key);
		if (!row) return;
		rows = rows.filter((r) => r.key !== key);
		// A run still working on it stops, and deletes whatever it finalizes regardless.
		runs.get(key)?.abort();
		runs.delete(key);
		emit();
		if (row.status === 'done' && !row.seeded && row.id !== undefined) {
			void deleteUploadedTrack(row.id);
		}
	}

	/** Swap a row with its neighbor. Order is whatever this array says it is. */
	function move(key: string, direction: -1 | 1) {
		const index = rows.findIndex((r) => r.key === key);
		const next = index + direction;
		if (index < 0 || next < 0 || next >= rows.length) return;
		const reordered = [...rows];
		[reordered[index], reordered[next]] = [reordered[next], reordered[index]];
		rows = reordered;
		emit();
	}

	$effect(() => {
		// Leaving the page (or the form) abandons whatever is still uploading; a
		// run caught mid-finalize deletes what it made. Finished uploads stay:
		// the form may just have submitted them.
		return () => {
			for (const run of runs.values()) run.abort();
			runs.clear();
			pending = false;
			failed = 0;
		};
	});

	/**
	 * A row's line of particulars once uploaded: "4:05 · MP3 · 6.2 MB", and the
	 * file it came from when the title no longer says so.
	 */
	function particulars(row: Row): string {
		if (!row.uploaded) return '';
		const { duration, type, bytes } = row.uploaded;
		return [
			duration != null ? formatClock(duration) : null,
			AUDIO_TYPE_NAMES[type],
			formatFileSize(bytes),
			row.name && row.name !== row.title ? row.name : null
		]
			.filter(Boolean)
			.join(' · ');
	}
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
			<label
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gray-500"
			>
				<MusicNotesIcon size={16} /> Add tracks
				<input type="file" accept={AUDIO_ACCEPT} multiple onchange={onPick} class="sr-only" />
			</label>
			<span class="text-xs text-gray-500 pointer-coarse:hidden">
				{dragDepth > 0 ? 'Drop to add them' : 'or drop them here'}
			</span>
			{#if rows.length > 0}
				<span class="ml-auto text-xs text-gray-500">{occupied()} of {max}</span>
			{/if}
		</div>
		<p class="mt-2 text-xs text-gray-500">
			MP3, M4A, AAC, FLAC, WAV or Ogg. Each pick is put in file-name order; rename and reorder them
			below.
		</p>

		{#if overflow > 0}
			<p
				class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800"
				role="alert"
			>
				An album holds at most {max} tracks, so {overflow}
				{overflow === 1 ? 'was' : 'were'} not added.
			</p>
		{/if}

		{#if rows.length > 0}
			<ol class="mt-4 space-y-2">
				{#each rows as row, index (row.key)}
					{@const done = row.status === 'done' && row.id !== undefined}
					<li
						class="rounded-md border bg-white p-2.5 {row.status === 'error'
							? 'border-red-300 ring-1 ring-red-300'
							: 'border-gray-200'}"
					>
						{#if done}
							<input type="hidden" name="trackIds" value={row.id} />
						{/if}
						<div class="flex items-center gap-2">
							<span class="w-6 shrink-0 text-right text-xs text-gray-500 tabular-nums">
								{index + 1}
							</span>
							<!-- Named only once its track is in, so the two lists pair up. -->
							<input
								type="text"
								name={done ? 'trackTitles' : undefined}
								bind:value={row.title}
								maxlength={MAX_TRACK_TITLE}
								aria-label="Title of track {index + 1}"
								placeholder="Track title"
								autocomplete="off"
								class="min-w-0 flex-1 rounded-sm border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:ring-gray-500 {row.title.trim() ===
								''
									? 'border-red-400'
									: ''}"
							/>
							<div class="flex shrink-0 items-center gap-1">
								<button
									type="button"
									onclick={() => move(row.key, -1)}
									disabled={index === 0}
									aria-label="Move track {index + 1} earlier"
									class="rounded-sm border border-gray-300 bg-white p-2 text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
								>
									<ArrowUpIcon size={14} />
								</button>
								<button
									type="button"
									onclick={() => move(row.key, 1)}
									disabled={index === rows.length - 1}
									aria-label="Move track {index + 1} later"
									class="rounded-sm border border-gray-300 bg-white p-2 text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
								>
									<ArrowDownIcon size={14} />
								</button>
								{#if row.status === 'error' && row.file}
									<button
										type="button"
										onclick={() => retry(row.key)}
										aria-label="Retry track {index + 1}"
										title="Try again"
										class="rounded-sm border border-gray-300 bg-white p-2 text-gray-700 transition hover:bg-gray-100"
									>
										<ArrowClockwiseIcon size={14} />
									</button>
								{/if}
								<button
									type="button"
									onclick={() => remove(row.key)}
									aria-label="Remove track {index + 1}"
									class="rounded-sm border border-gray-300 bg-white p-2 text-gray-700 transition hover:bg-red-50 hover:text-red-600"
								>
									<TrashIcon size={14} />
								</button>
							</div>
						</div>

						<div class="mt-1.5 pl-8 text-xs">
							{#if row.status === 'working'}
								<div class="flex items-center gap-2 text-gray-600">
									<CircleNotchIcon size={12} class="shrink-0 animate-spin" />
									<span class="shrink-0">{STAGE_LABELS[row.stage]}</span>
									<div
										class="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200"
										role="progressbar"
										aria-label="Track {index + 1} upload"
										aria-valuemin={0}
										aria-valuemax={100}
										aria-valuenow={Math.round(row.progress * 100)}
									>
										<div
											class="h-full bg-gray-700 transition-[width]"
											style:width="{row.progress * 100}%"
										></div>
									</div>
								</div>
								<p class="mt-0.5 truncate text-gray-400">{row.name}</p>
							{:else if row.status === 'error'}
								<p class="flex items-start gap-1 text-red-700">
									<WarningIcon size={12} class="mt-0.5 shrink-0" />
									<span class="break-words">{row.name}: {row.error || 'Upload failed'}</span>
								</p>
							{:else}
								<p class="truncate text-gray-500">{particulars(row)}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>
