# Accordion

Divide content into collapsible sections.

```svelte
<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
	import { slide } from 'svelte/transition';

	/**
	 * Attribution
	 * @see https://www.healthline.com/health/fun-facts-about-the-skeletal-system#8-More-than-half-your-bones-are-in-your-hands-and-feet
	 */
	const items = [
		{
			id: '1',
			title: 'Your skeleton is made of more than 200 bones',
			description:
				'Inside your body are 206 bones. Each bone plays a very important role in making all the mechanics of your body function properly. If a bone is broken, all the bones around it can’t perform their duty properly.',
		},
		{
			id: '2',
			title: 'The smallest bone in the body is in your ear',
			description:
				'The stapes, a bone in your inner ear, is the smallest of all your bones. This bone is also sometimes called the stirrup because of its Y shape. Together with the anvil and hammer bones, the stapes helps translate sounds you hear into waves your brain can understand.',
		},
		{
			id: '3',
			title: 'One bone isn’t connected to any other bones',
			description:
				'The hyoid bone, which is in your throat, is the only bone that doesn’t connect to a joint. The hyoid is responsible for holding your tongue in place.',
		},
	];
</script>

<Accordion>
	{#each items as item, i (item)}
		{#if i !== 0}
			<hr class="hr" />
		{/if}
		<Accordion.Item value={item.id}>
			<h3>
				<Accordion.ItemTrigger class="font-bold flex items-center justify-between gap-2">
					{item.title}
					<Accordion.ItemIndicator class="group">
						<ChevronDownIcon class="h-5 w-5 transition group-data-[state=open]:rotate-180" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
			</h3>
			<Accordion.ItemContent>
				{#snippet element(attributes)}
					{#if !attributes.hidden}
						<div {...attributes} transition:slide={{ duration: 150 }}>
							{item.description}
						</div>
					{/if}
				{/snippet}
			</Accordion.ItemContent>
		</Accordion.Item>
	{/each}
</Accordion>

```

## Controlled

Use the `open` and `onOpenChange` props to control the state.

```svelte
<script lang="ts">
	import { Accordion } from '@skeletonlabs/skeleton-svelte';

	let value = $state(['1']);
</script>

<Accordion {value} onValueChange={(details) => (value = details.value)}>
	{#each ['1', '2', '3'] as item (item)}
		<Accordion.Item value={item}>
			<h3>
				<Accordion.ItemTrigger>Item {item}</Accordion.ItemTrigger>
			</h3>
			<Accordion.ItemContent>Content for item {item}</Accordion.ItemContent>
		</Accordion.Item>
	{/each}
</Accordion>

```

## Multiple

Allow multiple accordion items to stay open at once using the `multiple` prop.

```svelte
<script lang="ts">
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
</script>

<Accordion multiple>
	{#each ['1', '2', '3'] as item (item)}
		<Accordion.Item value={item}>
			<h3>
				<Accordion.ItemTrigger>Item {item}</Accordion.ItemTrigger>
			</h3>
			<Accordion.ItemContent>Content for item {item}</Accordion.ItemContent>
		</Accordion.Item>
	{/each}
</Accordion>

```

## Collapsible

Allow closing all items when one is open using the `collapsible` prop.

```svelte
<script lang="ts">
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
</script>

<Accordion collapsible>
	{#each ['1', '2', '3'] as item (item)}
		<Accordion.Item value={item}>
			<h3>
				<Accordion.ItemTrigger>Item {item}</Accordion.ItemTrigger>
			</h3>
			<Accordion.ItemContent>Content for item {item}</Accordion.ItemContent>
		</Accordion.Item>
	{/each}
</Accordion>

```

## Indicator

Add a custom indicator to accordion triggers.

