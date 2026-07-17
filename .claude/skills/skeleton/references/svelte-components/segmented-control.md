# Segmented Control

Capture input for a limited set of options.

```svelte
<script lang="ts">
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';

	let value = $state<string | null>('music');
</script>

<div class="flex flex-col items-center gap-4">
	<SegmentedControl {value} onValueChange={(details) => (value = details.value)}>
		<SegmentedControl.Label>Browse</SegmentedControl.Label>
		<SegmentedControl.Control>
			<SegmentedControl.Indicator />
			<SegmentedControl.Item value="music">
				<SegmentedControl.ItemText>Music</SegmentedControl.ItemText>
				<SegmentedControl.ItemHiddenInput />
			</SegmentedControl.Item>
			<SegmentedControl.Item value="images">
				<SegmentedControl.ItemText>Images</SegmentedControl.ItemText>
				<SegmentedControl.ItemHiddenInput />
			</SegmentedControl.Item>
			<SegmentedControl.Item value="videos">
				<SegmentedControl.ItemText>Videos</SegmentedControl.ItemText>
				<SegmentedControl.ItemHiddenInput />
			</SegmentedControl.Item>
		</SegmentedControl.Control>
	</SegmentedControl>

	<!-- Message -->
	<p><span class="opacity-60">You selected</span> <code class="code">{value}</code></p>
</div>

```

## Icons

To adhere to accessibility best practices, include `title` and `aria-label` when using icon labels.

```svelte
<script lang="ts">
	import AlignCenterVerticalIcon from '@lucide/svelte/icons/align-center-vertical';
	import AlignEndVerticalIcon from '@lucide/svelte/icons/align-end-vertical';
	import AlignStartVerticalIcon from '@lucide/svelte/icons/align-start-vertical';
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
</script>

<SegmentedControl defaultValue="start">
	<SegmentedControl.Control>
		<SegmentedControl.Indicator />
		<SegmentedControl.Item value="start" title="start" aria-label="start">
			<SegmentedControl.ItemText>
				<AlignStartVerticalIcon class="size-4" />
			</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>
		<SegmentedControl.Item value="center" title="center" aria-label="center">
			<SegmentedControl.ItemText>
				<AlignCenterVerticalIcon class="size-4" />
			</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>
		<SegmentedControl.Item value="end" title="end" aria-label="end">
			<SegmentedControl.ItemText>
				<AlignEndVerticalIcon class="size-4" />
			</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>
	</SegmentedControl.Control>
</SegmentedControl>

```

## Orientation

Using the `orientation` prop to control the layout.

```svelte
<script lang="ts">
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
</script>

<SegmentedControl defaultValue="music" orientation="vertical">
	<SegmentedControl.Control>
		<SegmentedControl.Indicator />
		<SegmentedControl.Item value="music">
			<SegmentedControl.ItemText>Music</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>
		<SegmentedControl.Item value="images">
			<SegmentedControl.ItemText>Images</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>
		<SegmentedControl.Item value="videos">
			<SegmentedControl.ItemText>Videos</SegmentedControl.ItemText>
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>
	</SegmentedControl.Control>
</SegmentedControl>

```

## Anatomy

Here's an overview of how the SegmentedControl component is structured in code:

```svelte
<script lang="ts">
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
</script>

<SegmentedControl>
	<SegmentedControl.Label />
	<SegmentedControl.Control>
		<SegmentedControl.Indicator />
		<SegmentedControl.Item>
			<SegmentedControl.ItemText />
			<SegmentedControl.ItemHiddenInput />
		</SegmentedControl.Item>
	</SegmentedControl.Control>
</SegmentedControl>
```

## API Reference

### Root

| Prop          | Description                                                                                                                | Type                                                                                                                                                                                                                                   | Default |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| ids           | The ids of the elements in the radio. Useful for composition.                                                              | Partial\<\{ root: string; label: string; indicator: string; item: (value: string) => string; itemLabel: (value: string) => string; itemControl: (value: string) => string; itemHiddenInput: (value: string) => string; }> \| undefined | -       |
| value         | The controlled value of the radio group                                                                                    | string \| null \| undefined                                                                                                                                                                                                            | -       |
| defaultValue  | The initial value of the checked radio when rendered.&#xA;Use when you don't need to control the value of the radio group. | string \| null \| undefined                                                                                                                                                                                                            | -       |
| name          | The name of the input fields in the radio&#xA;(Useful for form submission).                                                | string \| undefined                                                                                                                                                                                                                    | -       |
| form          | The associate form of the underlying input.                                                                                | string \| undefined                                                                                                                                                                                                                    | -       |
| disabled      | If \`true\`, the radio group will be disabled                                                                              | boolean \| undefined                                                                                                                                                                                                                   | -       |
| invalid       | If \`true\`, the radio group is marked as invalid.                                                                         | boolean \| undefined                                                                                                                                                                                                                   | -       |
| required      | If \`true\`, the radio group is marked as required.                                                                        | boolean \| undefined                                                                                                                                                                                                                   | -       |
| readOnly      | Whether the radio group is read-only                                                                                       | boolean \| undefined                                                                                                                                                                                                                   | -       |
| onValueChange | Function called once a radio is checked                                                                                    | ((details: ValueChangeDetails) => void) \| undefined                                                                                                                                                                                   | -       |
| orientation   | Orientation of the radio group                                                                                             | "horizontal" \| "vertical" \| undefined                                                                                                                                                                                                | -       |
| dir           | The document's text/writing direction.                                                                                     | "ltr" \| "rtl" \| undefined                                                                                                                                                                                                            | "ltr"   |
| getRootNode   | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                 | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                                                    | -       |
| element       | Render the element yourself                                                                                                | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                                                       | -       |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => RadioGroupApi\<PropTypes>                  | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                         | Default |
| -------- | ----------- | -------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => RadioGroupApi\<PropTypes>]> | -       |

### Label

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### Control

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Indicator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Item

| Prop     | Description                 | Type                                               | Default |
| -------- | --------------------------- | -------------------------------------------------- | ------- |
| value    | -                           | string                                             | -       |
| disabled | -                           | boolean \| undefined                               | -       |
| invalid  | -                           | boolean \| undefined                               | -       |
| element  | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### ItemText

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### ItemHiddenInput

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

