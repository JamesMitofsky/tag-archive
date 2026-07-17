# Combobox

A combobox is an input widget with an associated popup that enables users to select a value from a collection of possible values.

```svelte
<script lang="ts">
	import { Combobox, Portal, type ComboboxRootProps, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	let items = $state(data);

	const collection = $derived(
		useListCollection({
			items: items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	);

	const onOpenChange = () => {
		items = data;
	};

	const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		const filtered = data.filter((item) => item.value.toLowerCase().includes(event.inputValue.toLowerCase()));
		if (filtered.length > 0) {
			items = filtered;
		} else {
			items = data;
		}
	};
</script>

<Combobox class="max-w-md" placeholder="Search..." {collection} {onOpenChange} {onInputValueChange}>
	<Combobox.Label>Label</Combobox.Label>
	<Combobox.Control>
		<Combobox.Input />
		<Combobox.Trigger />
	</Combobox.Control>
	<Combobox.ClearTrigger>Clear All</Combobox.ClearTrigger>
	<Portal>
		<Combobox.Positioner>
			<Combobox.Content>
				{#each items as item (item.value)}
					<Combobox.Item {item}>
						<Combobox.ItemText>{item.label}</Combobox.ItemText>
						<Combobox.ItemIndicator />
					</Combobox.Item>
				{/each}
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>

```

## Groups

Organize items into categorized groups.

```svelte
<script lang="ts">
	import { Combobox, Portal, type ComboboxRootProps, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple', type: 'Fruits' },
		{ label: 'Banana', value: 'banana', type: 'Fruits' },
		{ label: 'Orange', value: 'orange', type: 'Fruits' },
		{ label: 'Carrot', value: 'carrot', type: 'Vegetables' },
		{ label: 'Broccoli', value: 'broccoli', type: 'Vegetables' },
		{ label: 'Spinach', value: 'spinach', type: 'Vegetables' },
	];

	let items = $state(data);

	const collection = $derived(
		useListCollection({
			items: items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
			groupBy: (item) => item.type,
		}),
	);

	const onOpenChange = () => {
		items = data;
	};

	const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		const filtered = data.filter((item) => item.value.toLowerCase().includes(event.inputValue.toLowerCase()));
		if (filtered.length > 0) {
			items = filtered;
		} else {
			items = data;
		}
	};
</script>

<Combobox class="max-w-md" placeholder="Search..." {collection} {onOpenChange} {onInputValueChange}>
	<Combobox.Control>
		<Combobox.Input />
		<Combobox.Trigger />
	</Combobox.Control>
	<Portal>
		<Combobox.Positioner>
			<Combobox.Content>
				{#each collection.group() as [type, items] (type)}
					<Combobox.ItemGroup>
						<Combobox.ItemGroupLabel>{type}</Combobox.ItemGroupLabel>
						{#each items as item (item.value)}
							<Combobox.Item {item}>
								<Combobox.ItemText>{item.label}</Combobox.ItemText>
								<Combobox.ItemIndicator />
							</Combobox.Item>
						{/each}
					</Combobox.ItemGroup>
				{/each}
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>

```

## Auto Highlight

Search for any option, then tap `Enter` on your keyboard to automatically select it.

```svelte
<script lang="ts">
	import { Combobox, Portal, type ComboboxRootProps, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	let items = $state(data);

	const collection = $derived(
		useListCollection({
			items: items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	);

	const onOpenChange = () => {
		items = data;
	};

	const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		const filtered = data.filter((item) => item.value.toLowerCase().includes(event.inputValue.toLowerCase()));
		if (filtered.length > 0) {
			items = filtered;
		} else {
			items = data;
		}
	};
</script>

<Combobox class="max-w-md" placeholder="Search..." {collection} {onOpenChange} {onInputValueChange} inputBehavior="autohighlight">
	<Combobox.Control>
		<Combobox.Input />
		<Combobox.Trigger />
	</Combobox.Control>
	<Portal>
		<Combobox.Positioner>
			<Combobox.Content>
				{#each items as item (item.value)}
					<Combobox.Item {item}>
						<Combobox.ItemText>{item.label}</Combobox.ItemText>
						<Combobox.ItemIndicator />
					</Combobox.Item>
				{/each}
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>

```

