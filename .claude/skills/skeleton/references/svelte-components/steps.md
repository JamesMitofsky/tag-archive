# Steps

Use steps to guide users through a multi-step process.

```svelte
<script lang="ts">
	import { Steps } from '@skeletonlabs/skeleton-svelte';

	const steps = [
		{ title: 'First', content: 'First do this.' },
		{ title: 'Then', content: 'Then do that.' },
		{ title: 'Finally', content: 'Almost done...' },
	];
</script>

<Steps count={steps.length} class="w-full">
	<Steps.List>
		{#each steps as item, index}
			<Steps.Item {index}>
				<Steps.Trigger>
					<Steps.Indicator>{index + 1}</Steps.Indicator>
					{item.title}
				</Steps.Trigger>
				{#if index < steps.length - 1}
					<Steps.Separator />
				{/if}
			</Steps.Item>
		{/each}
	</Steps.List>
	{#each steps as item, index}
		<Steps.Content {index} class="card preset-filled-surface-100-900 p-4 flex justify-center items-center">
			{item.content}
		</Steps.Content>
	{/each}
	<Steps.Content index={steps.length} class="card preset-filled-surface-100-900 p-4 flex justify-center items-center"
		>All done!</Steps.Content
	>
	<div class="flex justify-between items-center gap-2">
		<Steps.PrevTrigger class="btn preset-filled">Back</Steps.PrevTrigger>
		<Steps.NextTrigger class="btn preset-filled">Next</Steps.NextTrigger>
	</div>
</Steps>

```

## Controlled

Use the `step` and `onStepChange` props to control state programmatically.

```svelte
<script lang="ts">
	import { Steps } from '@skeletonlabs/skeleton-svelte';

	const steps = [
		{ title: 'First', content: 'First do this.' },
		{ title: 'Then', content: 'Then do that.' },
		{ title: 'Finally', content: 'Almost done...' },
	];

	let step = $state(0);
</script>

<Steps {step} onStepChange={(details) => (step = details.step)} count={steps.length} class="w-full">
	<Steps.List>
		{#each steps as item, index}
			<Steps.Item {index}>
				<Steps.Trigger>
					<Steps.Indicator>{index + 1}</Steps.Indicator>
					{item.title}
				</Steps.Trigger>
				{#if index < steps.length - 1}
					<Steps.Separator />
				{/if}
			</Steps.Item>
		{/each}
	</Steps.List>
	{#each steps as item, index}
		<Steps.Content {index} class="card preset-filled-surface-100-900 p-4 flex justify-center items-center">
			{item.content}
		</Steps.Content>
	{/each}
	<Steps.Content index={steps.length} class="card preset-filled-surface-100-900 p-4 flex justify-center items-center"
		>All done!</Steps.Content
	>
	<div class="flex justify-between items-center gap-2">
		<Steps.PrevTrigger class="btn preset-filled">Back</Steps.PrevTrigger>
		<Steps.NextTrigger class="btn preset-filled">Next</Steps.NextTrigger>
	</div>
</Steps>

```

## Orientation

Using the `orientation` prop to control the layout.

