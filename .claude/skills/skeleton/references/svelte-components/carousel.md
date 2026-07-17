# Carousel

Navigate through a collection of slides with controls and indicators.

```svelte
<script lang="ts">
	import { Carousel } from '@skeletonlabs/skeleton-svelte';

	const slides = [
		{ title: 'Slide 1' },
		{ title: 'Slide 2' },
		{ title: 'Slide 3' },
		{ title: 'Slide 4' },
		{ title: 'Slide 5' },
		{ title: 'Slide 6' },
		{ title: 'Slide 7' },
		{ title: 'Slide 8' },
		{ title: 'Slide 9' },
		{ title: 'Slide 10' },
	];
</script>

<Carousel slideCount={slides.length} slidesPerPage={3} spacing="16px" loop>
	<Carousel.Control class="flex justify-between mb-4">
		<Carousel.PrevTrigger class="btn preset-filled">
			<span>&larr;</span>
			<span>Back</span>
		</Carousel.PrevTrigger>
		<Carousel.AutoplayTrigger class="btn preset-tonal">Toggle Autoplay</Carousel.AutoplayTrigger>
		<Carousel.NextTrigger class="btn preset-filled">
			<span>Next</span>
			<span>&rarr;</span>
		</Carousel.NextTrigger>
	</Carousel.Control>
	<Carousel.ItemGroup>
		{#each slides as slide, i}
			<Carousel.Item index={i} class="card bg-surface-100-900 h-50 p-4 flex justify-center items-center">
				{slide.title}
			</Carousel.Item>
		{/each}
	</Carousel.ItemGroup>
	<Carousel.IndicatorGroup>
		<Carousel.Context>
			{#snippet children(carousel)}
				{#each carousel().pageSnapPoints as _, index}
					<Carousel.Indicator {index} />
				{/each}
			{/snippet}
		</Carousel.Context>
	</Carousel.IndicatorGroup>
</Carousel>

```

Breaking convention in Skeleton, some portions of this component are provided “headless”. Meaning no default styles are applied out of the box. This ensures you retain full control of styling for maximum flexibility.

## Overlapping Controls

Introduce supporting elements and styles to implement this variation.

```svelte
<script lang="ts">
	import { Carousel } from '@skeletonlabs/skeleton-svelte';

	const slides = [
		{ title: 'Slide 1' },
		{ title: 'Slide 2' },
		{ title: 'Slide 3' },
		{ title: 'Slide 4' },
		{ title: 'Slide 5' },
		{ title: 'Slide 6' },
		{ title: 'Slide 7' },
		{ title: 'Slide 8' },
		{ title: 'Slide 9' },
		{ title: 'Slide 10' },
	];
</script>

<Carousel slideCount={slides.length} slidesPerPage={4} spacing="16px" padding="48px" autoSize loop>
	<div class="relative">
		<Carousel.Control>
			<Carousel.PrevTrigger class="btn-icon preset-filled rounded-full absolute top-[50%] left-0 translate-y-[-50%]">
				<span>&larr;</span>
			</Carousel.PrevTrigger>
			<Carousel.NextTrigger class="btn-icon preset-filled rounded-full absolute top-[50%] right-0 translate-y-[-50%]">
				<span>&rarr;</span>
			</Carousel.NextTrigger>
		</Carousel.Control>
		<Carousel.ItemGroup>
			{#each slides as slide, i}
				<Carousel.Item index={i} class="card bg-surface-100-900 h-50 aspect-square p-4 flex justify-center items-center">
					{slide.title}
				</Carousel.Item>
			{/each}
		</Carousel.ItemGroup>
	</div>
	<Carousel.IndicatorGroup>
		<Carousel.Context>
			{#snippet children(carousel)}
				{#each carousel().pageSnapPoints as _, index}
					<Carousel.Indicator {index} />
				{/each}
			{/snippet}
		</Carousel.Context>
	</Carousel.IndicatorGroup>
</Carousel>

```

## Orientation

Apply `orientation="vertical"` on the root, and apply a set height on the `<Carousel.ItemGroup>`.

