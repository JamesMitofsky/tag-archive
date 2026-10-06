<script lang="ts">
	import { untrack } from 'svelte';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import CornersOutIcon from 'phosphor-svelte/lib/CornersOutIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import CornerEditorSurface from './CornerEditorSurface.svelte';
	import type { CornerPoints } from '$lib/scanner/detect';
	import { releaseCanvas } from '$lib/scanner/image';

	// The crop step after a camera run: every photo just taken, one at a time,
	// with the page found on the still photo and the corners there to correct.
	// It owns only which photo is showing; the photos, what was detected and the
	// user's corrections all live with the caller, which commits them on Done.
	let {
		shots,
		load,
		replacing = false,
		onChange,
		onDiscard,
		onBack,
		onDone
	}: {
		/** This run's photos, in capture order. */
		shots: { id: string; thumbUrl: string }[];
		/**
		 * The full-size photo and the quad to start from (a correction made earlier,
		 * else the detection). `null` if the photo could not be prepared.
		 */
		load: (id: string) => Promise<{
			image: HTMLCanvasElement;
			corners: CornerPoints | null;
			detected: boolean;
		} | null>;
		/** Retake mode: one photo replacing an existing page. */
		replacing?: boolean;
		/** Every corner change, so moving between photos keeps corrections. */
		onChange: (id: string, corners: CornerPoints) => void;
		onDiscard: (id: string) => void;
		/** Leave the first photo backwards: to the camera, or to shoot the retake again. */
		onBack: () => void;
		onDone: () => void;
	} = $props();

	let index = $state(0);
	/** `index` can outrun the list when photos are discarded. */
	const position = $derived(Math.min(index, shots.length - 1));
	/** A string, so a new `shots` array holding the same photo doesn't reload it. */
	const currentId = $derived(shots[position]?.id);
	const isLast = $derived(position === shots.length - 1);

	type View = {
		id: string;
		image: HTMLCanvasElement;
		corners: CornerPoints | null;
		detected: boolean;
	};
	let view = $state.raw<View | null>(null);
	let loadFailed = $state(false);
	let editorFailed = $state(false);
	let surface = $state<CornerEditorSurface>();
	let heading = $state<HTMLElement>();

	$effect(() => {
		const id = currentId;
		if (!id) return;

		let stale = false;
		view = null;
		loadFailed = false;
		editorFailed = false;

		// Untracked: whatever `load` reads must not make this effect re-run.
		untrack(() => load(id)).then(
			(result) => {
				if (stale) return releaseCanvas(result?.image);
				if (result) view = { id, ...result };
				else loadFailed = true;
			},
			() => {
				if (!stale) loadFailed = true;
			}
		);

		return () => {
			stale = true;
			const shown = untrack(() => view);
			// Released after the editor drawing it has been torn down.
			if (shown?.id === id) setTimeout(() => releaseCanvas(shown.image));
		};
	});

	// Moving on from the camera removes the button that had focus; put focus
	// where a screen reader announces where the user now is.
	$effect(() => {
		heading?.focus();
	});

	const hint = $derived.by(() => {
		if (loadFailed) return 'This photo could not be processed.';
		if (editorFailed) return 'The crop editor could not be loaded. The page will be kept as shot.';
		if (!view) return 'Finding the page…';
		return view.detected
			? 'Drag the corners to fit the page.'
			: 'No page edges found. Drag the corners to the page.';
	});

	function back() {
		if (position === 0) onBack();
		else index = position - 1;
	}

	function advance() {
		if (isLast) onDone();
		else index = position + 1;
	}

	function discard() {
		if (currentId) onDiscard(currentId);
	}
</script>

<div class="flex h-full flex-col">
	<header class="flex items-start justify-between gap-3 px-4 py-3 text-sm">
		<div bind:this={heading} tabindex="-1" class="outline-none">
			<p aria-live="polite" class="font-medium text-white">
				Page {position + 1} of {shots.length}
			</p>
			<p class="text-white/70">{hint}</p>
		</div>
		<button
			type="button"
			onclick={discard}
			aria-label="Discard page {position + 1}"
			title="Discard"
			class="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-red-600"
		>
			<TrashIcon size={18} />
		</button>
	</header>

	<div class="relative min-h-0 flex-1">
		{#if view && view.id === currentId}
			{@const shown = view}
			{#key shown}
				<CornerEditorSurface
					bind:this={surface}
					bind:failed={editorFailed}
					image={shown.image}
					corners={shown.corners}
					onChange={(corners) => onChange(shown.id, corners)}
					onConfirm={advance}
				/>
			{/key}
		{:else}
			<!-- The thumbnail stands in while the full photo loads, or if it can't. -->
			<img
				src={shots[position]?.thumbUrl}
				alt=""
				class="absolute inset-0 h-full w-full object-contain {loadFailed ? '' : 'opacity-40'}"
			/>
			{#if !loadFailed}
				<div class="absolute inset-0 flex items-center justify-center text-white/80">
					<CircleNotchIcon size={28} class="animate-spin" />
				</div>
			{/if}
		{/if}
	</div>

	<footer class="grid grid-cols-3 items-center px-6 py-5">
		<button
			type="button"
			onclick={back}
			aria-label={position > 0 ? 'Previous page' : replacing ? 'Retake' : 'Back to camera'}
			title={position > 0 ? 'Previous page' : replacing ? 'Retake' : 'Back to camera'}
			class="flex size-12 items-center justify-center justify-self-start rounded-full bg-white/10 transition hover:bg-white/20"
		>
			{#if position > 0}
				<ArrowLeftIcon size={22} />
			{:else if replacing}
				<ArrowCounterClockwiseIcon size={22} />
			{:else}
				<CameraIcon size={22} />
			{/if}
		</button>

		<button
			type="button"
			onclick={() => surface?.useWhole()}
			disabled={!view || editorFailed}
			aria-label="Use whole image"
			title="Use whole image"
			class="flex size-12 items-center justify-center justify-self-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-40"
		>
			<CornersOutIcon size={22} />
		</button>

		<button
			type="button"
			onclick={advance}
			aria-label={isLast ? 'Done' : 'Next page'}
			title={isLast ? 'Done' : 'Next page'}
			class="flex size-14 items-center justify-center justify-self-end rounded-full bg-white text-black transition hover:bg-white/90"
		>
			{#if isLast}
				<CheckIcon size={24} weight="bold" />
			{:else}
				<ArrowRightIcon size={24} weight="bold" />
			{/if}
		</button>
	</footer>
</div>
