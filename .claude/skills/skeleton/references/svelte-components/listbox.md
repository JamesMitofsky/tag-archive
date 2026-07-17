# Listbox

Accessible listbox for single and multi selection.

```svelte
<script lang="ts">
	import { Listbox, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	const collection = useListCollection({
		items: data,
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});
</script>

<Listbox class="w-full max-w-md" {collection}>
	<Listbox.Label>Select a food</Listbox.Label>
	<Listbox.Content>
		{#each collection.items as item (item.value)}
			<Listbox.Item {item}>
				<Listbox.ItemText>{item.label}</Listbox.ItemText>
				<Listbox.ItemIndicator />
			</Listbox.Item>
		{/each}
	</Listbox.Content>
</Listbox>

```

## Groups

Organize items into categorized groups.

```svelte
<script lang="ts">
	import { Listbox, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple', type: 'Fruits' },
		{ label: 'Banana', value: 'banana', type: 'Fruits' },
		{ label: 'Orange', value: 'orange', type: 'Fruits' },
		{ label: 'Carrot', value: 'carrot', type: 'Vegetables' },
		{ label: 'Broccoli', value: 'broccoli', type: 'Vegetables' },
		{ label: 'Spinach', value: 'spinach', type: 'Vegetables' },
	];

	const collection = useListCollection({
		items: data,
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
		groupBy: (item) => item.type,
	});
</script>

<Listbox class="w-full max-w-md" {collection}>
	<Listbox.Content>
		{#each collection.group() as [type, items] (type)}
			<Listbox.ItemGroup>
				<Listbox.ItemGroupLabel>{type}</Listbox.ItemGroupLabel>
				{#each items as item (item.value)}
					<Listbox.Item {item}>
						<Listbox.ItemText>{item.label}</Listbox.ItemText>
						<Listbox.ItemIndicator />
					</Listbox.Item>
				{/each}
			</Listbox.ItemGroup>
		{/each}
	</Listbox.Content>
</Listbox>

```

## Multiple

Set the `multiple` proper to allow selecting more than one item.

```svelte
<script lang="ts">
	import { Listbox, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	const collection = useListCollection({
		items: data,
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});
</script>

<Listbox class="w-full max-w-md" {collection} selectionMode="multiple">
	<Listbox.Content>
		{#each collection.items as item (item.value)}
			<Listbox.Item {item}>
				<Listbox.ItemText>{item.label}</Listbox.ItemText>
				<Listbox.ItemIndicator />
			</Listbox.Item>
		{/each}
	</Listbox.Content>
</Listbox>

```

## Disabled

Set the `disabled` prop to enable the disabled state.

```svelte
<script lang="ts">
	import { Listbox, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	const collection = useListCollection({
		items: data,
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});
</script>

<Listbox class="w-full max-w-md" {collection} disabled={true}>
	<Listbox.Content>
		{#each collection.items as item (item.value)}
			<Listbox.Item {item}>
				<Listbox.ItemText>{item.label}</Listbox.ItemText>
				<Listbox.ItemIndicator />
			</Listbox.Item>
		{/each}
	</Listbox.Content>
</Listbox>

```

Which can also be enabled per item.

```svelte
<script lang="ts">
	import { Listbox, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	const collection = useListCollection({
		items: data,
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
		isItemDisabled: (item) => item.value === 'banana',
	});
</script>

<Listbox class="w-full max-w-md" {collection}>
	<Listbox.Content>
		{#each collection.items as item (item.value)}
			<Listbox.Item {item}>
				<Listbox.ItemText>{item.label}</Listbox.ItemText>
				<Listbox.ItemIndicator />
			</Listbox.Item>
		{/each}
	</Listbox.Content>
</Listbox>

```

## Search

Utilize the `Input` component to implement simple search.

```svelte
<script lang="ts">
	import { Listbox, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	let query = $state('');

	const collection = $derived(
		useListCollection({
			items: data.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	);
</script>

<Listbox class="w-full max-w-md" {collection}>
	<Listbox.Label>Search for Food</Listbox.Label>
	<Listbox.Input placeholder="Type to search..." value={query} oninput={(e) => (query = e.currentTarget.value)} />
	<Listbox.Content>
		{#each collection.items as item (item.value)}
			<Listbox.Item {item}>
				<Listbox.ItemText>{item.label}</Listbox.ItemText>
				<Listbox.ItemIndicator />
			</Listbox.Item>
		{/each}
	</Listbox.Content>
</Listbox>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Listbox, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	const collection = useListCollection({
		items: data,
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});
</script>

<Listbox class="w-full max-w-md" {collection} dir="rtl">
	<Listbox.Label>Select a food</Listbox.Label>
	<Listbox.Content>
		{#each collection.items as item (item.value)}
			<Listbox.Item {item}>
				<Listbox.ItemText>{item.label}</Listbox.ItemText>
				<Listbox.ItemIndicator />
			</Listbox.Item>
		{/each}
	</Listbox.Content>
</Listbox>

```

## Anatomy

Here's an overview of how the Listbox component is structured in code:

