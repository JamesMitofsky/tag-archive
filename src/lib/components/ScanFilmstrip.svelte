<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import CropIcon from 'phosphor-svelte/lib/CropIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import type { ScanPage } from '$lib/scanner/types';

	// Ordered page list. Reordering is move-earlier/move-later rather than drag
	// and drop: no new dependency, identical behavior on touch and desktop, and
	// keyboard/screen-reader accessible for free.
	let {
		pages,
		onMove,
		onRemove,
		onAdjust,
		onRotate
	}: {
		pages: ScanPage[];
		onMove: (id: string, direction: -1 | 1) => void;
		onRemove: (id: string) => void;
		onAdjust: (id: string) => void;
		/** A quarter turn counterclockwise. */
		onRotate: (id: string) => void;
	} = $props();

	/** Quarter turns the page has been given that its preview doesn't show yet. */
	const pendingTurns = (page: ScanPage) =>
		((((page.turns ?? 0) - (page.previewTurns ?? 0)) % 4) + 4) % 4;
</script>

{#if pages.length > 0}
	<!-- One column on phones, a wrapping row from `sm` up. Pinned to the
	     breakpoint rather than left to wrapping, so the move arrows below can
	     point the way the pages actually run. -->
	<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
		{#each pages as page, index (page.id)}
			<div class="w-40">
				<div
					class="relative overflow-hidden rounded-md border bg-white {page.status === 'error'
						? 'border-red-400 ring-1 ring-red-400'
						: 'border-gray-200'}"
				>
					<!-- Turned by whatever the preview is behind, so a tap shows at once;
					     the box is square, so the turned image still fits it. -->
					<img
						src={page.previewUrl}
						alt="Page {index + 1}"
						style:rotate={pendingTurns(page) ? `${-90 * pendingTurns(page)}deg` : undefined}
						class="h-40 w-full object-contain {page.status === 'uploading' ? 'opacity-50' : ''}"
					/>

					<span
						class="absolute top-1 left-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white"
					>
						{index + 1}
					</span>

					{#if page.status === 'uploading'}
						<div
							class="absolute inset-0 flex flex-col items-center justify-center bg-black/30 text-white"
						>
							<CircleNotchIcon size={24} class="animate-spin" />
							<span class="mt-1 text-[10px] font-medium">Uploading...</span>
						</div>
					{/if}

					{#if page.status === 'error'}
						<div
							class="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-red-600/90 px-1.5 py-1 text-[10px] font-medium text-white"
							title={page.error}
						>
							<WarningIcon size={12} class="shrink-0" />
							<span class="truncate">{page.error || 'Failed'}</span>
						</div>
					{/if}

					<button
						type="button"
						onclick={() => onRemove(page.id)}
						aria-label="Remove page {index + 1}"
						class="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-red-600"
					>
						<TrashIcon size={14} />
					</button>
				</div>

				<div class="mt-1 flex items-center gap-1">
					<button
						type="button"
						onclick={() => onMove(page.id, -1)}
						disabled={index === 0}
						aria-label="Move page {index + 1} earlier"
						class="rounded-sm border border-gray-300 bg-white p-2.5 text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
					>
						<ArrowUpIcon size={14} class="sm:hidden" />
						<ArrowLeftIcon size={14} class="hidden sm:block" />
					</button>
					<button
						type="button"
						onclick={() => onMove(page.id, 1)}
						disabled={index === pages.length - 1}
						aria-label="Move page {index + 1} later"
						class="rounded-sm border border-gray-300 bg-white p-2.5 text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
					>
						<ArrowDownIcon size={14} class="sm:hidden" />
						<ArrowRightIcon size={14} class="hidden sm:block" />
					</button>

					<!-- Both work from the page's original, which only pages scanned or
					     picked here have: an already saved page keeps its image as is. -->
					{#if page.sourceBlob}
						<button
							type="button"
							onclick={() => onAdjust(page.id)}
							aria-label="Adjust crop of page {index + 1}"
							title="Adjust crop"
							class="rounded-sm border border-gray-300 bg-white p-2.5 text-gray-700 transition hover:bg-gray-100"
						>
							<CropIcon size={14} />
						</button>
						<button
							type="button"
							onclick={() => onRotate(page.id)}
							aria-label="Rotate page {index + 1} left"
							title="Rotate left"
							class="rounded-sm border border-gray-300 bg-white p-2.5 text-gray-700 transition hover:bg-gray-100"
						>
							<ArrowCounterClockwiseIcon size={14} />
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
