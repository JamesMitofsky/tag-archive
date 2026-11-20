<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import CropIcon from 'phosphor-svelte/lib/CropIcon';
	import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import type { ScanPage } from '#lib/scanner/types.ts';

	// Ordered page list. Reordering is move-left/move-right rather than drag and
	// drop: no new dependency, identical behaviour on touch and desktop, and
	// keyboard/screen-reader accessible for free.
	//
	// Sized for a thumb: two tiles to a phone's width, and under each a two by
	// two block of controls, so every target is at least 44px tall and far wider
	// than a row of four icons would allow. Remove sits on the photo with a 44px
	// target of its own around a smaller visible button.
	let {
		pages,
		onMove,
		onRemove,
		onAdjust,
		onRotate,
		onRetry
	}: {
		pages: ScanPage[];
		onMove: (id: string, direction: -1 | 1) => void;
		onRemove: (id: string) => void;
		onAdjust: (id: string) => void;
		/** A further quarter turn clockwise, the way the icon's arrow runs. */
		onRotate: (id: string) => void;
		/** Try a failed page again. Offered only where the page has something to retry from. */
		onRetry?: (id: string) => void;
	} = $props();

	const control =
		'flex min-h-11 items-center justify-center gap-1.5 rounded-sm border border-gray-300 bg-white px-2 text-xs text-gray-700 transition hover:bg-gray-100 disabled:opacity-40';
</script>

{#if pages.length > 0}
	<div class="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
		{#each pages as page, index (page.id)}
			{@const canRetry = !!onRetry && (!!page.failedUpload || !!page.sourceBlob)}
			<div class="min-w-0 sm:w-40">
				<div
					class="relative overflow-hidden rounded-md border bg-white {page.status === 'error'
						? 'border-red-400 ring-1 ring-red-400'
						: 'border-gray-200'}"
				>
					<img
						src={page.previewUrl}
						alt="Page {index + 1}"
						class="h-40 w-full object-contain {page.status === 'done' ? '' : 'opacity-50'}"
					/>

					<span
						class="absolute top-1 left-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white"
					>
						{index + 1}
					</span>

					{#if page.status === 'uploading'}
						<!-- Two waits, named apart: cropping and encoding happen on the
						     phone and need no connection; only the second one does. -->
						<div
							class="absolute inset-0 flex flex-col items-center justify-center bg-black/30 text-white"
						>
							<CircleNotchIcon size={24} class="animate-spin" />
							<span class="mt-1 text-xs font-medium">
								{page.sending ? 'Uploading...' : 'Preparing...'}
							</span>
						</div>
					{/if}

					{#if page.status === 'error'}
						<div
							class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-700/85 p-2 text-center text-white"
						>
							<p class="flex items-start gap-1 text-xs leading-snug font-medium">
								<WarningIcon size={14} class="mt-px shrink-0" />
								<span class="line-clamp-3">{page.error || 'Failed'}</span>
							</p>
							{#if canRetry}
								<button
									type="button"
									onclick={() => onRetry?.(page.id)}
									aria-label="Retry page {index + 1}"
									class="flex min-h-11 items-center gap-1.5 rounded-sm bg-white px-4 text-sm font-medium text-red-800 transition hover:bg-red-50"
								>
									<ArrowCounterClockwiseIcon size={16} />
									Retry
								</button>
							{/if}
						</div>
					{/if}

					<button
						type="button"
						onclick={() => onRemove(page.id)}
						aria-label="Remove page {index + 1}"
						class="group absolute top-0 right-0 flex size-11 items-start justify-end p-1"
					>
						<span
							class="flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition group-hover:bg-red-600"
						>
							<TrashIcon size={14} />
						</span>
					</button>
				</div>

				<div class="mt-1 grid grid-cols-2 gap-1">
					<button
						type="button"
						onclick={() => onMove(page.id, -1)}
						disabled={index === 0}
						aria-label="Move page {index + 1} earlier"
						class={control}
					>
						<ArrowLeftIcon size={16} />
					</button>
					<button
						type="button"
						onclick={() => onMove(page.id, 1)}
						disabled={index === pages.length - 1}
						aria-label="Move page {index + 1} later"
						class={control}
					>
						<ArrowRightIcon size={16} />
					</button>

					{#if page.sourceBlob}
						<button
							type="button"
							onclick={() => onAdjust(page.id)}
							aria-label="Adjust crop of page {index + 1}"
							class={control}
						>
							<CropIcon size={16} />
							<span aria-hidden="true">Crop</span>
						</button>
					{/if}

					<!-- Needs pixels to turn: the original, or the upload to fetch one
					     from. A picked photo has neither until its first render lands. -->
					<button
						type="button"
						onclick={() => onRotate(page.id)}
						disabled={!page.sourceBlob && !page.url}
						aria-label="Rotate page {index + 1}"
						class="{control} {page.sourceBlob ? '' : 'col-span-2'}"
					>
						<ArrowClockwiseIcon size={16} />
						<span aria-hidden="true">Rotate</span>
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}