```svelte
<script lang="ts">
	import { Steps } from '@skeletonlabs/skeleton-svelte';

	const steps = [
		{ title: 'First', content: 'First do this.' },
		{ title: 'Then', content: 'Then do that.' },
		{ title: 'Finally', content: 'Almost done...' },
	];
</script>

<Steps orientation="vertical" count={steps.length} class="w-full h-48">
	<Steps.List>
		{#each steps as item, index}
			<Steps.Item {index}>
				<Steps.Trigger>
					<Steps.Indicator>{index + 1}</Steps.Indicator>
					{item.title}
				</Steps.Trigger>
				{#if index < steps.length - 1}
					<Steps.Separator />
				{/if}
			</Steps.Item>
		{/each}
	</Steps.List>
	<div class="flex flex-col grow gap-4">
		{#each steps as item, index}
			<Steps.Content {index} class="card preset-filled-surface-100-900 p-4 flex justify-center items-center grow">
				{item.content}
			</Steps.Content>
		{/each}
		<Steps.Content index={steps.length} class="card preset-filled-surface-100-900 p-4 flex justify-center items-center grow"
			>All done!</Steps.Content
		>
		<div class="flex justify-between items-center gap-2">
			<Steps.PrevTrigger class="btn preset-filled">Back</Steps.PrevTrigger>
			<Steps.NextTrigger class="btn preset-filled">Next</Steps.NextTrigger>
		</div>
	</div>
</Steps>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Steps } from '@skeletonlabs/skeleton-svelte';

	const steps = [
		{ title: 'First', content: 'First do this.' },
		{ title: 'Then', content: 'Then do that.' },
		{ title: 'Finally', content: 'Almost done...' },
	];
</script>

<Steps dir="rtl" count={steps.length} class="w-full">
	<Steps.List>
		{#each steps as item, index}
			<Steps.Item {index}>
				<Steps.Trigger>
					<Steps.Indicator>{index + 1}</Steps.Indicator>
					{item.title}
				</Steps.Trigger>
				{#if index < steps.length - 1}
					<Steps.Separator />
				{/if}
			</Steps.Item>
		{/each}
	</Steps.List>
	{#each steps as item, index}
		<Steps.Content {index} class="card preset-filled-surface-100-900 p-4 flex justify-center items-center">
			{item.content}
		</Steps.Content>
	{/each}
	<Steps.Content index={steps.length} class="card preset-filled-surface-100-900 p-4 flex justify-center items-center"
		>All done!</Steps.Content
	>
	<div class="flex justify-between items-center gap-2">
		<Steps.PrevTrigger class="btn preset-filled">Back</Steps.PrevTrigger>
		<Steps.NextTrigger class="btn preset-filled">Next</Steps.NextTrigger>
	</div>
</Steps>

```

## Anatomy

Here's an overview of how the Steps component is structured in code:

```svelte
<script lang="ts">
	import { Steps } from '@skeletonlabs/skeleton-svelte';
</script>

<Steps>
	<Steps.List>
		<Steps.Item>
			<Steps.Trigger>
				<Steps.Indicator />
			</Steps.Trigger>
			<Steps.Separator />
		</Steps.Item>
	</Steps.List>
	<Steps.Content />
	<Steps.PrevTrigger />
	<Steps.NextTrigger />
</Steps>
```

## API Reference

### Root

| Prop            | Description                                                                                                      | Type                                                 | Default      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| ids             | The custom ids for the stepper elements                                                                          | ElementIds \| undefined                              | -            |
| step            | The controlled value of the stepper                                                                              | number \| undefined                                  | -            |
| defaultStep     | The initial value of the stepper when rendered.&#xA;Use when you don't need to control the value of the stepper. | number \| undefined                                  | -            |
| onStepChange    | Callback to be called when the value changes                                                                     | ((details: StepChangeDetails) => void) \| undefined  | -            |
| onStepComplete  | Callback to be called when a step is completed                                                                   | VoidFunction \| undefined                            | -            |
| linear          | If \`true\`, the stepper requires the user to complete the steps in order                                        | boolean \| undefined                                 | -            |
| orientation     | The orientation of the stepper                                                                                   | "horizontal" \| "vertical" \| undefined              | "horizontal" |
| count           | The total number of steps                                                                                        | number \| undefined                                  | -            |
| isStepValid     | Whether a step is valid. Invalid steps block forward navigation in linear mode.                                  | ((index: number) => boolean) \| undefined            | () => true   |
| isStepSkippable | Whether a step can be skipped during navigation.&#xA;Skippable steps are bypassed when using next/prev.          | ((index: number) => boolean) \| undefined            | () => false  |
| onStepInvalid   | Called when navigation is blocked due to an invalid step.                                                        | ((details: StepInvalidDetails) => void) \| undefined | -            |
| dir             | The document's text/writing direction.                                                                           | "ltr" \| "rtl" \| undefined                          | "ltr"        |
| getRootNode     | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                       | (() => ShadowRoot \| Node \| Document) \| undefined  | -            |
| element         | Render the element yourself                                                                                      | Snippet\<\[HTMLAttributes\<"div">]> \| undefined     | -            |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => StepsApi\<PropTypes>                       | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                    | Default |
| -------- | ----------- | --------------------------------------- | ------- |
| children | -           | Snippet\<\[() => StepsApi\<PropTypes>]> | -       |

### List

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Item

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| index   | -                           | number                                           | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Trigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Indicator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Separator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Content

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| index   | -                           | number                                           | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### PrevTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### NextTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

