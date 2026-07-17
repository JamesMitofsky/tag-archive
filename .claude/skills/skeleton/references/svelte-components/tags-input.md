# Tags Input

Allows input of multiple values.

```svelte
<script lang="ts">
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
</script>

<TagsInput defaultValue={['Vanilla', 'Chocolate', 'Strawberry']}>
	<TagsInput.Label>Flavors</TagsInput.Label>
	<TagsInput.Control>
		<TagsInput.Context>
			{#snippet children(tagsInput)}
				{#each tagsInput().value as value, index (index)}
					<TagsInput.Item {value} {index}>
						<TagsInput.ItemPreview>
							<TagsInput.ItemText>{value}</TagsInput.ItemText>
							<TagsInput.ItemDeleteTrigger />
						</TagsInput.ItemPreview>
						<TagsInput.ItemInput />
					</TagsInput.Item>
				{/each}
			{/snippet}
		</TagsInput.Context>
		<TagsInput.Input placeholder="Add a flavor..." />
	</TagsInput.Control>
	<TagsInput.ClearTrigger>Clear All</TagsInput.ClearTrigger>
	<TagsInput.HiddenInput />
</TagsInput>

```

> TIP: Double tap each tag to quickly and easily edit in place.

## Custom Icon

Implement any icon of your choosing for the remove action.

```svelte
<script lang="ts">
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
</script>

<TagsInput defaultValue={['Vanilla', 'Chocolate', 'Strawberry']}>
	<TagsInput.Control>
		<TagsInput.Context>
			{#snippet children(tagsInput)}
				{#each tagsInput().value as value, index (index)}
					<TagsInput.Item {value} {index}>
						<TagsInput.ItemPreview>
							<TagsInput.ItemText>{value}</TagsInput.ItemText>
							<TagsInput.ItemDeleteTrigger>
								<CircleXIcon class="size-4" />
							</TagsInput.ItemDeleteTrigger>
						</TagsInput.ItemPreview>
						<TagsInput.ItemInput />
					</TagsInput.Item>
				{/each}
			{/snippet}
		</TagsInput.Context>
		<TagsInput.Input placeholder="Add a flavor..." />
	</TagsInput.Control>
	<TagsInput.HiddenInput />
</TagsInput>

```

## Color

Change the tag color using utility classes or custom CSS variables to match your design system.

```svelte
<script lang="ts">
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
</script>

<TagsInput defaultValue={['Vanilla', 'Chocolate', 'Strawberry']}>
	<TagsInput.Control>
		<TagsInput.Context>
			{#snippet children(tagsInput)}
				{#each tagsInput().value as value, index (index)}
					<TagsInput.Item {value} {index}>
						<TagsInput.ItemPreview class="preset-filled-secondary-500">
							<TagsInput.ItemText>{value}</TagsInput.ItemText>
							<TagsInput.ItemDeleteTrigger />
						</TagsInput.ItemPreview>
						<TagsInput.ItemInput />
					</TagsInput.Item>
				{/each}
			{/snippet}
		</TagsInput.Context>
		<TagsInput.Input placeholder="Add a flavor..." />
	</TagsInput.Control>
	<TagsInput.HiddenInput />
</TagsInput>

```

## Provider Pattern

