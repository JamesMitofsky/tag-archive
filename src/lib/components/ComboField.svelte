<script lang="ts">
	import { Combobox, Portal, type ComboboxRootProps, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';

	// Searchable single-select that also accepts a typed-in custom value. Wraps
	// Skeleton's Combobox and mirrors the chosen/typed text into a hidden <input>
	// so the native form POST submits `name=<value>` like the old select/datalist.
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

	// Options are supplied once at mount; snapshot them for the collection/filter.
	// svelte-ignore state_referenced_locally
	const data = options.map((o) => ({ label: o, value: o }));
	let items = $state(data);
	// The resolved string the server reads — seeded from any echoed value.
	// svelte-ignore state_referenced_locally
	let selected = $state(initial);

	const collection = $derived(
		useListCollection({
			items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value
		})
	);

	const onOpenChange = () => (items = data);

	const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		// Every keystroke is a candidate value (supports custom, un-listed entries).
		selected = event.inputValue;
		const filtered = data.filter((item) =>
			item.label.toLowerCase().includes(event.inputValue.toLowerCase())
		);
		items = filtered.length > 0 ? filtered : data;
	};

	const onValueChange: ComboboxRootProps['onValueChange'] = (event) => {
		selected = event.value[0] ?? '';
	};
</script>

<Combobox
	{collection}
	{placeholder}
	{onOpenChange}
	{onInputValueChange}
	{onValueChange}
	defaultInputValue={initial}
	allowCustomValue
	openOnClick
>
	{#if label}
		<Combobox.Label class="label-text">{label}</Combobox.Label>
	{/if}
	<Combobox.Control class="relative mt-1.5">
		<Combobox.Input class="input pr-10" />
		<Combobox.Trigger
			class="text-surface-500 hover:text-surface-900-100 absolute inset-y-0 right-0 flex items-center px-3"
		>
			<CaretDownIcon size={16} />
		</Combobox.Trigger>
	</Combobox.Control>
	<Portal>
		<Combobox.Positioner>
			<Combobox.Content class="card z-50 max-h-60 overflow-y-auto bg-surface-50-950 p-1 shadow-xl">
				{#each items as item (item.value)}
					<Combobox.Item
						{item}
						class="flex items-center justify-between rounded px-2 py-1.5 hover:preset-tonal data-highlighted:preset-tonal"
					>
						<Combobox.ItemText>{item.label}</Combobox.ItemText>
						<Combobox.ItemIndicator />
					</Combobox.Item>
				{/each}
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>

<!-- Resolved value the server action reads. -->
<input type="hidden" {name} value={selected} />