```svelte
<script lang="ts">
	import { Listbox } from '@skeletonlabs/skeleton-svelte';
</script>

<Listbox>
	<Listbox.Label />
	<Listbox.Content>
		<Listbox.Item>
			<Listbox.ItemText />
			<Listbox.ItemIndicator />
		</Listbox.Item>
	</Listbox.Content>
</Listbox>
```

## API Reference

### Root

| Prop                    | Description                                                                                                                                                                                                                                                                       | Type                                                                                                                                                                                                             | Default    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| orientation             | The orientation of the listbox.                                                                                                                                                                                                                                                   | "horizontal" \| "vertical" \| undefined                                                                                                                                                                          | "vertical" |
| collection              | The item collection                                                                                                                                                                                                                                                               | ListCollection\<any> \| GridCollection\<any>                                                                                                                                                                     | -          |
| ids                     | The ids of the elements in the listbox. Useful for composition.                                                                                                                                                                                                                   | Partial\<\{ root: string; content: string; label: string; item: (id: string \| number) => string; itemGroup: (id: string \| number) => string; itemGroupLabel: (id: string \| number) => string; }> \| undefined | -          |
| disabled                | Whether the listbox is disabled                                                                                                                                                                                                                                                   | boolean \| undefined                                                                                                                                                                                             | -          |
| disallowSelectAll       | Whether to disallow selecting all items when \`meta+a\` is pressed                                                                                                                                                                                                                | boolean \| undefined                                                                                                                                                                                             | -          |
| onHighlightChange       | The callback fired when the highlighted item changes.                                                                                                                                                                                                                             | ((details: HighlightChangeDetails\<any>) => void) \| undefined                                                                                                                                                   | -          |
| onValueChange           | The callback fired when the selected item changes.                                                                                                                                                                                                                                | ((details: ValueChangeDetails\<any>) => void) \| undefined                                                                                                                                                       | -          |
| value                   | The controlled keys of the selected items                                                                                                                                                                                                                                         | string\[] \| undefined                                                                                                                                                                                           | -          |
| defaultValue            | The initial default value of the listbox when rendered.&#xA;Use when you don't need to control the value of the listbox.                                                                                                                                                          | string\[] \| undefined                                                                                                                                                                                           | \[]        |
| highlightedValue        | The controlled key of the highlighted item                                                                                                                                                                                                                                        | string \| null \| undefined                                                                                                                                                                                      | -          |
| defaultHighlightedValue | The initial value of the highlighted item when opened.&#xA;Use when you don't need to control the highlighted value of the listbox.                                                                                                                                               | string \| null \| undefined                                                                                                                                                                                      | -          |
| loopFocus               | Whether to loop the keyboard navigation through the options                                                                                                                                                                                                                       | boolean \| undefined                                                                                                                                                                                             | false      |
| selectionMode           | How multiple selection should behave in the listbox.&#xA;&#xA;- \`single\`: The user can select a single item.&#xA;- \`multiple\`: The user can select multiple items without using modifier keys.&#xA;- \`extended\`: The user can select multiple items by using modifier keys. | SelectionMode \| undefined                                                                                                                                                                                       | "single"   |
| scrollToIndexFn         | Function to scroll to a specific index                                                                                                                                                                                                                                            | ((details: ScrollToIndexDetails) => void) \| undefined                                                                                                                                                           | -          |
| selectOnHighlight       | Whether to select the item when it is highlighted                                                                                                                                                                                                                                 | boolean \| undefined                                                                                                                                                                                             | -          |
| deselectable            | Whether to disallow empty selection                                                                                                                                                                                                                                               | boolean \| undefined                                                                                                                                                                                             | -          |
| typeahead               | Whether to enable typeahead on the listbox                                                                                                                                                                                                                                        | boolean \| undefined                                                                                                                                                                                             | -          |
| onSelect                | Function called when an item is selected                                                                                                                                                                                                                                          | ((details: SelectionDetails) => void) \| undefined                                                                                                                                                               | -          |
| dir                     | The document's text/writing direction.                                                                                                                                                                                                                                            | "ltr" \| "rtl" \| undefined                                                                                                                                                                                      | "ltr"      |
| getRootNode             | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                                                                                                                                                        | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                              | -          |
| element                 | Render the element yourself                                                                                                                                                                                                                                                       | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                                 | -          |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => ListboxApi\<PropTypes, any>                | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                           | Default |
| -------- | ----------- | ---------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => ListboxApi\<PropTypes, any>]> | -       |

### Label

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### Input

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

### Content

| Prop    | Description                 | Type                                            | Default |
| ------- | --------------------------- | ----------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"ul">]> \| undefined | -       |

### ItemGroup

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemGroupLabel

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Item

| Prop             | Description                            | Type                                            | Default |
| ---------------- | -------------------------------------- | ----------------------------------------------- | ------- |
| item             | The item to render                     | any                                             | -       |
| highlightOnHover | Whether to highlight the item on hover | boolean \| undefined                            | -       |
| element          | Render the element yourself            | Snippet\<\[HTMLAttributes\<"li">]> \| undefined | -       |

### ItemText

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### ItemIndicator

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

