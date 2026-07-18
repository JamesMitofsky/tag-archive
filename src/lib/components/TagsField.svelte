<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { Badge } from '$lib/components/ui/badge';

	// Lightweight tags input. shadcn-svelte has no tags-input primitive, so this is a
	// small custom control: chips (Badge) + a text field, mirrored into a hidden
	// <input> as a comma-joined string, which is exactly what the server action parses.
	let {
		name,
		label,
		placeholder = '',
		value = $bindable([])
	}: {
		name: string;
		label?: string;
		placeholder?: string;
		value?: string[];
	} = $props();

	let draft = $state('');

	function addTag(raw: string) {
		const tag = raw.trim();
		if (tag && !value.includes(tag)) value = [...value, tag];
		draft = '';
	}

	function removeTag(index: number) {
		value = value.filter((_, i) => i !== index);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			addTag(draft);
		} else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
			removeTag(value.length - 1);
		}
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if label}
		<span class="block text-sm font-medium text-gray-700">{label}</span>
	{/if}
	<div
		class="border-input focus-within:ring-ring/50 flex w-full flex-wrap items-center gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-within:ring-[3px]"
	>
		{#each value as tag, index (tag)}
			<Badge variant="secondary" class="gap-1">
				{tag}
				<button
					type="button"
					aria-label={`Remove ${tag}`}
					onclick={() => removeTag(index)}
					class="text-muted-foreground hover:text-foreground -me-0.5 flex items-center"
				>
					<XIcon class="size-3" />
				</button>
			</Badge>
		{/each}
		<input
			{placeholder}
			bind:value={draft}
			{onkeydown}
			class="text-foreground placeholder:text-muted-foreground grow bg-transparent outline-none"
		/>
	</div>
</div>

<!-- Comma-joined value the server action reads. -->
<input type="hidden" {name} value={value.join(',')} />
