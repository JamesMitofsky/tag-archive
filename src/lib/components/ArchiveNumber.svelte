<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArtefactId from '#lib/components/ArtefactId.svelte';

	// The number to copy onto a just-added physical item, shown wherever an
	// artefact has just been created: a keeper's new artefact page and the
	// public's screen after submitting. Dashed like a tag, number oversized so it
	// reads from arm's length while writing. `children` says what to do with it.
	let {
		id,
		children,
		class: className = ''
	}: { id: number; children: Snippet; class?: string } = $props();
</script>

<div role="status" class="rounded-sm border border-dashed border-gray-400 p-4 {className}">
	{@render children()}
	<ArtefactId {id} class="mt-3 block text-4xl font-semibold text-[#14120f]" />
</div>
