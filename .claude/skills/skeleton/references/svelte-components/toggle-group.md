# Toggle Group

Grouped buttons for toggling option states.

```svelte
<script lang="ts">
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import UnderlineIcon from '@lucide/svelte/icons/underline';
	import { ToggleGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<ToggleGroup defaultValue={['bold']} multiple>
	<ToggleGroup.Item value="bold">
		<BoldIcon class="size-4" />
	</ToggleGroup.Item>
	<ToggleGroup.Item value="italic">
		<ItalicIcon class="size-4" />
	</ToggleGroup.Item>
	<ToggleGroup.Item value="underline">
		<UnderlineIcon class="size-4" />
	</ToggleGroup.Item>
</ToggleGroup>

```

## Controlled

Use the `value` and `onValueChange` props to control state programmatically.

```svelte
<script lang="ts">
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import UnderlineIcon from '@lucide/svelte/icons/underline';
	import { ToggleGroup } from '@skeletonlabs/skeleton-svelte';

	let value = $state(['bold']);
</script>

<div class="flex flex-col items-center gap-4">
	<ToggleGroup {value} onValueChange={(details) => (value = details.value)} multiple>
		<ToggleGroup.Item value="bold">
			<BoldIcon class="size-4" />
		</ToggleGroup.Item>
		<ToggleGroup.Item value="italic">
			<ItalicIcon class="size-4" />
		</ToggleGroup.Item>
		<ToggleGroup.Item value="underline">
			<UnderlineIcon class="size-4" />
		</ToggleGroup.Item>
	</ToggleGroup>

	<!-- Message -->
	<p><span class="opacity-60">You selected</span> <code class="code">{value.length > 0 ? value.join(', ') : 'none'}</code></p>
</div>

```

## Orientation

Using the `orientation` prop to control the layout.

```svelte
<script lang="ts">
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import UnderlineIcon from '@lucide/svelte/icons/underline';
	import { ToggleGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="flex flex-col items-center gap-4">
	<p>Horizontal</p>
	<ToggleGroup defaultValue={['bold']} multiple orientation="horizontal">
		<ToggleGroup.Item value="bold">
			<BoldIcon class="size-4" />
		</ToggleGroup.Item>
		<ToggleGroup.Item value="italic">
			<ItalicIcon class="size-4" />
		</ToggleGroup.Item>
		<ToggleGroup.Item value="underline">
			<UnderlineIcon class="size-4" />
		</ToggleGroup.Item>
	</ToggleGroup>

	<p>Vertical</p>
	<ToggleGroup defaultValue={['bold']} multiple orientation="vertical" class="flex-col">
		<ToggleGroup.Item value="bold">
			<BoldIcon class="size-4" />
		</ToggleGroup.Item>
		<ToggleGroup.Item value="italic">
			<ItalicIcon class="size-4" />
		</ToggleGroup.Item>
		<ToggleGroup.Item value="underline">
			<UnderlineIcon class="size-4" />
		</ToggleGroup.Item>
	</ToggleGroup>
</div>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import UnderlineIcon from '@lucide/svelte/icons/underline';
	import { ToggleGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<ToggleGroup defaultValue={['bold']} multiple dir="rtl">
	<ToggleGroup.Item value="bold">
		<BoldIcon class="size-4" />
	</ToggleGroup.Item>
	<ToggleGroup.Item value="italic">
		<ItalicIcon class="size-4" />
	</ToggleGroup.Item>
	<ToggleGroup.Item value="underline">
		<UnderlineIcon class="size-4" />
	</ToggleGroup.Item>
</ToggleGroup>

```

## Anatomy

Here's an overview of how the ToggleGroup component is structured in code:

```svelte
<script lang="ts">
	import { ToggleGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<ToggleGroup>
	<ToggleGroup.Item />
</ToggleGroup>
```

## API Reference

### Root

| Prop          | Description                                                                                                                                  | Type                                                                       | Default      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------ |
| ids           | The ids of the elements in the toggle. Useful for composition.                                                                               | Partial\<\{ root: string; item: (value: string) => string; }> \| undefined | -            |
| disabled      | Whether the toggle is disabled.                                                                                                              | boolean \| undefined                                                       | -            |
| value         | The controlled selected value of the toggle group.                                                                                           | string\[] \| undefined                                                     | -            |
| defaultValue  | The initial selected value of the toggle group when rendered.&#xA;Use when you don't need to control the selected value of the toggle group. | string\[] \| undefined                                                     | -            |
| onValueChange | Function to call when the toggle is clicked.                                                                                                 | ((details: ValueChangeDetails) => void) \| undefined                       | -            |
| loopFocus     | Whether to loop focus inside the toggle group.                                                                                               | boolean \| undefined                                                       | true         |
| rovingFocus   | Whether to use roving tab index to manage focus.                                                                                             | boolean \| undefined                                                       | true         |
| orientation   | The orientation of the toggle group.                                                                                                         | Orientation \| undefined                                                   | "horizontal" |
| multiple      | Whether to allow multiple toggles to be selected.                                                                                            | boolean \| undefined                                                       | -            |
| deselectable  | Whether the toggle group allows empty selection.&#xA;\*\*Note:\*\* This is ignored if \`multiple\` is \`true\`.                              | boolean \| undefined                                                       | true         |
| dir           | The document's text/writing direction.                                                                                                       | "ltr" \| "rtl" \| undefined                                                | "ltr"        |
| getRootNode   | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                   | (() => ShadowRoot \| Node \| Document) \| undefined                        | -            |
| element       | Render the element yourself                                                                                                                  | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                           | -            |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => ToggleGroupApi\<PropTypes>                 | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                          | Default |
| -------- | ----------- | --------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => ToggleGroupApi\<PropTypes>]> | -       |

### Item

| Prop     | Description                 | Type                                                | Default |
| -------- | --------------------------- | --------------------------------------------------- | ------- |
| value    | -                           | string                                              | -       |
| disabled | -                           | boolean \| undefined                                | -       |
| element  | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