## Multiple

To maintain filtering functionality and improve clarity for users, we recommend displaying each selected value outside the perimeter of the Combobox component.

```svelte
<script lang="ts">
	import { Combobox, Portal, type ComboboxRootProps, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	let value: string[] = $state([]);
	let items = $state(data);

	const collection = $derived(
		useListCollection({
			items: items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	);

	const onOpenChange = () => {
		items = data;
	};

	const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		const filtered = data.filter((item) => item.value.toLowerCase().includes(event.inputValue.toLowerCase()));
		if (filtered.length > 0) {
			items = filtered;
		} else {
			items = data;
		}
	};

	const onValueChange: ComboboxRootProps['onValueChange'] = (event) => {
		value = event.value;
	};
</script>

<div class="grid gap-2 w-full max-w-md">
	<Combobox placeholder="Search..." {collection} {onOpenChange} {onInputValueChange} {value} {onValueChange} multiple>
		<Combobox.Control>
			<Combobox.Input />
			<Combobox.Trigger />
		</Combobox.Control>
		<Portal>
			<Combobox.Positioner>
				<Combobox.Content>
					{#each items as item (item.value)}
						<Combobox.Item {item}>
							<Combobox.ItemText>{item.label}</Combobox.ItemText>
							<Combobox.ItemIndicator />
						</Combobox.Item>
					{/each}
				</Combobox.Content>
			</Combobox.Positioner>
		</Portal>
	</Combobox>
	<div class="flex flex-wrap gap-2">
		{#each value as item (item)}
			<span class="badge preset-filled">
				{item}
			</span>
		{/each}
	</div>
</div>

```

## Disabled Item

```svelte
<script lang="ts">
	import { Combobox, Portal, type ComboboxRootProps, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	let items = $state(data);

	const collection = $derived(
		useListCollection({
			items: items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
			isItemDisabled: (item) => item.value === 'banana',
		}),
	);

	const onOpenChange = () => {
		items = data;
	};

	const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		const filtered = data.filter((item) => item.value.toLowerCase().includes(event.inputValue.toLowerCase()));
		if (filtered.length > 0) {
			items = filtered;
		} else {
			items = data;
		}
	};
</script>

<Combobox class="max-w-md" placeholder="Search..." {collection} {onOpenChange} {onInputValueChange}>
	<Combobox.Control>
		<Combobox.Input />
		<Combobox.Trigger />
	</Combobox.Control>
	<Portal>
		<Combobox.Positioner>
			<Combobox.Content>
				{#each items as item (item.value)}
					<Combobox.Item {item}>
						<Combobox.ItemText>{item.label}</Combobox.ItemText>
						<Combobox.ItemIndicator />
					</Combobox.Item>
				{/each}
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>

```

## Custom Filter

