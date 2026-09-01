<!--
	The one way to offer an artefact's scans as a single PDF. Points at the public
	compile endpoint, so it works on the search pages and in the keeper alike; the
	caller decides WHEN to show it (how many images warrant a download) and how it
	looks (`class`), this only fixes the destination and the accessible wording.
-->
<script lang="ts">
	import FilePdfIcon from 'phosphor-svelte/lib/FilePdfIcon';

	interface Props {
		artefactId: number;
		artefactName: string;
		/** Images that will become pages — drives the tooltip wording. */
		imageCount: number;
		/** Show a visible "PDF" caption beside the icon, for surfaces without other cues. */
		label?: boolean;
		class?: string;
	}

	let { artefactId, artefactName, imageCount, label = false, class: className }: Props = $props();

	const description = $derived(
		imageCount === 1 ? 'Download image as a PDF' : `Download all ${imageCount} images as one PDF`
	);
</script>

<a
	href="/api/artefacts/{artefactId}/pdf"
	download
	aria-label="Download {artefactName} as a PDF"
	title={description}
	class={className}
>
	<FilePdfIcon size={18} />
	{#if label}
		<span>PDF</span>
	{/if}
</a>
