# Menu

Accessible dropdown and context menus for actions and navigation.

```svelte
<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Menu>
	<Menu.Trigger class="btn preset-filled">Open Menu</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content>
				<Menu.Item value="new">
					<Menu.ItemText>New File</Menu.ItemText>
				</Menu.Item>
				<Menu.Item value="open">
					<Menu.ItemText>Open File</Menu.ItemText>
				</Menu.Item>
				<Menu.Separator />
				<Menu.Item value="save">
					<Menu.ItemText>Save</Menu.ItemText>
				</Menu.Item>
				<Menu.Item value="export">
					<Menu.ItemText>Export</Menu.ItemText>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>

```

## Grouped Items

Use `ItemGroup` and `ItemGroupLabel` to organize menu items into logical sections.

```svelte
<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Menu>
	<Menu.Trigger class="btn preset-filled">View Options</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content>
				<Menu.ItemGroup>
					<Menu.ItemGroupLabel>View</Menu.ItemGroupLabel>
					<Menu.Item value="split">
						<Menu.ItemText>Split View</Menu.ItemText>
					</Menu.Item>
					<Menu.Item value="fullscreen">
						<Menu.ItemText>Fullscreen</Menu.ItemText>
					</Menu.Item>
				</Menu.ItemGroup>
				<Menu.Separator />
				<Menu.ItemGroup>
					<Menu.ItemGroupLabel>Appearance</Menu.ItemGroupLabel>
					<Menu.Item value="theme">
						<Menu.ItemText>Change Theme</Menu.ItemText>
					</Menu.Item>
					<Menu.Item value="zoom">
						<Menu.ItemText>Zoom</Menu.ItemText>
					</Menu.Item>
				</Menu.ItemGroup>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>

```

## Context Menu

Use `ContextTrigger` instead of `Trigger` to open the menu on right-click.

```svelte
<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Menu>
	<Menu.ContextTrigger class="card border border-dashed border-surface-200-800 p-8">Right-click here</Menu.ContextTrigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content>
				<Menu.Item value="cut">
					<Menu.ItemText>Cut</Menu.ItemText>
				</Menu.Item>
				<Menu.Item value="copy">
					<Menu.ItemText>Copy</Menu.ItemText>
				</Menu.Item>
				<Menu.Item value="paste">
					<Menu.ItemText>Paste</Menu.ItemText>
				</Menu.Item>
				<Menu.Separator />
				<Menu.Item value="delete">
					<Menu.ItemText>Delete</Menu.ItemText>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>

```

## Nested Menu

Use the `TriggerItem` component to create nested menus within a parent menu.

```svelte
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Menu>
	<Menu.Trigger class="btn preset-filled">Open Menu</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content>
				<Menu>
					<Menu.TriggerItem value="new">
						<Menu.ItemText>New</Menu.ItemText>
						<Menu.ItemIndicator>
							<ChevronRightIcon class="size-4" />
						</Menu.ItemIndicator>
					</Menu.TriggerItem>
					<Portal>
						<Menu.Positioner>
							<Menu.Content>
								<Menu.Item value="project">
									<Menu.ItemText>New Project</Menu.ItemText>
								</Menu.Item>
								<Menu.Item value="file">
									<Menu.ItemText>New File</Menu.ItemText>
								</Menu.Item>
								<Menu.Item value="folder">
									<Menu.ItemText>New Folder</Menu.ItemText>
								</Menu.Item>
							</Menu.Content>
						</Menu.Positioner>
					</Portal>
				</Menu>
				<Menu.Item value="open">
					<Menu.ItemText>Open File</Menu.ItemText>
				</Menu.Item>
				<Menu.Separator />
				<Menu.Item value="save">
					<Menu.ItemText>Save</Menu.ItemText>
				</Menu.Item>
				<Menu.Item value="export">
					<Menu.ItemText>Export</Menu.ItemText>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>

```

## Option Items

Use `OptionItem` to create menu items that can be toggled on or off with checkbox or radio group like behavior.

```svelte
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';

	const sortOptions = [
		{ value: 'newest', label: 'Newest' },
		{ value: 'popular', label: 'Most Popular' },
		{ value: 'rating', label: 'Highest Rated' },
	];

	const filterOptions = [
		{ value: 'free-shipping', label: 'Free Shipping' },
		{ value: 'in-stock', label: 'In Stock' },
		{ value: 'on-sale', label: 'On Sale' },
	];

	let sort = $state('newest');
	let filters = $state<string[]>(['free-shipping', 'in-stock']);
</script>

<Menu closeOnSelect={false}>
	<Menu.Trigger class="btn preset-filled">Open Menu</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content>
				{#each sortOptions as item (item)}
					<Menu.OptionItem
						type="radio"
						checked={sort === item.value}
						onCheckedChange={(checked) => (sort = checked ? item.value : '')}
						value={item.value}
					>
						<Menu.ItemText>{item.label}</Menu.ItemText>
						<Menu.ItemIndicator class="hidden data-[state=checked]:block">
							<CheckIcon class="size-4" />
						</Menu.ItemIndicator>
					</Menu.OptionItem>
				{/each}
				<Menu.Separator />
				{#each filterOptions as item (item)}
					<Menu.OptionItem
						type="checkbox"
						checked={filters.includes(item.value)}
						onCheckedChange={(checked) => (filters = checked ? [...filters, item.value] : filters.filter((x) => x !== item.value))}
						value={item.value}
					>
						<Menu.ItemText>{item.label}</Menu.ItemText>
						<Menu.ItemIndicator class="hidden data-[state=checked]:block">
							<CheckIcon class="size-4" />
						</Menu.ItemIndicator>
					</Menu.OptionItem>
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>

```

