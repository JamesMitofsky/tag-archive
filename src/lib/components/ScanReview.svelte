<script lang="ts">
	import { untrack } from 'svelte';
	import { on } from 'svelte/events';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import CornersOutIcon from 'phosphor-svelte/lib/CornersOutIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CornerEditorSurface from './CornerEditorSurface.svelte';
	import type { CornerPoints } from '$lib/scanner/detect';
	import { releaseCanvas } from '$lib/scanner/image';

	// The crop step after a camera run: every photo just taken, one at a time,
	// with the page found on the still photo and the corners there to correct.
	// It owns only which photo is showing; the photos, what was detected and the
	// user's corrections all live with the caller, which commits them on finish.
	let {
		shots,
		load,
		replacingPage,
		onChange,
		onDiscard,
		onBack,
		onFinish,
		onCancel
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
		/** Retake mode: the 1-based page this run's one photo will replace. */
		replacingPage?: number;
		/** Every corner change, so moving between photos keeps corrections. */
		onChange: (id: string, corners: CornerPoints) => void;
		onDiscard: (id: string) => void;
		/** Leave the first photo backwards: to the camera, or to shoot the retake again. */
		onBack: () => void;
		/** Keep every photo with its crop as it stands: add them, or replace the page. */
		onFinish: () => void;
		/** Retake mode only: drop the new photo and keep the page as it was. */
		onCancel: () => void;
	} = $props();

	/**
	 * How long a button that has just changed meaning ignores taps. A double tap
	 * on the camera's check, or on Discard, would otherwise land a second time on
	 * whatever replaced it: Done, or Discard for the next photo.
	 */
	const SETTLE_MS = 400;

	let index = $state(0);
	/** `index` can outrun the list when photos are discarded. */
	const position = $derived(Math.min(index, shots.length - 1));
	/** A string, so a new `shots` array holding the same photo doesn't reload it. */
	const currentId = $derived(shots[position]?.id);
	const isLast = $derived(position === shots.length - 1);
	const replacing = $derived(replacingPage !== undefined);

	type View = {
		id: string;
		image: HTMLCanvasElement;
		corners: CornerPoints | null;
		detected: boolean;
	};
	let view = $state.raw<View | null>(null);
	let loadFailed = $state(false);
	let editorFailed = $state(false);
	const loading = $derived(!view && !loadFailed);
	/** Just opened from the camera: Next/Done hold off a moment. */
	let arriving = $state(true);
	/**
	 * Just moved to another photo: Discard, Done on the last photo, and Enter
	 * on a corner hold off a moment, so the second half of a double tap or a
	 * quick second Enter doesn't act on a photo that has only just appeared.
	 */
	let settling = $state(true);
	/** Set by Enter on a corner, so the next photo's corners take focus and Enter can chain. */
	let focusHandle = $state(false);

	let surface = $state<CornerEditorSurface>();
	let root = $state<HTMLElement>();
	let heading = $state<HTMLElement>();

	$effect(() => {
		const id = currentId;
		if (!id) return;

		let stale = false;
		view = null;
		loadFailed = false;
		editorFailed = false;
		settling = true;
		const settle = setTimeout(() => (settling = false), SETTLE_MS);

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
			clearTimeout(settle);
			const shown = untrack(() => view);
			// Released after the editor drawing it has been torn down.
			if (shown?.id === id) setTimeout(() => releaseCanvas(shown.image));
		};
	});

	$effect(() => {
		const timer = setTimeout(() => (arriving = false), SETTLE_MS);
		return () => clearTimeout(timer);
	});

	// Moving on from the camera removes the button that had focus; put focus
	// where a screen reader announces where the user now is.
	$effect(() => {
		heading?.focus();
	});

	const onCorner = (event: Event) =>
		event.target instanceof Element && !!event.target.closest('.scanic-handle');

	// Escape on a corner handle lets go of the corner, as it does in scanic's
	// own editor, instead of reaching the view, where it would finish the run.
	// A native listener: it has to stop the event before bits-ui's listener on
	// the document sees it.
	$effect(() => {
		if (!root) return;
		return on(root, 'keydown', (event) => {
			if (event.key !== 'Escape' || !onCorner(event)) return;
			event.stopPropagation();
			heading?.focus();
		});
	});

	// A held Enter repeats, and Enter on a corner moves on to the next photo,
	// whose corner then takes focus: one held key would confirm every photo in
	// turn. Repeats are dropped before scanic's own listener on the corner.
	$effect(() => {
		if (!root) return;
		return on(
			root,
			'keydown',
			(event) => {
				if (event.key !== 'Enter' || !event.repeat || !onCorner(event)) return;
				event.preventDefault();
				event.stopPropagation();
			},
			{ capture: true }
		);
	});

	const title = $derived(
		replacing ? `New photo for page ${replacingPage}` : `Photo ${position + 1} of ${shots.length}`
	);

	const hint = $derived.by(() => {
		if (loadFailed) {
			return replacing
				? 'This photo could not be processed. Take it again, or cancel.'
				: 'This photo could not be processed. Discard it, or keep it and retake it from the page list.';
		}
		if (editorFailed) {
			return view?.detected
				? 'The crop editor could not be loaded, so the page will be cropped to the edges found.'
				: 'The crop editor could not be loaded, so the page will be kept as shot.';
		}
		if (loading) return 'Finding the page…';
		return view?.detected
			? 'Drag the corners to fit the page.'
			: 'No page edges found. Drag the corners to the page.';
	});

	const finishLabel = $derived(
		replacing
			? `Replace page ${replacingPage}`
			: `Add ${shots.length} ${shots.length === 1 ? 'page' : 'pages'}`
	);

	/**
	 * Every way out of a photo moves focus to the heading first. Otherwise the
	 * focused corner or button disappears and the dialog's fallback focuses its
	 * first button, which is Discard: one more Enter would throw a photo away.
	 */
	function holdFocus() {
		heading?.focus();
	}

	function back() {
		holdFocus();
		if (position === 0) onBack();
		else index = position - 1;
	}

	/** Next/Done is held: the photo hasn't loaded, or a tap may be meant for what was there before. */
	const holding = $derived(arriving || loading || (isLast && settling));

	function advance(fromHandle = false) {
		if (holding || (fromHandle && settling)) return;
		holdFocus();
		focusHandle = fromHandle;
		if (isLast) onFinish();
		else index = position + 1;
	}

	function discard() {
		if (settling || !currentId) return;
		holdFocus();
		onDiscard(currentId);
	}

	function finish() {
		holdFocus();
		onFinish();
	}
