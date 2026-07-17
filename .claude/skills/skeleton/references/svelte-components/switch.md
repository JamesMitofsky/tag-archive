# Switch

Toggle between two states, such as on/off.

```svelte
<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';

	let checked = $state(false);
</script>

<div class="flex flex-col items-center gap-4">
	<Switch {checked} onCheckedChange={(details) => (checked = details.checked)}>
		<Switch.Control>
			<Switch.Thumb />
		</Switch.Control>
		<Switch.Label>Label</Switch.Label>
		<Switch.HiddenInput />
	</Switch>
	<p>
		<span class="opacity-60">Checked: </span>
		<code class="code">{checked}</code>
	</p>
</div>

```

## Color

Use the [Tailwind data attribute syntax](https://tailwindcss.com/docs/hover-focus-and-other-states#data-attributes) to target the state using `data-[state=checked]`

```svelte
<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';
</script>

<Switch>
	<Switch.Control class="preset-filled-secondary-50-950 data-[state=checked]:preset-filled-secondary-500">
		<Switch.Thumb />
	</Switch.Control>
	<Switch.HiddenInput />
</Switch>

```

## List

Use the `Label` component to create a list layout.

```svelte
<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="grid gap-2 w-full">
	{#each ['Label 1', 'Label 2', 'Label 3'] as label, i (label)}
		<Switch class="flex justify-between p-2">
			<Switch.Label>{label}</Switch.Label>
			<Switch.Control>
				<Switch.Thumb />
			</Switch.Control>
			<Switch.HiddenInput />
		</Switch>
		{#if i < 2}
			<hr class="hr" />
		{/if}
	{/each}
</div>

```

## Icons

Add icons to act as state indicators.

```svelte
<script lang="ts">
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
</script>

<Switch>
	<Switch.Control>
		<Switch.Thumb>
			<Switch.Context>
				{#snippet children(switch_)}
					{#if switch_().checked}
						<SunIcon class="size-3" />
					{:else}
						<MoonIcon class="size-3" />
					{/if}
				{/snippet}
			</Switch.Context>
		</Switch.Thumb>
	</Switch.Control>
	<Switch.HiddenInput />
</Switch>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';
</script>

<Switch dir="rtl">
	<Switch.Control>
		<Switch.Thumb />
	</Switch.Control>
	<Switch.Label>Label</Switch.Label>
	<Switch.HiddenInput />
</Switch>

```

## Anatomy

Here's an overview of how the Switch component is structured in code:

```svelte
<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';
</script>

<Switch>
	<Switch.Control>
		<Switch.Thumb />
	</Switch.Control>
	<Switch.Label />
	<Switch.HiddenInput />
</Switch>
```

## API Reference

### Root

| Prop            | Description                                                                                                                    | Type                                                                                                          | Default |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------- |
| ids             | The ids of the elements in the switch. Useful for composition.                                                                 | Partial\<\{ root: string; hiddenInput: string; control: string; label: string; thumb: string; }> \| undefined | -       |
| label           | Specifies the localized strings that identifies the accessibility elements and their states                                    | string \| undefined                                                                                           | -       |
| disabled        | Whether the switch is disabled.                                                                                                | boolean \| undefined                                                                                          | -       |
| invalid         | If \`true\`, the switch is marked as invalid.                                                                                  | boolean \| undefined                                                                                          | -       |
| required        | If \`true\`, the switch input is marked as required,                                                                           | boolean \| undefined                                                                                          | -       |
| readOnly        | Whether the switch is read-only                                                                                                | boolean \| undefined                                                                                          | -       |
| onCheckedChange | Function to call when the switch is clicked.                                                                                   | ((details: CheckedChangeDetails) => void) \| undefined                                                        | -       |
| checked         | The controlled checked state of the switch                                                                                     | boolean \| undefined                                                                                          | -       |
| defaultChecked  | The initial checked state of the switch when rendered.&#xA;Use when you don't need to control the checked state of the switch. | boolean \| undefined                                                                                          | -       |
| name            | The name of the input field in a switch&#xA;(Useful for form submission).                                                      | string \| undefined                                                                                           | -       |
| form            | The id of the form that the switch belongs to                                                                                  | string \| undefined                                                                                           | -       |
| value           | The value of switch input. Useful for form submission.                                                                         | string \| number \| undefined                                                                                 | "on"    |
| dir             | The document's text/writing direction.                                                                                         | "ltr" \| "rtl" \| undefined                                                                                   | "ltr"   |
| getRootNode     | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                     | (() => ShadowRoot \| Node \| Document) \| undefined                                                           | -       |
| element         | Render the element yourself                                                                                                    | Snippet\<\[HTMLAttributes\<"label">]> \| undefined                                                            | -       |

### Provider

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| value   | -                           | () => SwitchApi\<PropTypes>                        | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                     | Default |
| -------- | ----------- | ---------------------------------------- | ------- |
| children | -           | Snippet\<\[() => SwitchApi\<PropTypes>]> | -       |

### Control

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### Thumb

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### Label

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### HiddenInput

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

