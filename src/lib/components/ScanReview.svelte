<script lang="ts">
	import { untrack } from 'svelte';
	import { on } from 'svelte/events';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import CornersOutIcon from 'phosphor-svelte/lib/CornersOutIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeftIcon';
	import CornerEditorSurface from './CornerEditorSurface.svelte';
	import { cornerList, type CornerPoints } from '#lib/scanner/detect.ts';
	import { releaseCanvas } from '#lib/scanner/image.ts';
	import { describeRemaining } from '#lib/scanner/progress.ts';

	// The crop step after a camera run: every photo just taken, one at a time,
	// with the page found on the still photo and the corners there to correct.
	// It owns only which photo is showing; the photos, what was detected and the
	// user's corrections all live with the caller, which commits them on finish.
	let {
		shots,
		load,
		estimate,
		onChange,
		onDiscard,
		onDiscardAll,
		onBack,
		onFinish
	}: {
		/** This run's photos, in capture order. */
		shots: { id: string; thumbUrl: string }[];
		/**
		 * The full-size photo, the quad to start from (a correction made earlier,
		 * else the detection), and the page edges found in it, if any were. `null`
		 * if the photo could not be prepared.
		 */
		load: (id: string) => Promise<{
			image: HTMLCanvasElement;
			corners: CornerPoints | null;
			found: CornerPoints | null;
		} | null>;
		/**
		 * Milliseconds until `load` will have the photo, counted down while it is
		 * waited on. `null` while there is nothing to base a figure on yet.
		 */
		estimate?: (id: string) => number | null;
		/** Every corner change, so moving between photos keeps corrections. */
		onChange: (id: string, corners: CornerPoints) => void;
		onDiscard: (id: string) => void;
		/** Throw the whole run away. Asked for outright, and confirmed here first. */
		onDiscardAll?: () => void;
		/** Leave the first photo backwards, to the camera. */
		onBack: () => void;
		/** Keep every photo with its crop as it stands, and add them as pages. */
		onFinish: () => void;
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

	type View = {
		id: string;
		image: HTMLCanvasElement;
		corners: CornerPoints | null;
		found: CornerPoints | null;
	};
	let view = $state.raw<View | null>(null);
	/** The quad as it stands on the photo showing, to tell whether it has left the edges found. */
	let current = $state.raw<CornerPoints | null>(null);
	let loadFailed = $state(false);
	let editorFailed = $state(false);
	const loading = $derived(!view && !loadFailed);
	/**
	 * What is left of the wait for the photo showing, so a wait of several
	 * seconds reads as work under way with an end in sight, not as a stall.
	 */
	const remaining = $derived(loading && currentId && estimate ? estimate(currentId) : undefined);
	/** The longest this photo's wait has been put at: what the bar fills against. */
	let longest = $state(0);
	$effect(() => {
		if (typeof remaining === 'number' && remaining > untrack(() => longest)) longest = remaining;
	});
	const waitNote = $derived.by(() => {
		if (remaining === undefined) return '';
		// Detection itself is still loading: how long is the network's to say.
		if (remaining === null) return 'Getting ready to find pages…';
		return describeRemaining(remaining);
	});
	const waitDone = $derived(
		typeof remaining === 'number' && longest > 0 ? Math.min(1, 1 - remaining / longest) : null
	);
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
		current = null;
		longest = 0;
		loadFailed = false;
		editorFailed = false;
		settling = true;
		const settle = setTimeout(() => (settling = false), SETTLE_MS);

		// Untracked: whatever `load` reads must not make this effect re-run.
		untrack(() => load(id)).then(
			(result) => {
				if (stale) return releaseCanvas(result?.image);
				if (result) {
					view = { id, ...result };
					current = result.corners;
				} else loadFailed = true;
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

	const title = $derived(`Photo ${position + 1} of ${shots.length}`);

	const hint = $derived.by(() => {
		if (loadFailed) return 'This photo could not be processed. Discard it and take it again.';
		if (editorFailed) {
			return view?.found
				? 'The crop editor could not be loaded, so the page will be cropped to the edges found.'
				: 'The crop editor could not be loaded, so the page will be kept as shot.';
		}
		if (loading) return 'Finding the page…';
		return view?.found
			? 'Drag the corners to fit the page.'
			: 'No page edges found. Drag the corners to the page.';
	});

	const finishLabel = $derived(`Add ${shots.length} ${shots.length === 1 ? 'page' : 'pages'}`);

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

	function discardAll() {
		// The one step in the run that can't be taken back, so the one that asks.
		if (!confirm(`Discard all ${shots.length} photos?`)) return;
		holdFocus();
		onDiscardAll?.();
	}

	const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
		Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
	/**
	 * The quad has left the edges found on this photo: by a drag, or by Use whole
	 * image. The middle button then offers the way back to them, which is the
	 * step wanted after a drag that went wrong; until then it offers the whole
	 * image, the step wanted when the edges found are wrong to begin with.
	 */
	const strayed = $derived.by(() => {
		const found = view?.found;
		if (!found || !current) return false;
		const now = cornerList(current);
		return !cornerList(found).every((point, i) => samePoint(point, now[i]));
	});

	function resetCrop() {
		const found = view?.found;
		if (strayed && found) surface?.setCorners(found);
		else surface?.useWhole();
	}

	const resetLabel = $derived(strayed ? 'Reset to found edges' : 'Use whole image');

	// Labeled in words, not only by icon: a touch screen never shows a tooltip,
	// and two of these change meaning from one photo to the next.
	const action = 'flex flex-col items-center gap-1 text-[11px] leading-none text-white/80';
	const disc = 'flex size-12 items-center justify-center rounded-full bg-white/10 transition';
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

		{#if shots.length > 1}
			<!-- The two that act on the whole run, apart from the footer's, which
			     act on this photo. Add all skips the rest of the photos with their
			     crops as found; kept in the layout on the last photo, where Done
			     says the same. -->
			<div class="flex shrink-0 items-center gap-2">
				{#if onDiscardAll}
					<button
						type="button"
						onclick={discardAll}
						class="h-11 rounded-full px-3 text-white/70 underline underline-offset-2 transition hover:text-white"
					>
						Discard all
					</button>
				{/if}
				<button
					type="button"
					onclick={finish}
					class="h-11 rounded-full bg-white/10 px-4 font-medium transition hover:bg-white/20 {isLast
						? 'invisible'
						: ''}"
				>
					Add all {shots.length}
				</button>
			</div>
		{/if}
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
					onChange={(corners) => {
						current = corners;
						onChange(shown.id, corners);
					}}
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
				<!-- Hidden from screen readers: the heading already says the page is
				     being found, and a figure that changes every second would be read
				     out every second. -->
				<div
					aria-hidden="true"
					class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/80"
				>
					<CircleNotchIcon size={28} class="animate-spin" />
					{#if waitNote}
						<p data-testid="wait-note">{waitNote}</p>
					{/if}
					{#if waitDone !== null}
						<div class="h-1 w-40 overflow-hidden rounded-full bg-white/20">
							<div
								class="h-full rounded-full bg-white/80 transition-[width] duration-300 ease-linear"
								style:width="{Math.round(waitDone * 100)}%"
							></div>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Back, Discard, the crop reset, Next: Discard is kept a button away from
	     Next, the one tapped over and over, and within the thumb's reach. -->
	<footer class="grid grid-cols-4 items-start px-3 pt-3 pb-4">
		<button
			type="button"
			onclick={back}
			aria-label={position > 0 ? 'Previous photo' : 'Back to camera'}
			class="{action} group"
		>
			<span class="{disc} group-hover:bg-white/20">
				{#if position > 0}
					<ArrowLeftIcon size={22} />
				{:else}
					<CameraIcon size={22} />
				{/if}
			</span>
			<span aria-hidden="true">{position > 0 ? 'Previous' : 'Camera'}</span>
		</button>

		<button
			type="button"
			onclick={discard}
			aria-disabled={settling}
			aria-label="Discard photo {position + 1}"
			class="{action} group"
		>
			<span class="{disc} group-hover:bg-red-600">
				<TrashIcon size={22} />
			</span>
			<span aria-hidden="true">Discard</span>
		</button>

		<button
			type="button"
			onclick={resetCrop}
			disabled={!view || editorFailed}
			aria-label={resetLabel}
			class="{action} group disabled:opacity-40"
		>
			<span class="{disc} group-hover:bg-white/20">
				{#if strayed}
					<ArrowUUpLeftIcon size={22} />
				{:else}
					<CornersOutIcon size={22} />
				{/if}
			</span>
			<span aria-hidden="true">{strayed ? 'Reset' : 'Whole image'}</span>
		</button>

		<!-- Held while the photo loads: the crop it would keep is one nobody has seen. -->
		<button
			type="button"
			onclick={() => advance()}
			aria-disabled={holding}
			aria-label={isLast ? finishLabel : 'Next photo'}
			class="{action} group aria-disabled:opacity-40"
		>
			<span
				class="flex size-12 items-center justify-center rounded-full bg-white text-black transition group-hover:bg-white/90"
			>
				{#if loading}
					<!-- Held, and showing why: a dimmed arrow alone reads as a button
					     that has stopped answering. -->
					<CircleNotchIcon size={24} weight="bold" class="animate-spin" />
				{:else if isLast}
					<CheckIcon size={24} weight="bold" />
				{:else}
					<ArrowRightIcon size={24} weight="bold" />
				{/if}
			</span>
			<span aria-hidden="true" class="font-medium text-white">{isLast ? 'Add' : 'Next'}</span>
		</button>
	</footer>
</div>
