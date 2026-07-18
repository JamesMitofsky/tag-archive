<script lang="ts">
	import CaretUpDownIcon from 'phosphor-svelte/lib/CaretUpDownIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	// Searchable single-select that also accepts a typed-in custom value. Wraps
	// shadcn-svelte's Command inside a Popover and mirrors the chosen/typed text into
	// a hidden <input> so the native form POST submits `name=<value>` like before.
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

	let open = $state(false);
	// The resolved string the server reads — seeded from any echoed value.
	// svelte-ignore state_referenced_locally
	let selected = $state(initial);
	// Live text in the Command search box; also the candidate custom value.
	let search = $state('');

	const query = $derived(search.trim());
	// Offer the typed text as a custom entry unless it already matches an option.
	const showCustom = $derived(
		query.length > 0 && !options.some((o) => o.toLowerCase() === query.toLowerCase())
	);

	function choose(value: string) {
		selected = value;
		open = false;
		search = '';
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if label}
		<span class="block text-sm font-medium text-gray-700">{label}</span>
	{/if}
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					class={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground')}
					{...props}
				>
					<span class="truncate">{selected || placeholder}</span>
					<CaretUpDownIcon class="ms-2 size-4 shrink-0 opacity-50" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
			<Command.Root>
				<Command.Input {placeholder} bind:value={search} />
				<Command.List>
					<Command.Empty>No results.</Command.Empty>
					<Command.Group>
						{#each options as option (option)}
							<Command.Item value={option} onSelect={() => choose(option)}>
								<CheckIcon
									class={cn('me-2 size-4', selected !== option && 'text-transparent')}
								/>
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
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>

<!-- Resolved value the server action reads. -->
<input type="hidden" {name} value={selected} />