```svelte
<script lang="ts">
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
</script>

<Accordion>
	{#each ['1', '2', '3'] as item (item)}
		<Accordion.Item value={item}>
			<h3>
				<Accordion.ItemTrigger class="flex justify-between items-center">
					Item {item}
					<Accordion.ItemIndicator class="group">
						<MinusIcon class="size-4 group-data-[state=open]:block hidden" />
						<PlusIcon class="size-4 group-data-[state=open]:hidden block" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
			</h3>
			<Accordion.ItemContent>Content for item {item}</Accordion.ItemContent>
		</Accordion.Item>
	{/each}
</Accordion>

```

## Orientation

Render the accordion vertically or horizontally using the `orientation` prop.

```svelte
<script lang="ts">
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
</script>

<Accordion orientation="horizontal">
	{#each ['1', '2', '3'] as item (item)}
		<Accordion.Item value={item} class="data-[state=open]:flex-1">
			<h3>
				<Accordion.ItemTrigger>Item {item}</Accordion.ItemTrigger>
			</h3>
			<Accordion.ItemContent>Content for item {item}</Accordion.ItemContent>
		</Accordion.Item>
	{/each}
</Accordion>

```

## Dir

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
</script>

<Accordion dir="rtl">
	{#each ['1', '2', '3'] as item (item)}
		<Accordion.Item value={item}>
			<h3>
				<Accordion.ItemTrigger>Item {item}</Accordion.ItemTrigger>
			</h3>
			<Accordion.ItemContent>Content for item {item}</Accordion.ItemContent>
		</Accordion.Item>
	{/each}
</Accordion>

```

## Anatomy

Here's an overview of how the Accordion component is structured in code:

```svelte
<script lang="ts">
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
</script>

<Accordion>
	<Accordion.Item>
		<Accordion.ItemTrigger />
		<Accordion.ItemIndicator />
		<Accordion.ItemContent />
	</Accordion.Item>
</Accordion>
```

## API Reference

### Root

| Prop          | Description                                                                                                           | Type                                                                                                                                                       | Default    |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| ids           | The ids of the elements in the accordion. Useful for composition.                                                     | Partial\<\{ root: string; item: (value: string) => string; itemContent: (value: string) => string; itemTrigger: (value: string) => string; }> \| undefined | -          |
| multiple      | Whether multiple accordion items can be expanded at the same time.                                                    | boolean \| undefined                                                                                                                                       | false      |
| collapsible   | Whether an accordion item can be closed after it has been expanded.                                                   | boolean \| undefined                                                                                                                                       | false      |
| value         | The controlled value of the expanded accordion items.                                                                 | string\[] \| undefined                                                                                                                                     | -          |
| defaultValue  | The initial value of the expanded accordion items.&#xA;Use when you don't need to control the value of the accordion. | string\[] \| undefined                                                                                                                                     | -          |
| disabled      | Whether the accordion items are disabled                                                                              | boolean \| undefined                                                                                                                                       | -          |
| onValueChange | The callback fired when the state of expanded/collapsed accordion items changes.                                      | ((details: ValueChangeDetails) => void) \| undefined                                                                                                       | -          |
| onFocusChange | The callback fired when the focused accordion item changes.                                                           | ((details: FocusChangeDetails) => void) \| undefined                                                                                                       | -          |
| orientation   | The orientation of the accordion items.                                                                               | "horizontal" \| "vertical" \| undefined                                                                                                                    | "vertical" |
| dir           | The document's text/writing direction.                                                                                | "ltr" \| "rtl" \| undefined                                                                                                                                | "ltr"      |
| getRootNode   | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                            | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                        | -          |
| element       | Render the element yourself                                                                                           | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                           | -          |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => AccordionApi\<PropTypes>                   | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                        | Default |
| -------- | ----------- | ------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => AccordionApi\<PropTypes>]> | -       |

### Item

| Prop     | Description                             | Type                                             | Default |
| -------- | --------------------------------------- | ------------------------------------------------ | ------- |
| value    | The value of the accordion item.        | string                                           | -       |
| disabled | Whether the accordion item is disabled. | boolean \| undefined                             | -       |
| element  | Render the element yourself             | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### ItemIndicator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemContent

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

