# Tooltip

A floating label that appears on hover or focus, providing additional context.

```svelte
<script lang="ts">
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
</script>

<Tooltip positioning={{ placement: 'top' }}>
	<Tooltip.Trigger>Hover</Tooltip.Trigger>
	<Portal>
		<Tooltip.Positioner>
			<Tooltip.Content class="card p-2 preset-filled-surface-950-50">
				<span>Hello Skeleton</span>
				<Tooltip.Arrow class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-950-50)]">
					<Tooltip.ArrowTip />
				</Tooltip.Arrow>
			</Tooltip.Content>
		</Tooltip.Positioner>
	</Portal>
</Tooltip>

```

Breaking convention in Skeleton, this component is provided "headless". Meaning no default styles are applied out of the box. This ensures you retain full control of all styling for maximum flexibility.

## Arrow

Visually connects the popover content to the trigger element. Will automatically align based on the selected side.

```svelte
<script lang="ts">
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
</script>

<Tooltip>
	<Tooltip.Trigger>Hover</Tooltip.Trigger>
	<Portal>
		<Tooltip.Positioner>
			<Tooltip.Content class="card bg-surface-100-900 p-2 shadow-xl">
				<span>Hello Skeleton</span>
				<Tooltip.Arrow class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-100-900)]">
					<Tooltip.ArrowTip />
				</Tooltip.Arrow>
			</Tooltip.Content>
		</Tooltip.Positioner>
	</Portal>
</Tooltip>

```

## Z-Index

By default Skeleton does not take an opinionated stance regarding z-index stacking. The result is the component can sometimes be occluded beneath other elements with a higher index. The Z-Index can controlled by applying a utility class to the `Positioner` component.

```svelte
<script lang="ts">
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="grid grid-cols-2 gap-4">
	<Tooltip>
		<Tooltip.Trigger>Default (auto)</Tooltip.Trigger>
		<Portal>
			<Tooltip.Positioner>
				<Tooltip.Content class="card bg-surface-100-900 p-2  shadow-xl">This example will be below the sibling.</Tooltip.Content>
			</Tooltip.Positioner>
		</Portal>
	</Tooltip>

	<Tooltip>
		<Tooltip.Trigger>Above (20)</Tooltip.Trigger>
		<Portal>
			<Tooltip.Positioner class="z-20!">
				<Tooltip.Content class="card bg-surface-100-900 p-2  shadow-xl">This example will be above the sibling.</Tooltip.Content>
			</Tooltip.Positioner>
		</Portal>
	</Tooltip>

	<div class="col-span-2 h-[100px] relative">
		<div class="rounded bg-primary-200-800/75 w-full h-full z-10 flex justify-center items-center absolute">Sibling (10)</div>
	</div>
</div>

```

## Provider Pattern

