<!--
	Audio player for anything heard in order: an album's tracks, or the garden
	meditation's chapters. One <audio> element plays every track in turn; the
	list underneath doubles as the playlist. The page supplies the tracks and
	the words; this owns playback, resuming, the lock-screen controls and the
	keyboard. Mount it once per tracklist (key it on the album): the tracks are
	read when it mounts.

	The element's `src` is set imperatively (see `load`) rather than bound to the
	current index. iOS Safari only lets `play()` start audio synchronously inside
	the tap that asked for it, and a reactive `src` would not land until after the
	next flush — too late, so the tap would play the PREVIOUS track or nothing.
-->
<script module lang="ts">
	/** One track as the player reads it. */
	export type PlayerTrack = {
		/** Stable across edits to the list, so a saved place follows its track. */
		key: string | number;
		/** As printed: 1-based, in play order. */
		number: number;
		title: string;
		url: string;
		/**
		 * An instrument-only piece between spoken ones (the meditation's sound
		 * baths). Set in a lighter hand with a bird mark, so the spoken
		 * structure stays legible at a glance.
		 */
		interlude?: boolean;
		/** Seconds, when already known; anything missing is read from the file. */
		duration?: number | null;
	};
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import SkipBackIcon from 'phosphor-svelte/lib/SkipBackIcon';
	import SkipForwardIcon from 'phosphor-svelte/lib/SkipForwardIcon';
	import ClockCounterClockwiseIcon from 'phosphor-svelte/lib/ClockCounterClockwiseIcon';
	import ClockClockwiseIcon from 'phosphor-svelte/lib/ClockClockwiseIcon';
	import BirdIcon from 'phosphor-svelte/lib/BirdIcon';
	import { formatClock, formatTotal, totalDuration } from '#lib/albums/format.ts';

	let {
		title,
		artist = null,
		tracks: givenTracks,
		storageKey,
		unit = 'track',
		interludeLabel = 'Interlude'
	}: {
		/** What is playing as a whole: the album's title, the meditation's name. */
		title: string;
		/** Who it is by, beside the title and on the lock screen; none for the meditation. */
		artist?: string | null;
		tracks: PlayerTrack[];
		/** Where this tracklist's place is remembered, in this browser only. */
		storageKey: string;
		/** What one track is called: "Track 3 of 12", or "Chapter 3 of 21". */
		unit?: 'track' | 'chapter';
		/** What the bird mark on an interlude means, when hovered. */
		interludeLabel?: string;
	} = $props();

	// Read once, at mount (see the header comment).
	const tracks = untrack(() => givenTracks);

	const SKIP_SECONDS = 15;
	const unitName = $derived(unit === 'chapter' ? 'Chapter' : 'Track');
	const listName = $derived(unit === 'chapter' ? 'Chapters' : 'Tracks');

	let audio: HTMLAudioElement;

	let index = $state(0);
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);
	let loadError = $state(false);
	// Value under the thumb while the seek bar is being dragged. Held separately so
	// `timeupdate` does not yank the thumb back mid-drag.
	let scrub = $state<number | null>(null);
	// Per-track lengths for the list: those the archive already knows, the rest
	// probed from each file's metadata.
	let durations = $state<(number | null)[]>(tracks.map((t) => t.duration ?? null));
	// Restored position to apply once the restored track's metadata is in.
	let resumeAt: number | null = null;

	const track = $derived(tracks[index]);
	const shownTime = $derived(scrub ?? currentTime);
	const total = $derived(totalDuration(durations));

	/** Point the player at track `i`. `autoplay` must be called from a user
	 *  gesture (or from `ended`, once playback has already been unlocked). */
	function load(i: number, { autoplay = false, at = 0 } = {}) {
		index = i;
		loadError = false;
		resumeAt = at > 0 ? at : null;
		audio.src = tracks[i].url;
		if (autoplay) play();
		updateMediaSession();
		save();
	}

	function play() {
		// A rejected play() is either autoplay policy (nothing to do — the button
		// still reads "play") or a load failure, which `error` reports separately.
		audio.play().catch(() => {});
	}

	function toggle() {
		if (audio.paused) play();
		else audio.pause();
	}

	function seekTo(t: number) {
		if (!Number.isFinite(audio.duration)) return;
		audio.currentTime = Math.min(Math.max(0, t), audio.duration);
	}

	const skip = (delta: number) => seekTo(audio.currentTime + delta);

	function previous() {
		// Standard player behavior: a few seconds in, "previous" restarts the
		// track; only right at the start does it step back a track.
		if (audio.currentTime > 3 || index === 0) seekTo(0);
		else load(index - 1, { autoplay: !audio.paused });
	}

	function next() {
		if (index < tracks.length - 1) load(index + 1, { autoplay: !audio.paused });
	}

	function onEnded() {
		if (index < tracks.length - 1) load(index + 1, { autoplay: true });
	}

	function onLoadedMetadata() {
		// The file's own length beats a stored one: it is what the seek bar spans.
		if (Number.isFinite(audio.duration)) durations[index] = audio.duration;
		if (resumeAt != null) {
			seekTo(resumeAt);
			resumeAt = null;
		}
	}

	// --- Resume where the listener left off ------------------------------------

	let lastSaved = 0;

	function save() {
		try {
			localStorage.setItem(
				storageKey,
				// Until a restored position has been applied, the element still reads 0;
				// saving that would throw the listener's place away.
				JSON.stringify({
					index,
					key: tracks[index]?.key,
					time: resumeAt ?? audio?.currentTime ?? 0
				})
			);
		} catch {
			// Private mode / storage blocked: resuming is a convenience, not a need.
		}
	}

	/**
	 * The saved place, if it still names a track here. Found by the track's key
	 * first, so a place saved before tracks were added, removed or reordered
	 * still lands on the same track; by bare index only when no key was saved.
	 */
	function restore(): { index: number; time: number } | null {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return null;
			const saved = JSON.parse(raw);
			if (!Number.isFinite(saved?.time)) return null;
			if (saved.key !== undefined) {
				const found = tracks.findIndex((t) => t.key === saved.key);
				return found >= 0 ? { index: found, time: saved.time } : null;
			}
			if (Number.isInteger(saved.index) && saved.index >= 0 && saved.index < tracks.length) {
				return { index: saved.index, time: saved.time };
			}
		} catch {
			// Unreadable or corrupt: start from the beginning.
		}
		return null;
	}

	function onTimeUpdate() {
		const now = Date.now();
		if (now - lastSaved > 5000) {
			lastSaved = now;
			save();
		}
		updatePositionState();
	}

	// --- Lock screen / headphone controls --------------------------------------

	function updateMediaSession() {
		if (!('mediaSession' in navigator)) return;
		navigator.mediaSession.metadata = new MediaMetadata({
			title: tracks[index].title,
			artist: artist || title,
			// With an artist, the album is the title; without, the title already
			// stands in as the artist, so say where in it this is.
			album: artist ? title : `${unitName} ${tracks[index].number} of ${tracks.length}`
		});
	}

	function updatePositionState() {
		if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
		if (!Number.isFinite(audio.duration)) return;
		try {
			navigator.mediaSession.setPositionState({
				duration: audio.duration,
				position: Math.min(audio.currentTime, audio.duration),
				playbackRate: audio.playbackRate
			});
		} catch {
			// Throws on transiently inconsistent values mid-seek; the next tick fixes it.
		}
	}

	function registerMediaSession() {
		if (!('mediaSession' in navigator)) return;
		const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
			['play', play],
			['pause', () => audio.pause()],
			['previoustrack', previous],
			['nexttrack', next],
			['seekbackward', (d) => skip(-(d.seekOffset ?? SKIP_SECONDS))],
			['seekforward', (d) => skip(d.seekOffset ?? SKIP_SECONDS)],
			['seekto', (d) => d.seekTime != null && seekTo(d.seekTime)]
		];
		for (const [action, handler] of handlers) {
			try {
				navigator.mediaSession.setActionHandler(action, handler);
			} catch {
				// Older browsers reject actions they do not know; skip those.
			}
		}
		return () => {
			for (const [action] of handlers) {
				try {
					navigator.mediaSession.setActionHandler(action, null);
				} catch {
					// Same as above.
				}
			}
		};
	}

	// --- Track lengths for the list ---------------------------------------------

	/** Read each unknown track's duration from its metadata (a small range
	 *  request per file, not the whole file), a few at a time so playback is not
	 *  starved. */
	function probeDurations() {
		let cancelled = false;
		const probes: HTMLAudioElement[] = [];
		const queue = tracks.map((_, i) => i).filter((i) => durations[i] == null);

		const worker = async () => {
			for (let i = queue.shift(); i != null && !cancelled; i = queue.shift()) {
				if (durations[i] != null) continue;
				const probe = new Audio();
				probes.push(probe);
				probe.preload = 'metadata';
				await new Promise<void>((resolve) => {
					probe.onloadedmetadata = () => {
						if (!cancelled && Number.isFinite(probe.duration)) durations[i] = probe.duration;
						resolve();
					};
					probe.onerror = () => resolve();
					probe.src = tracks[i].url;
				});
				// Release the connection; an idle element can keep its socket open.
				probe.removeAttribute('src');
				probe.load();
			}
		};

		void Promise.all([worker(), worker(), worker()]);
		return () => {
			cancelled = true;
			for (const probe of probes) {
				probe.removeAttribute('src');
				probe.load();
			}
		};
	}

	// --- Keyboard ---------------------------------------------------------------

	function onKeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		// Buttons and the seek bar already handle Space and the arrows natively;
		// acting here too would fire twice.
		const target = e.target as HTMLElement;
		if (target.closest('button, input, textarea, select, a, [contenteditable]')) return;

		if (e.key === ' ' || e.key === 'k') toggle();
		else if (e.key === 'ArrowLeft' || e.key === 'j') skip(-SKIP_SECONDS);
		else if (e.key === 'ArrowRight' || e.key === 'l') skip(SKIP_SECONDS);
		else return;
		e.preventDefault();
	}

	onMount(() => {
		if (tracks.length === 0) return;
		const saved = restore();
		load(saved?.index ?? 0, { at: saved?.time ?? 0 });

		const unregister = registerMediaSession();
		const stopProbing = probeDurations();
		window.addEventListener('pagehide', save);

		return () => {
			save();
			audio.pause();
			unregister?.();
			stopProbing();
			window.removeEventListener('pagehide', save);
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<audio
	bind:this={audio}
	bind:currentTime
	bind:duration
	bind:paused
	preload="metadata"
	onloadedmetadata={onLoadedMetadata}
	ontimeupdate={onTimeUpdate}
	onended={onEnded}
	onpause={save}
	onerror={() => (loadError = true)}
></audio>

<!-- Marks the interludes. Callers place it: the list hangs it left of the
     title, the player sets it inline in the track line. -->
{#snippet bird(size: number, className: string)}
	<span role="img" aria-label={interludeLabel} title={interludeLabel} class={className}>
		<BirdIcon {size} weight="fill" aria-hidden="true" />
	</span>
{/snippet}

<div class="player flex flex-col gap-6">
	{#if track}
		<!-- Now playing. Scrolls with the page rather than pinning under the chrome. -->
		<section
			aria-label="Player"
			class="relative rounded-2xl bg-glass/95 px-6 pt-6 pb-5 text-gray-900 shadow-lg ring-1 ring-white/50 backdrop-blur-md"
		>
			<p class="font-friendly text-sm break-words text-gray-600">
				{title}{#if artist}<span class="text-gray-500">{` · ${artist}`}</span>{/if}
			</p>
			<!-- The bird rides the track line here rather than hanging left of the
			     title as it does in the list: the card's padding is too narrow to hang
			     it without jamming it against the edge, and inline before the title it
			     would knock the title out of line with the label above. -->
			<p
				class="mt-4 flex items-center gap-1.5 text-xs tracking-wide text-gray-600 uppercase tabular-nums"
			>
				{unitName}
				{track.number} of {tracks.length}
				{#if track.interlude}
					{@render bird(14, 'text-gray-600')}
				{/if}
			</p>
			<h2
				class="mt-1 text-2xl leading-tight font-medium break-words {track.interlude
					? 'italic'
					: ''}"
			>
				{track.title}
			</h2>

			{#if loadError}
				<p role="alert" class="mt-3 text-sm text-gray-700">
					This {unitName.toLowerCase()} could not be loaded. Check your connection, or try another.
				</p>
			{/if}

			<!-- Seek -->
			<div class="mt-6">
				<input
					type="range"
					aria-label="Seek"
					aria-valuetext="{formatClock(shownTime)} of {formatClock(duration)}"
					min="0"
					max={duration || 0}
					step="0.1"
					value={shownTime}
					disabled={!duration}
					oninput={(e) => (scrub = e.currentTarget.valueAsNumber)}
					onchange={(e) => {
						seekTo(e.currentTarget.valueAsNumber);
						scrub = null;
					}}
					style="--progress: {duration ? (shownTime / duration) * 100 : 0}%"
					class="seek w-full"
				/>
				<div class="mt-1 flex justify-between text-xs text-gray-600 tabular-nums">
					<span>{formatClock(shownTime)}</span>
					<span>-{formatClock(duration ? duration - shownTime : null)}</span>
				</div>
			</div>

			<!-- Transport -->
			<div class="mt-4 flex items-center justify-between">
				<button
					type="button"
					onclick={previous}
					aria-label="Previous {unitName.toLowerCase()}"
					class="control"
				>
					<SkipBackIcon size={22} weight="fill" />
				</button>
				<button
					type="button"
					onclick={() => skip(-SKIP_SECONDS)}
					aria-label="Back {SKIP_SECONDS} seconds"
					class="control"
				>
					<ClockCounterClockwiseIcon size={24} />
				</button>
				<button
					type="button"
					onclick={toggle}
					aria-label={paused ? 'Play' : 'Pause'}
					class="flex size-16 touch-manipulation items-center justify-center rounded-full bg-gray-900 text-white shadow-md transition-transform duration-100 active:scale-95"
				>
					{#if paused}
						<PlayIcon size={28} weight="fill" class="translate-x-px" />
					{:else}
						<PauseIcon size={28} weight="fill" />
					{/if}
				</button>
				<button
					type="button"
					onclick={() => skip(SKIP_SECONDS)}
					aria-label="Forward {SKIP_SECONDS} seconds"
					class="control"
				>
					<ClockClockwiseIcon size={24} />
				</button>
				<button
					type="button"
					onclick={next}
					disabled={index === tracks.length - 1}
					aria-label="Next {unitName.toLowerCase()}"
					class="control"
				>
					<SkipForwardIcon size={22} weight="fill" />
				</button>
			</div>
		</section>

		<!-- The tracklist -->
		<section
			aria-label={listName}
			class="rounded-2xl bg-white/30 py-3 text-gray-900 shadow-lg ring-1 ring-white/50 backdrop-blur-md"
		>
			<div class="flex items-baseline justify-between px-6 pt-1 pb-2">
				<h2 class="font-friendly text-sm text-gray-600">{listName}</h2>
				{#if total != null}
					<span class="text-xs text-gray-600 tabular-nums">{formatTotal(total)}</span>
				{/if}
			</div>
			<ol>
				{#each tracks as t, i (t.key)}
					{@const current = i === index}
					<li>
						<button
							type="button"
							onclick={() => load(i, { autoplay: true })}
							aria-current={current ? 'true' : undefined}
							class="flex w-full touch-manipulation items-center gap-3 px-6 py-2.5 text-left transition-colors hover:bg-white/30 {current
								? 'bg-white/40'
								: ''}"
						>
							<span class="w-7 shrink-0 text-xs text-gray-500 tabular-nums">
								{#if current && !paused}
									<!-- Live equalizer: bars bounce only while audio is actually
									     playing, since this branch renders only when not paused. -->
									<span aria-hidden="true" class="eq">
										<span></span><span></span><span></span><span></span>
									</span>
									<span class="sr-only">Now playing:</span>
								{:else}
									{t.number}
								{/if}
							</span>
							<!-- The bird hangs out of this column into the gap and the
							     number column's empty right side (numbers are left-aligned
							     in a w-7 sized to leave it room), so every title starts at
							     the same x with or without one. Positioning lives on the
							     outer span and truncation on the inner one: `truncate`
							     clips overflow, and the bird IS overflow. -->
							<span class="relative min-w-0 flex-1">
								{#if t.interlude}
									{@render bird(
										14,
										'absolute top-1/2 right-full mr-1.5 -translate-y-1/2 text-gray-500'
									)}
								{/if}
								<span
									class="block truncate {t.interlude ? 'text-gray-600 italic' : ''} {current
										? 'font-medium'
										: ''}"
								>
									{t.title}
								</span>
							</span>
							<span class="shrink-0 text-xs text-gray-500 tabular-nums">
								{durations[i] != null ? formatClock(durations[i]) : ''}
							</span>
						</button>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</div>

<style>
	/* Tailwind's gray-800 / gray-900, spelled out: theme variables are only emitted
	   when a utility uses them, and this scoped block is invisible to that scan. */
	.player {
		--ink: oklch(21% 0.034 264.665);
		--ink-soft: oklch(27.8% 0.033 256.848);
	}
	.control {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 9999px;
		color: var(--ink-soft);
		touch-action: manipulation;
		transition: background-color 100ms;
	}
	.control:hover:not(:disabled) {
		background-color: rgb(255 255 255 / 0.35);
	}
	.control:disabled {
		opacity: 0.35;
	}

	/* Now-playing equalizer. Bars animate `transform` rather than `height` so the
	   bounce stays on the compositor and costs no layout per frame. Each bar gets
	   its own period and phase; with a shared rhythm they would visibly march in
	   lockstep and read as a loading spinner rather than sound. */
	.eq {
		display: inline-flex;
		align-items: flex-end;
		gap: 2px;
		height: 12px;
		vertical-align: middle;
	}
	.eq span {
		width: 2px;
		height: 100%;
		border-radius: 1px;
		background: var(--ink-soft);
		transform-origin: bottom;
		animation: eq-bounce 900ms var(--ease-in-out-sine) infinite alternate;
	}
	.eq span:nth-child(1) {
		animation-duration: 820ms;
		animation-delay: -400ms;
	}
	.eq span:nth-child(2) {
		animation-duration: 1040ms;
		animation-delay: -150ms;
	}
	.eq span:nth-child(3) {
		animation-duration: 700ms;
		animation-delay: -560ms;
	}
	.eq span:nth-child(4) {
		animation-duration: 960ms;
		animation-delay: -820ms;
	}
	@keyframes eq-bounce {
		from {
			transform: scaleY(0.2);
		}
		to {
			transform: scaleY(1);
		}
	}
	/* Reduced motion: hold a still, uneven skyline so the row still reads as
	   "playing" without anything moving. */
	@media (prefers-reduced-motion: reduce) {
		.eq span {
			animation: none;
		}
		.eq span:nth-child(1) {
			transform: scaleY(0.5);
		}
		.eq span:nth-child(2) {
			transform: scaleY(0.9);
		}
		.eq span:nth-child(3) {
			transform: scaleY(0.35);
		}
		.eq span:nth-child(4) {
			transform: scaleY(0.7);
		}
	}

	/* Thin track with a filled portion up to the thumb. The fill rides a custom
	   property because WebKit has no ::-webkit-slider-runnable-track progress
	   pseudo-element (Firefox's ::-moz-range-progress covers itself). */
	.seek {
		appearance: none;
		height: 1.25rem; /* generous hit area around the thin visible track */
		background: transparent;
		cursor: pointer;
	}
	.seek:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.seek::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 9999px;
		background: linear-gradient(
			to right,
			var(--ink-soft) var(--progress),
			rgb(255 255 255 / 0.6) var(--progress)
		);
	}
	.seek::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		margin-top: -5px;
		border-radius: 9999px;
		background: var(--ink);
	}
	.seek::-moz-range-track {
		height: 4px;
		border-radius: 9999px;
		background: rgb(255 255 255 / 0.6);
	}
	.seek::-moz-range-progress {
		height: 4px;
		border-radius: 9999px;
		background: var(--ink-soft);
	}
	.seek::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border: 0;
		border-radius: 9999px;
		background: var(--ink);
	}
</style>