</script>

<div bind:this={root} class="flex h-full flex-col">
	<header class="flex items-start justify-between gap-3 px-4 py-3 text-sm">
		<!-- One live region, so the detection result and any failure are read out
		     as well as which photo this is. -->
		<div
			bind:this={heading}
			tabindex="-1"
			aria-live="polite"
			aria-atomic="true"
			class="min-w-0 outline-none"
		>
			<p class="font-medium text-white">{title}</p>
			<p class={editorFailed || loadFailed ? 'text-red-400' : 'text-white/70'}>{hint}</p>
		</div>

		<div class="flex shrink-0 items-center gap-2">
			{#if replacing}
				<button
					type="button"
					onclick={onCancel}
					aria-label="Cancel retake"
					title="Cancel retake"
					class="flex size-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
				>
					<XIcon size={18} />
				</button>
			{:else}
				<button
					type="button"
					onclick={discard}
					aria-disabled={settling}
					aria-label="Discard photo {position + 1}"
					title="Discard"
					class="flex size-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-red-600"
				>
					<TrashIcon size={18} />
				</button>
				{#if shots.length > 1}
					<!-- Skips the rest of the photos with their crops as found. Kept in
					     the layout on the last photo, where Done says the same. -->
					<button
						type="button"
						onclick={finish}
						class="h-10 rounded-full bg-white/10 px-4 font-medium transition hover:bg-white/20 {isLast
							? 'invisible'
							: ''}"
					>
						Add all {shots.length}
					</button>
				{/if}
			{/if}
		</div>
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
					{focusHandle}
					onChange={(corners) => onChange(shown.id, corners)}
					onConfirm={() => advance(true)}
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
			aria-label={position > 0 ? 'Previous photo' : replacing ? 'Retake' : 'Back to camera'}
			title={position > 0 ? 'Previous photo' : replacing ? 'Retake' : 'Back to camera'}
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

		<!-- Held while the photo loads: the crop it would keep is one nobody has seen. -->
		<button
			type="button"
			onclick={() => advance()}
			aria-disabled={holding}
			aria-label={isLast ? finishLabel : 'Next photo'}
			title={isLast ? finishLabel : 'Next photo'}
			class="flex size-14 items-center justify-center justify-self-end rounded-full bg-white text-black transition hover:bg-white/90 aria-disabled:opacity-40"
		>
			{#if isLast}
				<CheckIcon size={24} weight="bold" />
			{:else}
				<ArrowRightIcon size={24} weight="bold" />
			{/if}
		</button>
	</footer>
</div>
