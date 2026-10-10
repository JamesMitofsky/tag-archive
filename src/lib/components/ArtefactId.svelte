<script lang="ts">
	// An artefact's archive number — the same number a keeper writes on the
	// physical item, so record and object can always be matched up again.
	// Monospace + tabular digits so numbers line up in lists.
	let { id, class: className = '' }: { id: number; class?: string } = $props();
</script>

<span class="font-mono tabular-nums {className}">#{id}</span>
