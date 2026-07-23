<script lang="ts">
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
	import PaperclipIcon from 'phosphor-svelte/lib/PaperclipIcon';
	import OptimizedImage from '$lib/components/OptimizedImage.svelte';
	import { isImageUrl } from '$lib/fileType';

	let {
		fileUrls,
		artefactName
	}: {
		fileUrls: string[];
		artefactName: string;
	} = $props();

	let loaded = $state(false);

	const firstUrl = $derived(fileUrls[0] ?? '');
	const isImage = $derived(isImageUrl(firstUrl));
	const fileName = $derived(firstUrl.split('/').pop() ?? 'Attached file');
</script>

{#if fileUrls.length > 0}
	<div
		class="relative my-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm bg-transparent"
	>
		{#if isImage}
			{#if !loaded}
				<Skeleton class="absolute inset-0 h-full w-full rounded-sm bg-gray-200" />
			{/if}
			<OptimizedImage
				src={firstUrl}
				alt={artefactName}
				sizes="(min-width: 768px) 33vw, 100vw"
				class="h-full w-full rounded-sm object-contain transition-opacity duration-300 {loaded
					? 'opacity-100'
					: 'opacity-0'}"
				onload={() => (loaded = true)}
				onerror={() => (loaded = true)}
			/>
			{#if fileUrls.length > 1}
				<span
					class="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[0.6rem] text-white shadow-xs backdrop-blur-xs"
				>
					+{fileUrls.length - 1} more
				</span>
			{/if}
		{:else}
			<div class="flex items-center gap-1.5 p-3 text-xs text-gray-600">
				<PaperclipIcon size={16} class="shrink-0" />
				<span class="truncate font-medium">{fileName}</span>
				{#if fileUrls.length > 1}
					<span class="ml-1 shrink-0 text-[0.65rem] text-gray-400">({fileUrls.length} files)</span>
				{/if}
			</div>
		{/if}
	</div>
{/if}
