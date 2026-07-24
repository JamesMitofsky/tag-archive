<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import * as Command from '$lib/components/ui/command';

	// Searchable single-select that also accepts a typed-in custom value. The search
	// box is visible from the start (no trigger to click); focusing it drops the option
	// menu. The live text doubles as the submitted value, mirrored into a hidden
	// <input> so the native form POST still sends `name=<value>` like before.
	// An option is either a bare value, or a value plus low-emphasis secondary text
	// (e.g. an event's date) shown after the searchable label for extra context.
	type Option = string | { value: string; secondary?: string };

	let {
		name,
		label,
		placeholder = 'Search or add…',
		options,
		value = $bindable('')
	}: {
		name: string;
		label?: string;
		placeholder?: string;
		options: Option[];
		value?: string;
	} = $props();

	// Normalise to objects so the template treats both shapes uniformly.
	const items = $derived(
		options.map((o) => (typeof o === 'string' ? { value: o, secondary: undefined } : o))
	);

	// The menu opens on focus and closes when focus leaves the whole field.
	let open = $state(false);
	// Live text in the search box — mirrored into the bindable `value` prop so the
	// parent can gate on it, and into the hidden <input> so the server reads it.
	const query = $derived(value.trim());
	// Offer the typed text as a custom entry unless it already matches an option.
	const showCustom = $derived(
		query.length > 0 && !items.some((o) => o.value.toLowerCase() === query.toLowerCase())
	);

	function choose(picked: string) {
		value = picked;
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
	<div class="relative" onfocusin={() => (open = true)} onfocusout={handleFocusOut}>
		<Command.Root
			class="overflow-visible rounded-none bg-transparent p-0"
			onkeydown={(e) => {
				if (e.key === 'Escape') open = false;
			}}
		>
			<Command.Input {placeholder} bind:value />
			{#if open}
				<Command.List
					class="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border bg-popover p-1 shadow-md"
				>
					<Command.Empty>No results.</Command.Empty>
					<Command.Group>
						{#each items as option (option.value)}
							<Command.Item value={option.value} onSelect={() => choose(option.value)}>
								<span>{option.value}</span>
								{#if option.secondary}
									<span class="ms-2 text-xs text-muted-foreground">{option.secondary}</span>
								{/if}
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
<input type="hidden" {name} {value} />
