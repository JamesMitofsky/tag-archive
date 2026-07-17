# Progress - Circular

Circular progress indicators for showing task progress.

```svelte
<script lang="ts">
	import { Progress, Slider } from '@skeletonlabs/skeleton-svelte';

	let value = $state(50);
</script>

<div class="flex flex-col gap-8 items-center">
	<!-- Progress -->
	<Progress {value} class="items-center w-fit">
		<Progress.Label>Progress</Progress.Label>
		<Progress.Circle>
			<Progress.CircleTrack />
			<Progress.CircleRange />
		</Progress.Circle>
		<Progress.ValueText />
	</Progress>

	<!-- Control -->
	<Slider class="w-full" value={[value]} onValueChange={(e) => (value = e.value[0])} step={10}>
		<Slider.Control>
			<Slider.Track>
				<Slider.Range class="bg-transparent" />
			</Slider.Track>
			<Slider.Thumb index={0}>
				<Slider.HiddenInput />
			</Slider.Thumb>
		</Slider.Control>
	</Slider>
</div>

```

## Size

Use different sizes for context-appropriate indicators.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="flex gap-4 justify-evenly items-center w-full">
	<Progress value={75} class="w-fit">
		<Progress.Circle class="[--size:--spacing(12)]">
			<Progress.CircleTrack />
			<Progress.CircleRange />
		</Progress.Circle>
	</Progress>
	<Progress value={75} class="w-fit">
		<Progress.Circle>
			<Progress.CircleTrack />
			<Progress.CircleRange />
		</Progress.Circle>
	</Progress>
	<Progress value={75} class="w-fit">
		<Progress.Circle class="[--size:--spacing(32)]">
			<Progress.CircleTrack />
			<Progress.CircleRange />
		</Progress.Circle>
	</Progress>
</div>

```

## Color

Change the track and indicator color using utility classes or custom CSS variables to match your design system.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="flex gap-4 justify-evenly items-center w-full">
	<Progress value={40} class="w-fit">
		<Progress.Circle>
			<Progress.CircleTrack class="stroke-primary-50-950" />
			<Progress.CircleRange class="stroke-primary-500" />
		</Progress.Circle>
	</Progress>
	<Progress value={40} class="w-fit">
		<Progress.Circle>
			<Progress.CircleTrack class="stroke-secondary-50-950" />
			<Progress.CircleRange class="stroke-secondary-500" />
		</Progress.Circle>
	</Progress>
	<Progress value={40} class="w-fit">
		<Progress.Circle>
			<Progress.CircleTrack class="stroke-tertiary-50-950" />
			<Progress.CircleRange class="stroke-tertiary-500" />
		</Progress.Circle>
	</Progress>
</div>

```

## Centered Content

Place content in the center of the circular progress if needed (for example, a numeric value).

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress class="w-fit relative">
	<div class="absolute inset-0 flex items-center justify-center">
		<Progress.ValueText />
	</div>
	<Progress.Circle>
		<Progress.CircleTrack />
		<Progress.CircleRange />
	</Progress.Circle>
</Progress>

```

## Indeterminate

Set a `null` value to enable indeterminate mode.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress class="items-center w-fit" value={null}>
	<Progress.Circle>
		<Progress.CircleTrack />
		<Progress.CircleRange />
	</Progress.Circle>
	<Progress.ValueText />
</Progress>

```

## Format

Use the `format` prop to customize the output of the `ValueText` component. Options include:

* `percentage` (default)
* `decimal` (0.0 - 1.0)
* Custom - via the [Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl).

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="flex gap-4 justify-evenly items-center w-full">
	<Progress class="items-center w-fit" formatOptions={{ style: 'percent' }}>
		<Progress.Circle>
			<Progress.CircleTrack />
			<Progress.CircleRange />
		</Progress.Circle>
		<Progress.ValueText />
	</Progress>
	<Progress class="items-center w-fit" formatOptions={{ style: 'decimal' }}>
		<Progress.Circle>
			<Progress.CircleTrack />
			<Progress.CircleRange />
		</Progress.Circle>
		<Progress.ValueText />
	</Progress>
	<Progress class="items-center w-fit" formatOptions={{ style: 'currency', currency: 'EUR' }}>
		<Progress.Circle>
			<Progress.CircleTrack />
			<Progress.CircleRange />
		</Progress.Circle>
		<Progress.ValueText />
	</Progress>
</div>

```

## Custom Value Text

Provide a custom renderer for the `ValueText` if you need to show a different layout or label.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress class="items-center w-fit">
	<Progress.Circle>
		<Progress.CircleTrack />
		<Progress.CircleRange />
	</Progress.Circle>
	<Progress.ValueText>
		<Progress.Context>
			{#snippet children(progress)}
				{progress().value} of {progress().max}
			{/snippet}
		</Progress.Context>
	</Progress.ValueText>
</Progress>

```

## Anatomy

Here's an overview of how the Progress (Circular) component is structured in code:

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress>
	<Progress.Label />
	<Progress.Circle>
		<Progress.CircleTrack />
		<Progress.CircleRange />
	</Progress.Circle>
	<Progress.ValueText />
</Progress>
```

## API Reference

### Root

| Prop          | Description                                                                                                                | Type                                                                                    | Default               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------- |
| ids           | The ids of the elements in the progress bar. Useful for composition.                                                       | Partial\<\{ root: string; track: string; label: string; circle: string; }> \| undefined | -                     |
| value         | The controlled value of the progress bar.                                                                                  | number \| null \| undefined                                                             | -                     |
| defaultValue  | The initial value of the progress bar when rendered.&#xA;Use when you don't need to control the value of the progress bar. | number \| null \| undefined                                                             | 50                    |
| min           | The minimum allowed value of the progress bar.                                                                             | number \| undefined                                                                     | 0                     |
| max           | The maximum allowed value of the progress bar.                                                                             | number \| undefined                                                                     | 100                   |
| translations  | The localized messages to use.                                                                                             | IntlTranslations \| undefined                                                           | -                     |
| onValueChange | Callback fired when the value changes.                                                                                     | ((details: ValueChangeDetails) => void) \| undefined                                    | -                     |
| formatOptions | The options to use for formatting the value.                                                                               | NumberFormatOptions \| undefined                                                        | \{ style: "percent" } |
| locale        | The locale to use for formatting the value.                                                                                | string \| undefined                                                                     | "en-US"               |
| dir           | The document's text/writing direction.                                                                                     | "ltr" \| "rtl" \| undefined                                                             | "ltr"                 |
| getRootNode   | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                 | (() => ShadowRoot \| Node \| Document) \| undefined                                     | -                     |
| orientation   | The orientation of the element.                                                                                            | "horizontal" \| "vertical" \| undefined                                                 | "horizontal"          |
| element       | Render the element yourself                                                                                                | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                        | -                     |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => ProgressApi\<PropTypes>                    | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                       | Default |
| -------- | ----------- | ------------------------------------------ | ------- |
| children | -           | Snippet\<\[() => ProgressApi\<PropTypes>]> | -       |

### Label

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ValueText

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### Track

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Range

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Circle

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"svg">]> \| undefined | -       |

### CircleTrack

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"circle">]> \| undefined | -       |

### CircleRange

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"circle">]> \| undefined | -       |