Use the [Provider Pattern](/docs/\[framework]/get-started/fundamentals#provider-pattern) to gain access to the inner component APIs.

```svelte
<script lang="ts">
	import { TagsInput, useTagsInput } from '@skeletonlabs/skeleton-svelte';

	const id = $props.id();
	const tagsInput = useTagsInput({
		id,
		defaultValue: ['Vanilla', 'Chocolate', 'Strawberry'],
	});
</script>

<div class="w-full space-y-4">
	<TagsInput.Provider value={tagsInput}>
		<TagsInput.Control>
			<TagsInput.Context>
				{#snippet children(tagsInput)}
					{#each tagsInput().value as value, index (index)}
						<TagsInput.Item {value} {index}>
							<TagsInput.ItemPreview>
								<TagsInput.ItemText>{value}</TagsInput.ItemText>
								<TagsInput.ItemDeleteTrigger />
							</TagsInput.ItemPreview>
							<TagsInput.ItemInput />
						</TagsInput.Item>
					{/each}
				{/snippet}
			</TagsInput.Context>
			<TagsInput.Input placeholder="Add a flavor..." />
		</TagsInput.Control>
		<TagsInput.HiddenInput />
	</TagsInput.Provider>

	<!-- Programmatic Controls -->
	<div class="card preset-outlined-surface-200-800 flex justify-center items-center py-4">
		<button class="btn preset-filled" onclick={() => tagsInput().clearValue()}>Clear Tags</button>
	</div>
</div>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
</script>

<TagsInput defaultValue={['Vanilla', 'Chocolate', 'Strawberry']} dir="rtl">
	<TagsInput.Label>Label</TagsInput.Label>
	<TagsInput.Control>
		<TagsInput.Context>
			{#snippet children(tagsInput)}
				{#each tagsInput().value as value, index (index)}
					<TagsInput.Item {value} {index}>
						<TagsInput.ItemPreview>
							<TagsInput.ItemText>{value}</TagsInput.ItemText>
							<TagsInput.ItemDeleteTrigger />
						</TagsInput.ItemPreview>
						<TagsInput.ItemInput />
					</TagsInput.Item>
				{/each}
			{/snippet}
		</TagsInput.Context>
		<TagsInput.Input placeholder="Add a flavor..." />
	</TagsInput.Control>
	<TagsInput.HiddenInput />
</TagsInput>

```

## Anatomy

Here's an overview of how the TagsInput component is structured in code:

```svelte
<script lang="ts">
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
</script>

<TagsInput>
	<TagsInput.Label />
	<TagsInput.Control>
		<TagsInput.Item>
			<TagsInput.ItemPreview>
				<TagsInput.ItemText />
				<TagsInput.ItemDeleteTrigger />
			</TagsInput.ItemPreview>
			<TagsInput.ItemInput />
		</TagsInput.Item>
		<TagsInput.Input />
	</TagsInput.Control>
	<TagsInput.HiddenInput />
	<TagsInput.ClearTrigger />
</TagsInput>
```

## API Reference

### Root

| Prop                 | Description                                                                                                                                         | Type                                                                                                                                                                                                                                                       | Default                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| ids                  | The ids of the elements in the tags input. Useful for composition.                                                                                  | Partial\<\{ root: string; input: string; hiddenInput: string; clearBtn: string; label: string; control: string; item: (opts: ItemProps) => string; itemDeleteTrigger: (opts: ItemProps) => string; itemInput: (opts: ItemProps) => string; }> \| undefined | -                       |
| translations         | Specifies the localized strings that identifies the accessibility elements and their states                                                         | IntlTranslations \| undefined                                                                                                                                                                                                                              | -                       |
| maxLength            | The max length of the input.                                                                                                                        | number \| undefined                                                                                                                                                                                                                                        | -                       |
| delimiter            | The character that serves has:&#xA;- event key to trigger the addition of a new tag&#xA;- character used to split tags when pasting into the input  | string \| RegExp \| undefined                                                                                                                                                                                                                              | ","                     |
| autoFocus            | Whether the input should be auto-focused                                                                                                            | boolean \| undefined                                                                                                                                                                                                                                       | -                       |
| disabled             | Whether the tags input should be disabled                                                                                                           | boolean \| undefined                                                                                                                                                                                                                                       | -                       |
| readOnly             | Whether the tags input should be read-only                                                                                                          | boolean \| undefined                                                                                                                                                                                                                                       | -                       |
| invalid              | Whether the tags input is invalid                                                                                                                   | boolean \| undefined                                                                                                                                                                                                                                       | -                       |
| required             | Whether the tags input is required                                                                                                                  | boolean \| undefined                                                                                                                                                                                                                                       | -                       |
| editable             | Whether a tag can be edited after creation, by pressing \`Enter\` or double clicking.                                                               | boolean \| undefined                                                                                                                                                                                                                                       | true                    |
| inputValue           | The controlled tag input's value                                                                                                                    | string \| undefined                                                                                                                                                                                                                                        | -                       |
| defaultInputValue    | The initial tag input value when rendered.&#xA;Use when you don't need to control the tag input value.                                              | string \| undefined                                                                                                                                                                                                                                        | -                       |
| value                | The controlled tag value                                                                                                                            | string\[] \| undefined                                                                                                                                                                                                                                     | -                       |
| defaultValue         | The initial tag value when rendered.&#xA;Use when you don't need to control the tag value.                                                          | string\[] \| undefined                                                                                                                                                                                                                                     | -                       |
| onValueChange        | Callback fired when the tag values is updated                                                                                                       | ((details: ValueChangeDetails) => void) \| undefined                                                                                                                                                                                                       | -                       |
| onInputValueChange   | Callback fired when the input value is updated                                                                                                      | ((details: InputValueChangeDetails) => void) \| undefined                                                                                                                                                                                                  | -                       |
| onHighlightChange    | Callback fired when a tag is highlighted by pointer or keyboard navigation                                                                          | ((details: HighlightChangeDetails) => void) \| undefined                                                                                                                                                                                                   | -                       |
| onValueInvalid       | Callback fired when the max tag count is reached or the \`validateTag\` function returns \`false\`                                                  | ((details: ValidityChangeDetails) => void) \| undefined                                                                                                                                                                                                    | -                       |
| validate             | Returns a boolean that determines whether a tag can be added.&#xA;Useful for preventing duplicates or invalid tag values.                           | ((details: ValidateArgs) => boolean) \| undefined                                                                                                                                                                                                          | -                       |
| allowDuplicates      | Whether to allow duplicate tags.                                                                                                                    | boolean \| undefined                                                                                                                                                                                                                                       | false                   |
| blurBehavior         | The behavior of the tags input when the input is blurred&#xA;- \`"add"\`: add the input value as a new tag&#xA;- \`"clear"\`: clear the input value | "clear" \| "add" \| undefined                                                                                                                                                                                                                              | -                       |
| addOnPaste           | Whether to add a tag when you paste values into the tag input                                                                                       | boolean \| undefined                                                                                                                                                                                                                                       | false                   |
| max                  | The max number of tags                                                                                                                              | number \| undefined                                                                                                                                                                                                                                        | Infinity                |
| allowOverflow        | Whether to allow tags to exceed max. In this case,&#xA;we'll attach \`data-invalid\` to the root                                                    | boolean \| undefined                                                                                                                                                                                                                                       | -                       |
| sanitizeValue        | Function to sanitize the tag value before adding.&#xA;Useful for trimming whitespace, normalizing case, or stripping special characters.            | ((value: string) => string) \| undefined                                                                                                                                                                                                                   | (value) => value.trim() |
| name                 | The name attribute for the input. Useful for form submissions                                                                                       | string \| undefined                                                                                                                                                                                                                                        | -                       |
| form                 | The associate form of the underlying input element.                                                                                                 | string \| undefined                                                                                                                                                                                                                                        | -                       |
| placeholder          | The placeholder text for the input                                                                                                                  | string \| undefined                                                                                                                                                                                                                                        | -                       |
| dir                  | The document's text/writing direction.                                                                                                              | "ltr" \| "rtl" \| undefined                                                                                                                                                                                                                                | "ltr"                   |
| getRootNode          | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                          | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                                                                        | -                       |
| onPointerDownOutside | Function called when the pointer is pressed down outside the component                                                                              | ((event: PointerDownOutsideEvent) => void) \| undefined                                                                                                                                                                                                    | -                       |
| onFocusOutside       | Function called when the focus is moved outside the component                                                                                       | ((event: FocusOutsideEvent) => void) \| undefined                                                                                                                                                                                                          | -                       |
| onInteractOutside    | Function called when an interaction happens outside the component                                                                                   | ((event: InteractOutsideEvent) => void) \| undefined                                                                                                                                                                                                       | -                       |
| element              | Render the element yourself                                                                                                                         | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                                                                           | -                       |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => TagsInputApi\<PropTypes>                   | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                        | Default |
| -------- | ----------- | ------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => TagsInputApi\<PropTypes>]> | -       |

### Label

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### Control

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Item

| Prop     | Description                 | Type                                              | Default |
| -------- | --------------------------- | ------------------------------------------------- | ------- |
| index    | -                           | string \| number                                  | -       |
| value    | -                           | string                                            | -       |
| disabled | -                           | boolean \| undefined                              | -       |
| element  | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### ItemPreview

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemText

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### ItemDeleteTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### ItemInput

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

### Input

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

### ClearTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### HiddenInput

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