## Disabled Item

Set the disabled prop to enable the disabled state.

```tsx
<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Menu>
	<Menu.Trigger class="btn preset-filled">Open Menu</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content>
				<Menu.Item value="new">
					<Menu.ItemText>New File</Menu.ItemText>
				</Menu.Item>
				<Menu.Item value="open">
					<Menu.ItemText>Open File</Menu.ItemText>
				</Menu.Item>
				<Menu.Separator />
				<Menu.Item value="save">
					<Menu.ItemText>Save</Menu.ItemText>
				</Menu.Item>
				<Menu.Item value="disabled" disabled={true}>
					<Menu.ItemText>Disabled</Menu.ItemText>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>

```

## Anatomy

Here's an overview of how the Menu component is structured in code:

```svelte
<script lang="ts">
	import { Menu } from '@skeletonlabs/skeleton-svelte';
</script>

<Menu>
	<Menu.Trigger>
		<Menu.Indicator />
	</Menu.Trigger>
	<Menu.ContextTrigger>
		<Menu.Indicator />
	</Menu.ContextTrigger>
	<Menu.Positioner>
		<Menu.Content>
			<Menu.ItemGroup>
				<Menu.ItemGroupLabel />
				<Menu.Item>
					<Menu.ItemIndicator />
					<Menu.ItemText />
				</Menu.Item>
				<Menu.OptionItem>
					<Menu.ItemIndicator />
					<Menu.ItemText />
				</Menu.OptionItem>
				<Menu.TriggerItem>
					<Menu.ItemIndicator />
					<Menu.ItemText />
				</Menu.TriggerItem>
			</Menu.ItemGroup>
			<Menu.Separator />
			<Menu.Arrow>
				<Menu.ArrowTip />
			</Menu.Arrow>
		</Menu.Content>
	</Menu.Positioner>
</Menu>
```

## API Reference

### Root

