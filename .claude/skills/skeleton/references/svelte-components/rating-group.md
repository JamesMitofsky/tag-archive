# Rating Group

Rating Group allows users to rate something

```svelte
<script lang="ts">
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<RatingGroup count={5} defaultValue={3}>
	<RatingGroup.Control>
		<RatingGroup.Context>
			{#snippet children(ratingGroup)}
				{#each ratingGroup().items as index (index)}
					<RatingGroup.Item {index} />
				{/each}
			{/snippet}
		</RatingGroup.Context>
	</RatingGroup.Control>
	<RatingGroup.HiddenInput />
</RatingGroup>

```

## Half Step

Set the `allowHalf` prop to enable half steps.

```svelte
<script lang="ts">
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<RatingGroup count={5} allowHalf={true}>
	<RatingGroup.Control>
		<RatingGroup.Context>
			{#snippet children(ratingGroup)}
				{#each ratingGroup().items as index (index)}
					<RatingGroup.Item {index} />
				{/each}
			{/snippet}
		</RatingGroup.Context>
	</RatingGroup.Control>
	<RatingGroup.HiddenInput />
</RatingGroup>

```

## Custom Icons

Insert your own custom images or icons for the `empty` and `full` states.

```svelte
<script lang="ts">
	import BoneIcon from '@lucide/svelte/icons/bone';
	import SkullIcon from '@lucide/svelte/icons/skull';
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<RatingGroup count={3}>
	<RatingGroup.Control>
		<RatingGroup.Context>
			{#snippet children(ratingGroup)}
				{#each ratingGroup().items as index (index)}
					<RatingGroup.Item {index}>
						{#snippet empty()}
							<BoneIcon />
						{/snippet}
						{#snippet full()}
							<SkullIcon />
						{/snippet}
					</RatingGroup.Item>
				{/each}
			{/snippet}
		</RatingGroup.Context>
	</RatingGroup.Control>
	<RatingGroup.HiddenInput />
</RatingGroup>

```

## Label

Use the `Label` component to describe the intended usage.

```svelte
<script lang="ts">
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<RatingGroup count={5}>
	<RatingGroup.Label>Rate us:</RatingGroup.Label>
	<RatingGroup.Control>
		<RatingGroup.Context>
			{#snippet children(ratingGroup)}
				{#each ratingGroup().items as index (index)}
					<RatingGroup.Item {index} />
				{/each}
			{/snippet}
		</RatingGroup.Context>
	</RatingGroup.Control>
	<RatingGroup.HiddenInput />
</RatingGroup>

```

## Disabled

Set the `disabled` prop to enable the disabled state.

```svelte
<script lang="ts">
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<RatingGroup count={5} disabled={true}>
	<RatingGroup.Control>
		<RatingGroup.Context>
			{#snippet children(ratingGroup)}
				{#each ratingGroup().items as index (index)}
					<RatingGroup.Item {index} />
				{/each}
			{/snippet}
		</RatingGroup.Context>
	</RatingGroup.Control>
	<RatingGroup.HiddenInput />
</RatingGroup>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<RatingGroup count={5} dir="rtl">
	<RatingGroup.Label>Label</RatingGroup.Label>
	<RatingGroup.Control>
		<RatingGroup.Context>
			{#snippet children(ratingGroup)}
				{#each ratingGroup().items as index (index)}
					<RatingGroup.Item {index} />
				{/each}
			{/snippet}
		</RatingGroup.Context>
	</RatingGroup.Control>
	<RatingGroup.HiddenInput />
</RatingGroup>

```

## Anatomy

Here's an overview of how the RatingGroup component is structured in code:

```svelte
<script lang="ts">
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
</script>

<RatingGroup>
	<RatingGroup.Label />
	<RatingGroup.Control>
		<RatingGroup.Item />
	</RatingGroup.Control>
	<RatingGroup.HiddenInput />
</RatingGroup>
```

## API Reference

### Root

| Prop          | Description                                                                                                    | Type                                                                                                                         | Default |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- |
| ids           | The ids of the elements in the rating. Useful for composition.                                                 | Partial\<\{ root: string; label: string; hiddenInput: string; control: string; item: (id: string) => string; }> \| undefined | -       |
| translations  | Specifies the localized strings that identifies the accessibility elements and their states                    | IntlTranslations \| undefined                                                                                                | -       |
| count         | The total number of ratings.                                                                                   | number \| undefined                                                                                                          | 5       |
| name          | The name attribute of the rating element (used in forms).                                                      | string \| undefined                                                                                                          | -       |
| form          | The associate form of the underlying input element.                                                            | string \| undefined                                                                                                          | -       |
| value         | The controlled value of the rating                                                                             | number \| undefined                                                                                                          | -       |
| defaultValue  | The initial value of the rating when rendered.&#xA;Use when you don't need to control the value of the rating. | number \| undefined                                                                                                          | -       |
| readOnly      | Whether the rating is readonly.                                                                                | boolean \| undefined                                                                                                         | -       |
| disabled      | Whether the rating is disabled.                                                                                | boolean \| undefined                                                                                                         | -       |
| required      | Whether the rating is required.                                                                                | boolean \| undefined                                                                                                         | -       |
| allowHalf     | Whether to allow half stars.                                                                                   | boolean \| undefined                                                                                                         | -       |
| autoFocus     | Whether to autofocus the rating.                                                                               | boolean \| undefined                                                                                                         | -       |
| onValueChange | Function to be called when the rating value changes.                                                           | ((details: ValueChangeDetails) => void) \| undefined                                                                         | -       |
| onHoverChange | Function to be called when the rating value is hovered.                                                        | ((details: HoverChangeDetails) => void) \| undefined                                                                         | -       |
| dir           | The document's text/writing direction.                                                                         | "ltr" \| "rtl" \| undefined                                                                                                  | "ltr"   |
| getRootNode   | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                     | (() => ShadowRoot \| Node \| Document) \| undefined                                                                          | -       |
| element       | Render the element yourself                                                                                    | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                             | -       |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => RatingGroupApi\<PropTypes>                 | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                          | Default |
| -------- | ----------- | --------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => RatingGroupApi\<PropTypes>]> | -       |

### Label

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### Control

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Item

| Prop    | Description                                                | Type                                              | Default         |
| ------- | ---------------------------------------------------------- | ------------------------------------------------- | --------------- |
| empty   | The content to render when the item is in the empty state. | any                                               | StarEmpty (SVG) |
| half    | The content to render when the item is in the half state.  | any                                               | StarHalf (SVG)  |
| full    | The content to render when the item is in the full state.  | any                                               | StarFull (SVG)  |
| index   | -                                                          | number                                            | -               |
| element | Render the element yourself                                | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -               |

### HiddenInput

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