```svelte
<script lang="ts">
	import { Carousel } from '@skeletonlabs/skeleton-svelte';

	const slides = [
		{ title: 'Slide 1' },
		{ title: 'Slide 2' },
		{ title: 'Slide 3' },
		{ title: 'Slide 4' },
		{ title: 'Slide 5' },
		{ title: 'Slide 6' },
		{ title: 'Slide 7' },
		{ title: 'Slide 8' },
		{ title: 'Slide 9' },
		{ title: 'Slide 10' },
	];
</script>

<Carousel slideCount={slides.length} slidesPerPage={3} spacing="16px" loop orientation="vertical" autoSize>
	<Carousel.Control class="flex justify-between mb-4">
		<Carousel.PrevTrigger class="btn preset-filled">
			<span>&larr;</span>
			<span>Back</span>
		</Carousel.PrevTrigger>
		<Carousel.AutoplayTrigger class="btn preset-tonal">Toggle Autoplay</Carousel.AutoplayTrigger>
		<Carousel.NextTrigger class="btn preset-filled">
			<span>Next</span>
			<span>&rarr;</span>
		</Carousel.NextTrigger>
	</Carousel.Control>
	<Carousel.ItemGroup class="h-80">
		{#each slides as slide, i}
			<Carousel.Item index={i} class="card bg-surface-100-900/90 h-32 p-4 flex justify-center items-center">
				{slide.title}
			</Carousel.Item>
		{/each}
	</Carousel.ItemGroup>
	<Carousel.IndicatorGroup>
		<Carousel.Context>
			{#snippet children(carousel)}
				{#each carousel().pageSnapPoints as _, index}
					<Carousel.Indicator {index} />
				{/each}
			{/snippet}
		</Carousel.Context>
	</Carousel.IndicatorGroup>
</Carousel>

```

## Text

Display a text display of the carousel state.

```svelte
<script lang="ts">
	import { Carousel } from '@skeletonlabs/skeleton-svelte';

	const slides = [
		{ title: 'Slide 1' },
		{ title: 'Slide 2' },
		{ title: 'Slide 3' },
		{ title: 'Slide 4' },
		{ title: 'Slide 5' },
		{ title: 'Slide 6' },
		{ title: 'Slide 7' },
		{ title: 'Slide 8' },
		{ title: 'Slide 9' },
		{ title: 'Slide 10' },
	];
</script>

<Carousel slideCount={slides.length} slidesPerPage={3} spacing="16px" loop>
	<Carousel.Control class="flex justify-between mb-4">
		<Carousel.PrevTrigger class="btn preset-filled">
			<span>&larr;</span>
			<span>Back</span>
		</Carousel.PrevTrigger>
		<Carousel.AutoplayTrigger class="btn preset-tonal">Toggle Autoplay</Carousel.AutoplayTrigger>
		<Carousel.NextTrigger class="btn preset-filled">
			<span>Next</span>
			<span>&rarr;</span>
		</Carousel.NextTrigger>
	</Carousel.Control>
	<Carousel.ItemGroup>
		{#each slides as slide, i}
			<Carousel.Item index={i} class="card bg-surface-100-900 h-50 p-4 flex justify-center items-center">
				{slide.title}
			</Carousel.Item>
		{/each}
	</Carousel.ItemGroup>
	<Carousel.ProgressText class="mt-4 text-center font-bold">
		<Carousel.Context>
			{#snippet children(carousel)}
				<p>Showing {carousel().page + 1} of {carousel().pageSnapPoints.length}</p>
			{/snippet}
		</Carousel.Context>
	</Carousel.ProgressText>
</Carousel>

```

## Anatomy

Here's an overview of how the Carousel component is structured in code:

```svelte
<script lang="ts">
	import { Carousel } from '@skeletonlabs/skeleton-svelte';
</script>

<Carousel>
	<Carousel.Control>
		<Carousel.PrevTrigger />
		<Carousel.AutoplayTrigger />
		<Carousel.NextTrigger />
	</Carousel.Control>
	<Carousel.ItemGroup>
		<Carousel.Item />
	</Carousel.ItemGroup>
	<Carousel.IndicatorGroup>
		<Carousel.Indicator />
	</Carousel.IndicatorGroup>
	<Carousel.ProgressText />
</Carousel>
```

## API Reference

### Root

