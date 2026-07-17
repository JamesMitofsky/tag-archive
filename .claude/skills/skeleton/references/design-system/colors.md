# Colors

The Skeleton color system.

Skeleton provides guardrails and utilities to help you craft your custom color system. This includes a number of colors, shades, and contrast values that work together seamlessly, providing a visually appealing and accessible palette for each theme.

## Color Palette

<Default />

Supports <u>all</u> Tailwind color utility classes using the following pattern.

```txt
{property}-{color}-{shade}
```

\| Key      | Accepted Values                                                                                                  |
\| -------- | ---------------------------------------------------------------------------------------------------------------- |
\| Property | `accent`, `bg`, `border`, `caret`, `decoration`, `divide`, `fill`, `outline`, `ring`, `shadow`, `stroke`, `text` |
\| Color    | `primary`, `secondary`, `tertiary`, `success`, `warning`, `error`, `surface`                                     |
\| Shade    | `50`, `100`, `200`, `300`, `400`, `500`, `600`, `700`, `800`, `900`, `950`                                       |

```html
<div class="bg-primary-500">...</div>
<div class="border border-secondary-600">...</div>
<svg class="fill-surface-950">...</svg>
```

***

## Contrast Colors

Test the following with different themes and dark mode combinations.

```astro
---
import { SwatchBookIcon } from 'lucide-react';
---

<section class="space-y-8">
	<div class="grid grid-cols-3 gap-6">
		<!-- Standard Colors -->
		<div class="flex flex-col space-y-2">
			<p class="text-xs">Direct Use</p>
			<div class="badge justify-start bg-primary-500 text-primary-contrast-500">
				<SwatchBookIcon className="size-4" />
				<span>Primary</span>
			</div>
			<div class="badge justify-start bg-secondary-500 text-secondary-contrast-500">
				<SwatchBookIcon className="size-4" />
				<span>Secondary</span>
			</div>
			<div class="badge justify-start bg-tertiary-500 text-tertiary-contrast-500">
				<SwatchBookIcon className="size-4" />
				<span>Tertiary</span>
			</div>
		</div>
		<!-- Presets -->
		<div class="flex flex-col space-y-2">
			<p class="text-xs">Presets</p>
			<div class="badge justify-start preset-filled-primary-950-50">
				<SwatchBookIcon className="size-4" />
				<span>Primary</span>
			</div>
			<div class="badge justify-start preset-filled-secondary-950-50">
				<SwatchBookIcon className="size-4" />
				<span>Secondary</span>
			</div>
			<div class="badge justify-start preset-filled-tertiary-950-50">
				<SwatchBookIcon className="size-4" />
				<span>Tertiary</span>
			</div>
		</div>
		<!-- Preset + Pairings -->
		<div class="flex flex-col space-y-2">
			<p class="text-xs">Preset + Pairings</p>
			<div class="badge justify-start preset-filled-primary-50-950">
				<SwatchBookIcon className="size-4" />
				<span>Primary</span>
			</div>
			<div class="badge justify-start preset-filled-secondary-50-950">
				<SwatchBookIcon className="size-4" />
				<span>Secondary</span>
			</div>
			<div class="badge justify-start preset-filled-tertiary-50-950">
				<SwatchBookIcon className="size-4" />
				<span>Tertiary</span>
			</div>
		</div>
	</div>
</section>

```

Contrast color values are available for every shade in the color ramp. Use these to set accessible text color and icon fill values. You may also refer to the [Preset system](/docs/\[framework]/tailwind-utilities/presets) for utility classes that automatically mix each color and contrast tone.

```txt
{property}-{color}-contrast-{shade}
```

***

## Color Pairings

<Pairings />

Provides a condensed syntax for dual-tone color values, evenly balanced to swap between light and dark mode. Pairings are supported for all Tailwind utility color classes (`bg`, `border`, `fill`, etc).

```txt
{property}-{color}-{lightModeShade}-{darkModeShade}
```

```html
<div class="bg-surface-200-800">...</div>
<div class="border border-secondary-400-600">...</div>
<svg class="fill-secondary-50-950">...</svg>
```

### How Pairings Work

Color Pairings are enabled through the use of the CSS [light-dark](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) function. This means instead of writing the standard light/dark syntax with Tailwind utilities:

```html
<div class="text-primary-300 dark:text-primary-700">...</div>
```

Skeleton provides utility classes that condense this into a single class:

```html
<div class="text-primary-300-700">...</div>
```

When implemented in your CSS bundle, this will be generated as follows:

```css
.text-primary-300-700 {
	color: light-dark(var(--color-primary-300), var(--color-primary-700));
}
```

The use of the CSS `light-dark()` function enables use of [Tailwind's Color Scheme](https://tailwindcss.com/docs/color-scheme) utilities. Refer to [Color Scheme](/docs/guides/mode#color-scheme) to learn how to use this within your Skeleton application.

### When to Use Pairings

Color Pairings are useful for generating a hierarchy of visual layers, ranging from foreground to background elements. Each reuse the same color ramp, but invert the order when switching from light to dark mode.

<PairingsStack />

* We can use shade `950` for light mode and `50` for dark mode to represent our body text color.
* Then use shade `50` for light mode and `950` for dark mode to represent our app background.
* Use the static `500` shade for key branding elements, such as buttons or banners.
* Then reserve multiple layers between for elements such as cards, inputs, and more.

***

## Brand Color

A variable accent color for your design system. Use this as the default color value when styling elements and components.

> TIP: The **Nouveau** theme makes use of variable brand color for light and dark modes.

```astro
---
import { SwatchBookIcon } from 'lucide-react';
---

<div class="w-full grid grid-cols-[1fr_auto_auto_auto] items-stretch gap-4">
	<div class="card p-4 text-center bg-brand-light dark:bg-brand-dark text-brand-contrast-light dark:text-brand-contrast-dark">
		<div class="flex justify-center items-center gap-2">
			<SwatchBookIcon className="size-4" />
			<span>Brand Color</span>
		</div>
	</div>
	<span class="vr"></span>
	<div class="card p-4 text-center bg-brand-light text-brand-contrast-light">Light</div>
	<div class="card p-4 text-center bg-brand-dark text-brand-contrast-dark">Dark</div>
</div>

```

### Benefits

* Brand utilizes any color from your theme palette (ex: primary/secondary/tertiary).
* Brand can use any shade from 50-950; it is not limited to shade 500.
* Brand color/shade can be tailored for light and dark mode independently.
* Brand includes a contrast color for foreground elements.
* Brand supports all standard [presets](/docs/svelte/tailwind-utilities/presets) (`preset-filled-brand`, `preset-outlined-brand`, `preset-tonal-brand`)

***

## Transparency

All available Skeleton Colors and Color Pairings support Tailwind's color transparency syntax.

```html
<div class="bg-primary-500/25">Primary Color @ 25% transparency</div>
<div class="bg-surface-50-950/60">Surface Pairing 50/950 @ 60% transparency</div>
```

***

## Core API

For more information on theme properties, please refer to the [Core API](/docs/\[framework]/get-started/core-api) documentation.