| Prop                    | Description                                                                                                                                  | Type                                                                                                                                                                                                                                                                                  | Default |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| ids                     | The ids of the elements in the menu. Useful for composition.                                                                                 | Partial\<\{ trigger: string \| ((value?: string \| undefined) => string); contextTrigger: string \| ((value?: string \| undefined) => string); content: string; groupLabel: (id: string) => string; group: (id: string) => string; positioner: string; arrow: string; }> \| undefined | -       |
| defaultHighlightedValue | The initial highlighted value of the menu item when rendered.&#xA;Use when you don't need to control the highlighted value of the menu item. | string \| null \| undefined                                                                                                                                                                                                                                                           | -       |
| highlightedValue        | The controlled highlighted value of the menu item.                                                                                           | string \| null \| undefined                                                                                                                                                                                                                                                           | -       |
| onHighlightChange       | Function called when the highlighted menu item changes.                                                                                      | ((details: HighlightChangeDetails) => void) \| undefined                                                                                                                                                                                                                              | -       |
| onSelect                | Function called when a menu item is selected.                                                                                                | ((details: SelectionDetails) => void) \| undefined                                                                                                                                                                                                                                    | -       |
| anchorPoint             | The positioning point for the menu. Can be set by the context menu trigger or the button trigger.                                            | Point \| null \| undefined                                                                                                                                                                                                                                                            | -       |
| loopFocus               | Whether to loop the keyboard navigation.                                                                                                     | boolean \| undefined                                                                                                                                                                                                                                                                  | false   |
| positioning             | The options used to dynamically position the menu                                                                                            | PositioningOptions \| undefined                                                                                                                                                                                                                                                       | -       |
| closeOnSelect           | Whether to close the menu when an option is selected                                                                                         | boolean \| undefined                                                                                                                                                                                                                                                                  | true    |
| aria-label              | The accessibility label for the menu                                                                                                         | string \| undefined                                                                                                                                                                                                                                                                   | -       |
| open                    | The controlled open state of the menu                                                                                                        | boolean \| undefined                                                                                                                                                                                                                                                                  | -       |
| onOpenChange            | Function called when the menu opens or closes                                                                                                | ((details: OpenChangeDetails) => void) \| undefined                                                                                                                                                                                                                                   | -       |
| defaultOpen             | The initial open state of the menu when rendered.&#xA;Use when you don't need to control the open state of the menu.                         | boolean \| undefined                                                                                                                                                                                                                                                                  | -       |
| typeahead               | Whether the pressing printable characters should trigger typeahead navigation                                                                | boolean \| undefined                                                                                                                                                                                                                                                                  | true    |
| composite               | Whether the menu is a composed with other composite widgets like a combobox or tabs                                                          | boolean \| undefined                                                                                                                                                                                                                                                                  | true    |
| navigate                | Function to navigate to the selected item if it's an anchor element                                                                          | ((details: NavigateDetails) => void) \| null \| undefined                                                                                                                                                                                                                             | -       |
| triggerValue            | The controlled trigger value                                                                                                                 | string \| null \| undefined                                                                                                                                                                                                                                                           | -       |
| defaultTriggerValue     | The initial trigger value when rendered.&#xA;Use when you don't need to control the trigger value.                                           | string \| null \| undefined                                                                                                                                                                                                                                                           | -       |
| onTriggerValueChange    | Function called when the trigger value changes.                                                                                              | ((details: TriggerValueChangeDetails) => void) \| undefined                                                                                                                                                                                                                           | -       |
| dir                     | The document's text/writing direction.                                                                                                       | "ltr" \| "rtl" \| undefined                                                                                                                                                                                                                                                           | "ltr"   |
| getRootNode             | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                   | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                                                                                                   | -       |
| onEscapeKeyDown         | Function called when the escape key is pressed                                                                                               | ((event: KeyboardEvent) => void) \| undefined                                                                                                                                                                                                                                         | -       |
| onRequestDismiss        | Function called when this layer is closed due to a parent layer being closed                                                                 | ((event: LayerDismissEvent) => void) \| undefined                                                                                                                                                                                                                                     | -       |
| onPointerDownOutside    | Function called when the pointer is pressed down outside the component                                                                       | ((event: PointerDownOutsideEvent) => void) \| undefined                                                                                                                                                                                                                               | -       |
| onFocusOutside          | Function called when the focus is moved outside the component                                                                                | ((event: FocusOutsideEvent) => void) \| undefined                                                                                                                                                                                                                                     | -       |
| onInteractOutside       | Function called when an interaction happens outside the component                                                                            | ((event: InteractOutsideEvent) => void) \| undefined                                                                                                                                                                                                                                  | -       |
| element                 | Render the element yourself                                                                                                                  | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                                                                                                      | -       |

### Provider

| Prop     | Description | Type                                                   | Default |
| -------- | ----------- | ------------------------------------------------------ | ------- |
| value    | -           | () => MenuApi\<PropTypes> & \{ service: MenuService; } | -       |
| children | -           | Snippet\<\[]> \| undefined                             | -       |

### Context

| Prop     | Description | Type                                                                | Default |
| -------- | ----------- | ------------------------------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => MenuApi\<PropTypes> & \{ service: MenuService; }]> | -       |

### Trigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### ContextTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Indicator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Positioner

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Content

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemGroup

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemGroupLabel

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Item

| Prop          | Description                                                                                                                                     | Type                                             | Default |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------- |
| value         | The unique value of the menu item option.                                                                                                       | string                                           | -       |
| disabled      | Whether the menu item is disabled                                                                                                               | boolean \| undefined                             | -       |
| valueText     | The textual value of the option. Used in typeahead navigation of the menu.&#xA;If not provided, the text content of the menu item will be used. | string \| undefined                              | -       |
| closeOnSelect | Whether the menu should be closed when the option is selected.                                                                                  | boolean \| undefined                             | -       |
| element       | Render the element yourself                                                                                                                     | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### OptionItem

| Prop            | Description                                                                                                                                     | Type                                             | Default |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------- |
| checked         | Whether the option is checked                                                                                                                   | boolean                                          | -       |
| type            | Whether the option is a radio or a checkbox                                                                                                     | "radio" \| "checkbox"                            | -       |
| value           | The value of the option                                                                                                                         | string                                           | -       |
| onCheckedChange | Function called when the option state is changed                                                                                                | ((checked: boolean) => void) \| undefined        | -       |
| disabled        | Whether the menu item is disabled                                                                                                               | boolean \| undefined                             | -       |
| valueText       | The textual value of the option. Used in typeahead navigation of the menu.&#xA;If not provided, the text content of the menu item will be used. | string \| undefined                              | -       |
| closeOnSelect   | Whether the menu should be closed when the option is selected.                                                                                  | boolean \| undefined                             | -       |
| element         | Render the element yourself                                                                                                                     | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### TriggerItem

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemText

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemIndicator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Separator

| Prop    | Description                 | Type                                            | Default |
| ------- | --------------------------- | ----------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"hr">]> \| undefined | -       |

### Arrow

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ArrowTip

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

