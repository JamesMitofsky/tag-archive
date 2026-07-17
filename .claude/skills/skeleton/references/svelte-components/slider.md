# Slider

Capture input from a range of values.

```svelte
<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';
</script>

<Slider defaultValue={[50]}>
	<Slider.Label>Label</Slider.Label>
	<Slider.Control>
		<Slider.Track>
			<Slider.Range />
		</Slider.Track>
		<Slider.Thumb index={0}>
			<Slider.HiddenInput />
		</Slider.Thumb>
	</Slider.Control>
	<Slider.MarkerGroup>
		<Slider.Marker value={25} />
		<Slider.Marker value={50} />
		<Slider.Marker value={75} />
	</Slider.MarkerGroup>
</Slider>

```

## Color

Change the track, range, and thumb color using utility classes or custom CSS variables to match your design system.

```svelte
<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="space-y-8 w-full">
	<Slider defaultValue={[50]}>
		<Slider.Control>
			<Slider.Track class="bg-primary-50-950">
				<Slider.Range class="bg-primary-500" />
			</Slider.Track>
			<Slider.Thumb index={0} class="ring-primary-500">
				<Slider.HiddenInput />
			</Slider.Thumb>
		</Slider.Control>
	</Slider>

	<Slider defaultValue={[50]}>
		<Slider.Control>
			<Slider.Track class="bg-secondary-50-950">
				<Slider.Range class="bg-secondary-500" />
			</Slider.Track>
			<Slider.Thumb index={0} class="ring-secondary-500">
				<Slider.HiddenInput />
			</Slider.Thumb>
		</Slider.Control>
	</Slider>

	<Slider defaultValue={[50]}>
		<Slider.Control>
			<Slider.Track class="bg-tertiary-50-950">
				<Slider.Range class="bg-tertiary-500" />
			</Slider.Track>
			<Slider.Thumb index={0} class="ring-tertiary-500">
				<Slider.HiddenInput />
			</Slider.Thumb>
		</Slider.Control>
	</Slider>
</div>

```

## Disabled

Set the `disabled` prop to enable the disabled state.

```svelte
<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';
</script>

<Slider defaultValue={[50]} disabled>
	<Slider.Control>
		<Slider.Track>
			<Slider.Range />
		</Slider.Track>
		<Slider.Thumb index={0}>
			<Slider.HiddenInput />
		</Slider.Thumb>
	</Slider.Control>
</Slider>

```

## Read-Only

Set the `readOnly` prop to enable the disabled state.

```svelte
<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';
</script>

<Slider defaultValue={[50]} readOnly>
	<Slider.Control>
		<Slider.Track>
			<Slider.Range />
		</Slider.Track>
		<Slider.Thumb index={0}>
			<Slider.HiddenInput />
		</Slider.Thumb>
	</Slider.Control>
</Slider>

```

## Multiple Thumbs

Set a `value` array of two values to enable start and end thumbs.

```svelte
<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';
</script>

<Slider defaultValue={[25, 75]}>
	<Slider.Control>
		<Slider.Track>
			<Slider.Range />
		</Slider.Track>
		<Slider.Thumb index={0}>
			<Slider.HiddenInput />
		</Slider.Thumb>
		<Slider.Thumb index={1}>
			<Slider.HiddenInput />
		</Slider.Thumb>
	</Slider.Control>
</Slider>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';
</script>

<Slider defaultValue={[50]} dir="rtl">
	<Slider.Label>Label</Slider.Label>
	<Slider.Control>
		<Slider.Track>
			<Slider.Range />
		</Slider.Track>
		<Slider.Thumb index={0}>
			<Slider.HiddenInput />
		</Slider.Thumb>
	</Slider.Control>
	<Slider.MarkerGroup>
		<Slider.Marker value={25} />
		<Slider.Marker value={50} />
		<Slider.Marker value={75} />
	</Slider.MarkerGroup>
</Slider>

```

## Anatomy

Here's an overview of how the Slider component is structured in code:

```svelte
<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';
</script>

<Slider>
	<Slider.Label />
	<Slider.Control>
		<Slider.Track>
			<Slider.Range />
		</Slider.Track>
		<Slider.Thumb>
			<Slider.HiddenInput />
		</Slider.Thumb>
	</Slider.Control>
	<Slider.MarkerGroup>
		<Slider.Marker />
	</Slider.MarkerGroup>
	<Slider.ValueText />
</Slider>
```

## API Reference

### Root

