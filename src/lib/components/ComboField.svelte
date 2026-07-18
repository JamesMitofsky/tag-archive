<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import * as Command from '$lib/components/ui/command';

	// Searchable single-select that also accepts a typed-in custom value. The search
	// box is visible from the start (no trigger to click); focusing it drops the option
	// menu. The live text doubles as the submitted value, mirrored into a hidden
	// <input> so the native form POST still sends `name=<value>` like before.
	let {
		name,
		label,
		placeholder = 'Search or add…',
		options,
		value: initial = ''
	}: {
		name: string;
		label?: string;
		placeholder?: string;
		options: string[];
		value?: string;
	} = $props();

	// The menu opens on focus and closes when focus leaves the whole field.
	let open = $state(false);
	// Live text in the search box — also the candidate custom value and the value the
	// server reads. Seeded from any echoed value left by a failed submit.
	// svelte-ignore state_referenced_locally
	let search = $state(initial);

	const query = $derived(search.trim());
	// Offer the typed text as a custom entry unless it already matches an option.
	const showCustom = $derived(
		query.length > 0 && !options.some((o) => o.toLowerCase() === query.toLowerCase())
	);

	function choose(value: string) {
		search = value;
		open = false;
	}

	// Close whenever focus leaves the field. Clicking an option keeps focus on the cmdk
	// input, so its own onSelect handles that case; any other blur (tab away, click a
	// non-focusable element, click elsewhere) drops the menu.
	function handleFocusOut(event: FocusEvent) {
		const next = event.relatedTarget;
		const container = event.currentTarget as HTMLElement;
		if (next instanceof Node && container.contains(next)) return;
		open = false;
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if label}
		<span class="block text-sm font-medium text-gray-700">{label}</span>
	{/if}
	<!-- The field owns the open state via focus: opening on focusin, closing when focus
	     leaves the container (relatedTarget outside). -->
	<div
		class="relative"
		onfocusin={() => (open = true)}
		onfocusout={handleFocusOut}
	>
		<Command.Root
			class="overflow-visible rounded-none bg-transparent p-0"
			onkeydown={(e) => {
				if (e.key === 'Escape') open = false;
			}}
		>
			<Command.Input {placeholder} bind:value={search} />
			{#if open}
				<Command.List
					class="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border bg-popover p-1 shadow-md"
				>
					<Command.Empty>No results.</Command.Empty>
					<Command.Group>
						{#each options as option (option)}
							<Command.Item value={option} onSelect={() => choose(option)}>
								{option}
							</Command.Item>
						{/each}
						{#if showCustom}
							<Command.Item value={query} onSelect={() => choose(query)}>
								<PlusIcon class="me-2 size-4" />
								Use “{query}”
							</Command.Item>
						{/if}
					</Command.Group>
				</Command.List>
			{/if}
		</Command.Root>
	</div>
</div>

<!-- Resolved value the server action reads. -->
<input type="hidden" {name} value={search} />