| Prop                   | Description                                                                                                                                                  | Type                                                                                                                                                                                                  | Default      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| ids                    | The ids of the elements in the carousel. Useful for composition.                                                                                             | Partial\<\{ root: string; item: (index: number) => string; itemGroup: string; nextTrigger: string; prevTrigger: string; indicatorGroup: string; indicator: (index: number) => string; }> \| undefined | -            |
| translations           | The localized messages to use.                                                                                                                               | IntlTranslations \| undefined                                                                                                                                                                         | -            |
| slidesPerPage          | The number of slides to show at a time.                                                                                                                      | number \| undefined                                                                                                                                                                                   | 1            |
| autoSize               | Whether to enable variable width slides.                                                                                                                     | boolean \| undefined                                                                                                                                                                                  | false        |
| slidesPerMove          | The number of slides to scroll at a time.&#xA;&#xA;When set to \`auto\`, the number of slides to scroll is determined by the&#xA;\`slidesPerPage\` property. | number \| "auto" \| undefined                                                                                                                                                                         | "auto"       |
| autoplay               | Whether to scroll automatically. The default delay is 4000ms.                                                                                                | boolean \| \{ delay: number; } \| undefined                                                                                                                                                           | false        |
| allowMouseDrag         | Whether to allow scrolling via dragging with mouse                                                                                                           | boolean \| undefined                                                                                                                                                                                  | false        |
| loop                   | Whether the carousel should loop around.                                                                                                                     | boolean \| undefined                                                                                                                                                                                  | false        |
| page                   | The controlled page of the carousel.                                                                                                                         | number \| undefined                                                                                                                                                                                   | -            |
| defaultPage            | The initial page to scroll to when rendered.&#xA;Use when you don't need to control the page of the carousel.                                                | number \| undefined                                                                                                                                                                                   | 0            |
| spacing                | The amount of space between items.                                                                                                                           | string \| undefined                                                                                                                                                                                   | "0px"        |
| padding                | Defines the extra space added around the scrollable area,&#xA;enabling nearby items to remain partially in view.                                             | string \| undefined                                                                                                                                                                                   | -            |
| onPageChange           | Function called when the page changes.                                                                                                                       | ((details: PageChangeDetails) => void) \| undefined                                                                                                                                                   | -            |
| inViewThreshold        | The threshold for determining if an item is in view.                                                                                                         | number \| number\[] \| undefined                                                                                                                                                                      | 0.6          |
| snapType               | The snap type of the item.                                                                                                                                   | "proximity" \| "mandatory" \| undefined                                                                                                                                                               | "mandatory"  |
| slideCount             | The total number of slides.&#xA;Useful for SSR to render the initial ating the snap points.                                                                  | number                                                                                                                                                                                                | -            |
| onDragStatusChange     | Function called when the drag status changes.                                                                                                                | ((details: DragStatusDetails) => void) \| undefined                                                                                                                                                   | -            |
| onAutoplayStatusChange | Function called when the autoplay status changes.                                                                                                            | ((details: AutoplayStatusDetails) => void) \| undefined                                                                                                                                               | -            |
| dir                    | The document's text/writing direction.                                                                                                                       | "ltr" \| "rtl" \| undefined                                                                                                                                                                           | "ltr"        |
| getRootNode            | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                                   | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                   | -            |
| orientation            | The orientation of the element.                                                                                                                              | "horizontal" \| "vertical" \| undefined                                                                                                                                                               | "horizontal" |
| element                | Render the element yourself                                                                                                                                  | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                      | -            |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => CarouselApi\<PropTypes>                    | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                       | Default |
| -------- | ----------- | ------------------------------------------ | ------- |
| children | -           | Snippet\<\[() => CarouselApi\<PropTypes>]> | -       |

### Control

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemGroup

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Item

| Prop      | Description                     | Type                                             | Default |
| --------- | ------------------------------- | ------------------------------------------------ | ------- |
| index     | The index of the item.          | number                                           | -       |
| snapAlign | The snap alignment of the item. | "start" \| "end" \| "center" \| undefined        | "start" |
| element   | Render the element yourself     | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### PrevTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### NextTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### AutoplayTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### IndicatorGroup

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Indicator

| Prop     | Description                         | Type                                                | Default |
| -------- | ----------------------------------- | --------------------------------------------------- | ------- |
| index    | The index of the indicator.         | number                                              | -       |
| readOnly | Whether the indicator is read only. | boolean \| undefined                                | false   |
| element  | Render the element yourself         | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### ProgressText

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