| Prop                   | Description                                                                                                                                                                                                                                                                                                                               | Type                                                                                                                                                                                                                                    | Default      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| ids                    | The ids of the elements in the slider. Useful for composition.                                                                                                                                                                                                                                                                            | Partial\<\{ root: string; thumb: (index: number) => string; hiddenInput: (index: number) => string; control: string; track: string; range: string; label: string; valueText: string; marker: (index: number) => string; }> \| undefined | -            |
| aria-label             | The aria-label of each slider thumb. Useful for providing an accessible name to the slider                                                                                                                                                                                                                                                | string\[] \| undefined                                                                                                                                                                                                                  | -            |
| aria-labelledby        | The \`id\` of the elements that labels each slider thumb. Useful for providing an accessible name to the slider                                                                                                                                                                                                                           | string\[] \| undefined                                                                                                                                                                                                                  | -            |
| name                   | The name associated with each slider thumb (when used in a form)                                                                                                                                                                                                                                                                          | string \| undefined                                                                                                                                                                                                                     | -            |
| form                   | The associate form of the underlying input element.                                                                                                                                                                                                                                                                                       | string \| undefined                                                                                                                                                                                                                     | -            |
| value                  | The controlled value of the slider                                                                                                                                                                                                                                                                                                        | number\[] \| undefined                                                                                                                                                                                                                  | -            |
| defaultValue           | The initial value of the slider when rendered.&#xA;Use when you don't need to control the value of the slider.                                                                                                                                                                                                                            | number\[] \| undefined                                                                                                                                                                                                                  | -            |
| disabled               | Whether the slider is disabled                                                                                                                                                                                                                                                                                                            | boolean \| undefined                                                                                                                                                                                                                    | -            |
| readOnly               | Whether the slider is read-only                                                                                                                                                                                                                                                                                                           | boolean \| undefined                                                                                                                                                                                                                    | -            |
| invalid                | Whether the slider is invalid                                                                                                                                                                                                                                                                                                             | boolean \| undefined                                                                                                                                                                                                                    | -            |
| onValueChange          | Function invoked when the value of the slider changes                                                                                                                                                                                                                                                                                     | ((details: ValueChangeDetails) => void) \| undefined                                                                                                                                                                                    | -            |
| onValueChangeEnd       | Function invoked when the slider value change is done                                                                                                                                                                                                                                                                                     | ((details: ValueChangeDetails) => void) \| undefined                                                                                                                                                                                    | -            |
| onFocusChange          | Function invoked when the slider's focused index changes                                                                                                                                                                                                                                                                                  | ((details: FocusChangeDetails) => void) \| undefined                                                                                                                                                                                    | -            |
| getAriaValueText       | Function that returns a human readable value for the slider thumb                                                                                                                                                                                                                                                                         | ((details: ValueTextDetails) => string) \| undefined                                                                                                                                                                                    | -            |
| min                    | The minimum value of the slider                                                                                                                                                                                                                                                                                                           | number \| undefined                                                                                                                                                                                                                     | 0            |
| max                    | The maximum value of the slider                                                                                                                                                                                                                                                                                                           | number \| undefined                                                                                                                                                                                                                     | 100          |
| step                   | The step value of the slider                                                                                                                                                                                                                                                                                                              | number \| undefined                                                                                                                                                                                                                     | 1            |
| minStepsBetweenThumbs  | The minimum permitted steps between multiple thumbs.&#xA;&#xA;\`minStepsBetweenThumbs\` \* \`step\` should reflect the gap between the thumbs.&#xA;&#xA;- \`step: 1\` and \`minStepsBetweenThumbs: 10\` => gap is \`10\`&#xA;- \`step: 10\` and \`minStepsBetweenThumbs: 2\` => gap is \`20\`                                             | number \| undefined                                                                                                                                                                                                                     | 0            |
| orientation            | The orientation of the slider                                                                                                                                                                                                                                                                                                             | "vertical" \| "horizontal" \| undefined                                                                                                                                                                                                 | "horizontal" |
| origin                 | The origin of the slider range. The track is filled from the origin&#xA;to the thumb for single values.&#xA;- "start": Useful when the value represents an absolute value&#xA;- "center": Useful when the value represents an offset (relative)&#xA;- "end": Useful when the value represents an offset from the end                      | "start" \| "center" \| "end" \| undefined                                                                                                                                                                                               | "start"      |
| thumbAlignment         | The alignment of the slider thumb relative to the track&#xA;- \`center\`: the thumb will extend beyond the bounds of the slider track.&#xA;- \`contain\`: the thumb will be contained within the bounds of the track.                                                                                                                     | "center" \| "contain" \| undefined                                                                                                                                                                                                      | "contain"    |
| thumbSize              | The slider thumbs dimensions                                                                                                                                                                                                                                                                                                              | \{ width: number; height: number; } \| undefined                                                                                                                                                                                        | -            |
| thumbCollisionBehavior | Controls how thumbs behave when they collide during pointer interactions.&#xA;- \`none\` (default): Thumbs cannot move past each other; excess movement is ignored.&#xA;- \`push\`: Thumbs push each other without restoring their previous positions when dragged back.&#xA;- \`swap\`: Thumbs swap places when dragged past each other. | "none" \| "push" \| "swap" \| undefined                                                                                                                                                                                                 | "none"       |
| dir                    | The document's text/writing direction.                                                                                                                                                                                                                                                                                                    | "ltr" \| "rtl" \| undefined                                                                                                                                                                                                             | "ltr"        |
| getRootNode            | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                                                                                                                                                                                                                | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                                                     | -            |
| element                | Render the element yourself                                                                                                                                                                                                                                                                                                               | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                                                        | -            |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => SliderApi\<PropTypes>                      | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                     | Default |
| -------- | ----------- | ---------------------------------------- | ------- |
| children | -           | Snippet\<\[() => SliderApi\<PropTypes>]> | -       |

### Label

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### ValueText

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"output">]> \| undefined | -       |

### Control

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Track

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Range

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Thumb

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| index   | -                           | number                                           | -       |
| name    | -                           | string \| undefined                              | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### HiddenInput

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

### MarkerGroup

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Marker

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | number                                           | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