Try mistyping `apple` or `banana` to see the custom filter using the fuzzy search from [Fuse.js](https://fusejs.io/) in action.

```svelte
<script lang="ts">
	import { Combobox, Portal, type ComboboxRootProps, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import Fuse from 'fuse.js';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	const fuse = new Fuse(data, {
		keys: ['label', 'value'],
		threshold: 0.3,
	});

	let items = $state(data);

	const collection = $derived(
		useListCollection({
			items: items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	);

	const onOpenChange = () => {
		items = data;
	};

	const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		const results = fuse.search(event.inputValue);
		if (results.length > 0) {
			items = results.map((result) => result.item);
		} else {
			items = data;
		}
	};
</script>

<Combobox class="max-w-md" placeholder="Search..." {collection} {onOpenChange} {onInputValueChange}>
	<Combobox.Control>
		<Combobox.Input />
		<Combobox.Trigger />
	</Combobox.Control>
	<Portal>
		<Combobox.Positioner>
			<Combobox.Content>
				{#each items as item (item.value)}
					<Combobox.Item {item}>
						<Combobox.ItemText>{item.label}</Combobox.ItemText>
						<Combobox.ItemIndicator />
					</Combobox.Item>
				{/each}
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Combobox, Portal, type ComboboxRootProps, useListCollection } from '@skeletonlabs/skeleton-svelte';

	const data = [
		{ label: 'Apple', value: 'apple' },
		{ label: 'Banana', value: 'banana' },
		{ label: 'Orange', value: 'orange' },
		{ label: 'Carrot', value: 'carrot' },
		{ label: 'Broccoli', value: 'broccoli' },
		{ label: 'Spinach', value: 'spinach' },
	];

	let items = $state(data);

	const collection = $derived(
		useListCollection({
			items: items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	);

	const onOpenChange = () => {
		items = data;
	};

	const onInputValueChange: ComboboxRootProps['onInputValueChange'] = (event) => {
		const filtered = data.filter((item) => item.value.toLowerCase().includes(event.inputValue.toLowerCase()));
		if (filtered.length > 0) {
			items = filtered;
		} else {
			items = data;
		}
	};
</script>

<Combobox class="max-w-md" placeholder="Search..." {collection} {onOpenChange} {onInputValueChange} dir="rtl">
	<Combobox.Label>Label</Combobox.Label>
	<Combobox.Control>
		<Combobox.Input />
		<Combobox.Trigger />
	</Combobox.Control>
	<Portal>
		<Combobox.Positioner>
			<Combobox.Content>
				{#each items as item (item.value)}
					<Combobox.Item {item}>
						<Combobox.ItemText>{item.label}</Combobox.ItemText>
						<Combobox.ItemIndicator />
					</Combobox.Item>
				{/each}
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>

```

## Guidelines

### Z-Index

By default we do not take an opinionated stance regarding z-index stacking. The result is the component can sometimes be occluded beneath other elements with a higher index. The Z-Index can controlled by applying a utility class to the Content component part.

```svelte
<Combobox.Content class="z-50" />
```

### Max Items

We recommend no more than 500 items max. For normal usage, a few dozen will provide the best performance.

## Anatomy

Here's an overview of how the Combobox component is structured in code:

```svelte
<script lang="ts">
	import { Combobox, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Combobox>
	<Combobox.Label />
	<Combobox.Control>
		<Combobox.Input />
		<Combobox.Trigger />
		<Combobox.ClearTrigger />
	</Combobox.Control>
	<Portal>
		<Combobox.Positioner>
			<Combobox.Content>
				<Combobox.ItemGroup>
					<Combobox.ItemGroupLabel />
					<Combobox.Item>
						<Combobox.ItemText />
						<Combobox.ItemIndicator />
					</Combobox.Item>
				</Combobox.ItemGroup>
			</Combobox.Content>
		</Combobox.Positioner>
	</Portal>
</Combobox>
```

## API Reference

### Root

| Prop                    | Description                                                                                                                                                                                                                                              | Type                                                                                                                                                                                                                                                                                                                           | Default                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| open                    | The controlled open state of the combobox                                                                                                                                                                                                                | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| defaultOpen             | The initial open state of the combobox when rendered.&#xA;Use when you don't need to control the open state of the combobox.                                                                                                                             | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| ids                     | The ids of the elements in the combobox. Useful for composition.                                                                                                                                                                                         | Partial\<\{ root: string; label: string; control: string; input: string; content: string; trigger: string; clearTrigger: string; item: (id: string, index?: number \| undefined) => string; positioner: string; itemGroup: (id: string \| number) => string; itemGroupLabel: (id: string \| number) => string; }> \| undefined | -                              |
| inputValue              | The controlled value of the combobox's input                                                                                                                                                                                                             | string \| undefined                                                                                                                                                                                                                                                                                                            | -                              |
| defaultInputValue       | The initial value of the combobox's input when rendered.&#xA;Use when you don't need to control the value of the combobox's input.                                                                                                                       | string \| undefined                                                                                                                                                                                                                                                                                                            | ""                             |
| name                    | The \`name\` attribute of the combobox's input. Useful for form submission                                                                                                                                                                               | string \| undefined                                                                                                                                                                                                                                                                                                            | -                              |
| form                    | The associate form of the combobox.                                                                                                                                                                                                                      | string \| undefined                                                                                                                                                                                                                                                                                                            | -                              |
| disabled                | Whether the combobox is disabled                                                                                                                                                                                                                         | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| readOnly                | Whether the combobox is readonly. This puts the combobox in a "non-editable" mode&#xA;but the user can still interact with it                                                                                                                            | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| invalid                 | Whether the combobox is invalid                                                                                                                                                                                                                          | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| required                | Whether the combobox is required                                                                                                                                                                                                                         | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| placeholder             | The placeholder text of the combobox's input                                                                                                                                                                                                             | string \| undefined                                                                                                                                                                                                                                                                                                            | -                              |
| defaultHighlightedValue | The initial highlighted value of the combobox when rendered.&#xA;Use when you don't need to control the highlighted value of the combobox.                                                                                                               | string \| null \| undefined                                                                                                                                                                                                                                                                                                    | -                              |
| highlightedValue        | The controlled highlighted value of the combobox                                                                                                                                                                                                         | string \| null \| undefined                                                                                                                                                                                                                                                                                                    | -                              |
| value                   | The controlled value of the combobox's selected items                                                                                                                                                                                                    | string\[] \| undefined                                                                                                                                                                                                                                                                                                         | -                              |
| defaultValue            | The initial value of the combobox's selected items when rendered.&#xA;Use when you don't need to control the value of the combobox's selected items.                                                                                                     | string\[] \| undefined                                                                                                                                                                                                                                                                                                         | \[]                            |
| inputBehavior           | Defines the auto-completion behavior of the combobox.&#xA;&#xA;- \`autohighlight\`: The first focused item is highlighted as the user types&#xA;- \`autocomplete\`: Navigating the listbox with the arrow keys selects the item and the input is updated | "autohighlight" \| "autocomplete" \| "none" \| undefined                                                                                                                                                                                                                                                                       | "none"                         |
| selectionBehavior       | The behavior of the combobox input when an item is selected&#xA;&#xA;- \`replace\`: The selected item string is set as the input value&#xA;- \`clear\`: The input value is cleared&#xA;- \`preserve\`: The input value is preserved                      | "clear" \| "replace" \| "preserve" \| undefined                                                                                                                                                                                                                                                                                | "replace"                      |
| autoFocus               | Whether to autofocus the input on mount                                                                                                                                                                                                                  | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| openOnClick             | Whether to open the combobox popup on initial click on the input                                                                                                                                                                                         | boolean \| undefined                                                                                                                                                                                                                                                                                                           | false                          |
| openOnChange            | Whether to show the combobox when the input value changes                                                                                                                                                                                                | boolean \| ((details: InputValueChangeDetails) => boolean) \| undefined                                                                                                                                                                                                                                                        | true                           |
| allowCustomValue        | Whether to allow typing custom values in the input                                                                                                                                                                                                       | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| alwaysSubmitOnEnter     | Whether to always submit on Enter key press, even if popup is open.&#xA;Useful for single-field autocomplete forms where Enter should submit the form.                                                                                                   | boolean \| undefined                                                                                                                                                                                                                                                                                                           | false                          |
| loopFocus               | Whether to loop the keyboard navigation through the items                                                                                                                                                                                                | boolean \| undefined                                                                                                                                                                                                                                                                                                           | true                           |
| positioning             | The positioning options to dynamically position the menu                                                                                                                                                                                                 | PositioningOptions \| undefined                                                                                                                                                                                                                                                                                                | \{ placement: "bottom-start" } |
| onInputValueChange      | Function called when the input's value changes                                                                                                                                                                                                           | ((details: InputValueChangeDetails) => void) \| undefined                                                                                                                                                                                                                                                                      | -                              |
| onValueChange           | Function called when a new item is selected                                                                                                                                                                                                              | ((details: ValueChangeDetails\<any>) => void) \| undefined                                                                                                                                                                                                                                                                     | -                              |
| onHighlightChange       | Function called when an item is highlighted using the pointer&#xA;or keyboard navigation.                                                                                                                                                                | ((details: HighlightChangeDetails\<any>) => void) \| undefined                                                                                                                                                                                                                                                                 | -                              |
| onSelect                | Function called when an item is selected                                                                                                                                                                                                                 | ((details: SelectionDetails) => void) \| undefined                                                                                                                                                                                                                                                                             | -                              |
| onOpenChange            | Function called when the popup is opened                                                                                                                                                                                                                 | ((details: OpenChangeDetails) => void) \| undefined                                                                                                                                                                                                                                                                            | -                              |
| translations            | Specifies the localized strings that identifies the accessibility elements and their states                                                                                                                                                              | IntlTranslations \| undefined                                                                                                                                                                                                                                                                                                  | -                              |
| collection              | The collection of items                                                                                                                                                                                                                                  | ListCollection\<any> \| undefined                                                                                                                                                                                                                                                                                              | -                              |
| multiple                | Whether to allow multiple selection.&#xA;&#xA;\*\*Good to know:\*\* When \`multiple\` is \`true\`, the \`selectionBehavior\` is automatically set to \`clear\`.&#xA;It is recommended to render the selected items in a separate container.              | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| closeOnSelect           | Whether to close the combobox when an item is selected.                                                                                                                                                                                                  | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| openOnKeyPress          | Whether to open the combobox on arrow key press                                                                                                                                                                                                          | boolean \| undefined                                                                                                                                                                                                                                                                                                           | true                           |
| scrollToIndexFn         | Function to scroll to a specific index                                                                                                                                                                                                                   | ((details: ScrollToIndexDetails) => void) \| undefined                                                                                                                                                                                                                                                                         | -                              |
| composite               | Whether the combobox is a composed with other composite widgets like tabs                                                                                                                                                                                | boolean \| undefined                                                                                                                                                                                                                                                                                                           | true                           |
| disableLayer            | Whether to disable registering this a dismissable layer                                                                                                                                                                                                  | boolean \| undefined                                                                                                                                                                                                                                                                                                           | -                              |
| navigate                | Function to navigate to the selected item                                                                                                                                                                                                                | ((details: NavigateDetails) => void) \| null \| undefined                                                                                                                                                                                                                                                                      | -                              |
| dir                     | The document's text/writing direction.                                                                                                                                                                                                                   | "ltr" \| "rtl" \| undefined                                                                                                                                                                                                                                                                                                    | "ltr"                          |
| getRootNode             | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                                                                                                                               | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                                                                                                                                            | -                              |
| onPointerDownOutside    | Function called when the pointer is pressed down outside the component                                                                                                                                                                                   | ((event: PointerDownOutsideEvent) => void) \| undefined                                                                                                                                                                                                                                                                        | -                              |
| onFocusOutside          | Function called when the focus is moved outside the component                                                                                                                                                                                            | ((event: FocusOutsideEvent) => void) \| undefined                                                                                                                                                                                                                                                                              | -                              |
| onInteractOutside       | Function called when an interaction happens outside the component                                                                                                                                                                                        | ((event: InteractOutsideEvent) => void) \| undefined                                                                                                                                                                                                                                                                           | -                              |
| element                 | Render the element yourself                                                                                                                                                                                                                              | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                                                                                                                                               | -                              |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => ComboboxApi\<PropTypes, any>               | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                            | Default |
| -------- | ----------- | ----------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => ComboboxApi\<PropTypes, any>]> | -       |

### Label

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### Control

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Input

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

### Trigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### ClearTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Positioner

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

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

| Prop         | Description                                                 | Type                                            | Default |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------- | ------- |
| persistFocus | Whether hovering outside should clear the highlighted state | boolean \| undefined                            | -       |
| item         | The item to render                                          | any                                             | -       |
| element      | Render the element yourself                                 | Snippet\<\[HTMLAttributes\<"li">]> \| undefined | -       |

### ItemText

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### ItemIndicator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

