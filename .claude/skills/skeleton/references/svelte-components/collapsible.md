# Collapsible

A container that can be expanded or collapsed to show or hide content.

```svelte
<script lang="ts">
	import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down';
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
</script>

<Collapsible class="items-start card preset-filled-surface-100-900 p-4 w-56 mx-auto">
	<div class="w-full flex justify-between items-center">
		<p class="font-bold">Design System</p>
		<Collapsible.Trigger class="btn-icon hover:preset-tonal">
			<ArrowUpDownIcon class="size-4" />
		</Collapsible.Trigger>
	</div>
	<Collapsible.Content class="flex flex-col gap-2">
		<nav class="contents">
			<a class="anchor" href="/docs/design/themes">Themes</a>
			<a class="anchor" href="/docs/design/colors">Colors</a>
			<a class="anchor" href="/docs/tailwind-utilities/presets">Presets</a>
			<a class="anchor" href="/docs/design/typography">Typography</a>
			<a class="anchor" href="/docs/design/spacing">Spacing</a>
			<a class="anchor" href="/docs/design/iconography">Iconography</a>
		</nav>
	</Collapsible.Content>
</Collapsible>

```

## Controlled

Control the active state of the component.

```svelte
<script lang="ts">
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';

	let open = $state(false);
</script>

<Collapsible {open} onOpenChange={(details) => (open = details.open)}>
	<Collapsible.Content>
		The world dies over and over again, but the skeleton always gets up and walks. Every heart has its own skeletons. The bones of the
		skeleton which support the body can become the bars of the cage which imprison the spirit.
	</Collapsible.Content>
	<Collapsible.Trigger class="btn preset-filled">Show {open ? 'Less' : 'More'}</Collapsible.Trigger>
</Collapsible>

```

## Indicator

Add a visual indicator to the toggle button.

```svelte
<script lang="ts">
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
</script>

<Collapsible>
	<Collapsible.Content>
		The world dies over and over again, but the skeleton always gets up and walks. Every heart has its own skeletons. The bones of the
		skeleton which support the body can become the bars of the cage which imprison the spirit.
	</Collapsible.Content>
	<Collapsible.Trigger class="btn preset-filled">
		<span>Toggle</span>
		<Collapsible.Indicator class="group">
			<MinusIcon class="size-4 group-data-[state=open]:block hidden" />
			<PlusIcon class="size-4 group-data-[state=open]:hidden block" />
		</Collapsible.Indicator>
	</Collapsible.Trigger>
</Collapsible>

```

## Disabled

Set the disabled state for the component.

```svelte
<script lang="ts">
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
</script>

<Collapsible disabled>
	<Collapsible.Content>Hidden!</Collapsible.Content>
	<Collapsible.Trigger class="btn preset-filled">Toggle</Collapsible.Trigger>
</Collapsible>

```

## Alignment

Control the position and alignment of the trigger and content using flexbox `items-*`.

```svelte
<script lang="ts">
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
</script>

<Collapsible class="items-start">
	<Collapsible.Trigger class="btn preset-filled">Toggle</Collapsible.Trigger>
	<Collapsible.Content>
		The world dies over and over again, but the skeleton always gets up and walks. Every heart has its own skeletons. The bones of the
		skeleton which support the body can become the bars of the cage which imprison the spirit.
	</Collapsible.Content>
</Collapsible>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
</script>

<Collapsible dir="rtl">
	<Collapsible.Content>
		The world dies over and over again, but the skeleton always gets up and walks. Every heart has its own skeletons. The bones of the
		skeleton which support the body can become the bars of the cage which imprison the spirit.
	</Collapsible.Content>
	<Collapsible.Trigger class="btn preset-filled">Toggle</Collapsible.Trigger>
</Collapsible>

```

## Anatomy

Here's an overview of how the Collapsible component is structured in code:

```svelte
<script lang="ts">
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
</script>

<Collapsible>
	<Collapsible.Trigger />
	<Collapsible.Content />
</Collapsible>
```

## API Reference

### Root

| Prop            | Description                                                                                                                        | Type                                                                        | Default |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| ids             | The ids of the elements in the collapsible. Useful for composition.                                                                | Partial\<\{ root: string; content: string; trigger: string; }> \| undefined | -       |
| open            | The controlled open state of the collapsible.                                                                                      | boolean \| undefined                                                        | -       |
| defaultOpen     | The initial open state of the collapsible when rendered.&#xA;Use when you don't need to control the open state of the collapsible. | boolean \| undefined                                                        | -       |
| onOpenChange    | The callback invoked when the open state changes.                                                                                  | ((details: OpenChangeDetails) => void) \| undefined                         | -       |
| onExitComplete  | The callback invoked when the exit animation completes.                                                                            | VoidFunction \| undefined                                                   | -       |
| disabled        | Whether the collapsible is disabled.                                                                                               | boolean \| undefined                                                        | -       |
| collapsedHeight | The height of the content when collapsed.                                                                                          | string \| number \| undefined                                               | -       |
| collapsedWidth  | The width of the content when collapsed.                                                                                           | string \| number \| undefined                                               | -       |
| getRootNode     | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                         | (() => ShadowRoot \| Node \| Document) \| undefined                         | -       |
| dir             | The document's text/writing direction.                                                                                             | "ltr" \| "rtl" \| undefined                                                 | "ltr"   |
| element         | Render the element yourself                                                                                                        | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                            | -       |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => CollapsibleApi\<PropTypes>                 | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                          | Default |
| -------- | ----------- | --------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => CollapsibleApi\<PropTypes>]> | -       |

### Trigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Indicator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Content

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