Use the [Provider Pattern](/docs/\[framework]/get-started/fundamentals#provider-pattern) to gain access to the inner component APIs.

```svelte
<script lang="ts">
	import { Portal, Tooltip, useTooltip } from '@skeletonlabs/skeleton-svelte';

	const id = $props.id();
	const tooltip = useTooltip({ id });
</script>

<div class="grid gap-4">
	<button class="btn preset-filled w-[150px]" onclick={() => tooltip().setOpen(!tooltip().open)}>Trigger</button>
	<Tooltip.Provider value={tooltip}>
		<Tooltip.Trigger>Anchor ({tooltip().open ? 'open' : 'closed'})</Tooltip.Trigger>
		<Portal>
			<Tooltip.Positioner>
				<Tooltip.Content class="card bg-surface-100-900 p-2  shadow-xl">Hello Skeleton</Tooltip.Content>
			</Tooltip.Positioner>
		</Portal>
	</Tooltip.Provider>
</div>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
</script>

<Tooltip dir="rtl">
	<Tooltip.Trigger>Hover</Tooltip.Trigger>
	<Portal>
		<Tooltip.Positioner>
			<Tooltip.Content class="card bg-surface-100-900 p-2  shadow-xl">Hello Skeleton</Tooltip.Content>
		</Tooltip.Positioner>
	</Portal>
</Tooltip>

```

## Anatomy

Here's an overview of how the Tooltip component is structured in code:

```svelte
<script lang="ts">
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Tooltip>
	<Tooltip.Trigger />
	<Portal>
		<Tooltip.Positioner>
			<Tooltip.Content>
				<Tooltip.Arrow>
					<Tooltip.ArrowTip />
				</Tooltip.Arrow>
			</Tooltip.Content>
		</Tooltip.Positioner>
	</Portal>
</Tooltip>
```

## API Reference

### Root

| Prop                 | Description                                                                                                                     | Type                                                                                                                                          | Default |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| ids                  | The ids of the elements in the tooltip. Useful for composition.                                                                 | Partial\<\{ trigger: string \| ((value?: string \| undefined) => string); content: string; arrow: string; positioner: string; }> \| undefined | -       |
| openDelay            | The open delay of the tooltip.                                                                                                  | number \| undefined                                                                                                                           | 400     |
| closeDelay           | The close delay of the tooltip.                                                                                                 | number \| undefined                                                                                                                           | 150     |
| closeOnPointerDown   | Whether to close the tooltip on pointerdown.                                                                                    | boolean \| undefined                                                                                                                          | true    |
| closeOnEscape        | Whether to close the tooltip when the Escape key is pressed.                                                                    | boolean \| undefined                                                                                                                          | true    |
| closeOnScroll        | Whether the tooltip should close on scroll                                                                                      | boolean \| undefined                                                                                                                          | true    |
| closeOnClick         | Whether the tooltip should close on click                                                                                       | boolean \| undefined                                                                                                                          | true    |
| interactive          | Whether the tooltip's content is interactive.&#xA;In this mode, the tooltip will remain open when user hovers over the content. | boolean \| undefined                                                                                                                          | false   |
| onOpenChange         | Function called when the tooltip is opened.                                                                                     | ((details: OpenChangeDetails) => void) \| undefined                                                                                           | -       |
| aria-label           | Custom label for the tooltip.                                                                                                   | string \| undefined                                                                                                                           | -       |
| positioning          | The user provided options used to position the popover content                                                                  | PositioningOptions \| undefined                                                                                                               | -       |
| disabled             | Whether the tooltip is disabled                                                                                                 | boolean \| undefined                                                                                                                          | -       |
| open                 | The controlled open state of the tooltip                                                                                        | boolean \| undefined                                                                                                                          | -       |
| defaultOpen          | The initial open state of the tooltip when rendered.&#xA;Use when you don't need to control the open state of the tooltip.      | boolean \| undefined                                                                                                                          | -       |
| triggerValue         | The controlled trigger value                                                                                                    | string \| null \| undefined                                                                                                                   | -       |
| defaultTriggerValue  | The initial trigger value when rendered.&#xA;Use when you don't need to control the trigger value.                              | string \| null \| undefined                                                                                                                   | -       |
| onTriggerValueChange | Function called when the trigger value changes.                                                                                 | ((details: TriggerValueChangeDetails) => void) \| undefined                                                                                   | -       |
| dir                  | The document's text/writing direction.                                                                                          | "ltr" \| "rtl" \| undefined                                                                                                                   | "ltr"   |
| getRootNode          | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                      | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                           | -       |
| children             | The default slot content to be rendered within the component.                                                                   | Snippet\<\[]> \| undefined                                                                                                                    | -       |

### Provider

| Prop     | Description                                                   | Type                       | Default |
| -------- | ------------------------------------------------------------- | -------------------------- | ------- |
| value    | -                                                             | any                        | -       |
| children | The default slot content to be rendered within the component. | Snippet\<\[]> \| undefined | -       |

### Context

| Prop     | Description | Type                                      | Default |
| -------- | ----------- | ----------------------------------------- | ------- |
| children | -           | Snippet\<\[() => TooltipApi\<PropTypes>]> | -       |

### Trigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Positioner

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Content

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Arrow

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ArrowTip

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

