# Progress - Linear

An indicator showing the progress or completion of a task.

```svelte
<script lang="ts">
	import { Progress, Slider } from '@skeletonlabs/skeleton-svelte';

	let value = $state(75);
</script>

<div class="w-full space-y-8">
	<!-- Progress -->
	<Progress {value} class="grid grid-cols-[auto_1fr] items-center gap-4">
		<Progress.Label class="text-sm">{value}%</Progress.Label>
		<Progress.Track>
			<Progress.Range />
		</Progress.Track>
	</Progress>

	<!-- Controls -->
	<Slider class="w-32 mx-auto" value={[value]} onValueChange={(e) => (value = e.value[0])} step={10}>
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

## Color

Change the track and range color using utility classes or custom CSS variables to match your design system.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="flex w-full flex-col gap-8">
	<Progress>
		<Progress.Track class="bg-primary-50-950">
			<Progress.Range class="bg-primary-500" />
		</Progress.Track>
	</Progress>
	<Progress>
		<Progress.Track class="bg-secondary-50-950">
			<Progress.Range class="bg-secondary-500" />
		</Progress.Track>
	</Progress>
	<Progress>
		<Progress.Track class="bg-tertiary-50-950">
			<Progress.Range class="bg-tertiary-500" />
		</Progress.Track>
	</Progress>
</div>

```

## Height

Create variations using different heights.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="flex w-full flex-col gap-8">
	<Progress>
		<Progress.Track class="h-1">
			<Progress.Range />
		</Progress.Track>
	</Progress>
	<Progress>
		<Progress.Track class="h-4">
			<Progress.Range />
		</Progress.Track>
	</Progress>
	<Progress>
		<Progress.Track class="h-6">
			<Progress.Range />
		</Progress.Track>
	</Progress>
</div>

```

## Orientation

Using the `orientation` prop to control the layout.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress orientation="vertical">
	<Progress.Track>
		<Progress.Range />
	</Progress.Track>
</Progress>

```

## Indeterminate

Set a `null` value to enable indeterminate mode.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress value={null}>
	<Progress.Track>
		<Progress.Range />
	</Progress.Track>
</Progress>

```

Use CSS to enable custom animations.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress value={null}>
	<Progress.Track>
		<Progress.Range class="animate-[custom-animation_2s_ease-in-out_infinite]" />
	</Progress.Track>
</Progress>

<style>
	@keyframes -global-custom-animation {
		from {
			scale: 0.5 1;
			transform: translateX(-200%);
		}
		25% {
			transform: translateX(50%);
		}
		50% {
			transform: translateX(-50%);
		}
		75% {
			transform: translateX(150%);
		}
		to {
			scale: 0.5 1;
			transform: translateX(200%);
		}
	}
</style>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress dir="rtl">
	<Progress.Label>Label</Progress.Label>
	<Progress.Track>
		<Progress.Range />
	</Progress.Track>
</Progress>

```

## Native Alternative

Skeleton also provides styles for the native [Progress](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/progress) element.

```svelte
<progress class="progress" value="50" max="100"></progress>

```

## Anatomy

Here's an overview of how the Progress (Linear) component is structured in code:

```svelte
<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress>
	<Progress.Label />
	<Progress.Track>
		<Progress.Range />
	</Progress.Track>
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

