# Dark Mode

Learn how to use Tailwind's dark mode feature for your Skeleton project.

Skeleton makes use of Tailwind's Dark Mode to enable multiple strategies for controlling the overall app or page mode, as well as Color Scheme to selectively toggle light or dark interfaces at any scope.

## Strategies

Tailwind provides [multiple strategies](https://tailwindcss.com/docs/dark-mode) for configuring Dark Mode.

### Media Strategy

Enabled by default. Uses CSS's [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme) and sets the active mode based on operating system settings.

### Selector Strategy

Activates dark mode by adding or removing the `.dark` class to your application's `<html>` element.

```css
@custom-variant dark (&:where(.dark, .dark *));
```

```html
<html class="dark">
	<!-- ... -->
</html>
```

### Data Attribute Strategy

Uses a data attribute instead of a class to activate dark mode.

```css
@custom-variant dark (&:where([data-mode=dark], [data-mode=dark] *));
```

```html
<html data-mode="dark">
	<!-- ... -->
</html>
```

***

## Dark Variant

Apply any base style, then override for dark mode using Tailwind's `dark:` variant.

```html
<!-- Light Mode: White | Dark Mode: Black -->
<div class="bg-white dark:bg-black">...</div>
```

## Color Scheme

Skeleton supports Tailwind's [Color Scheme](https://tailwindcss.com/docs/color-scheme) feature, which enables toggling light or dark interfaces at any scope. By default, the scheme matches the current Dark Mode setting. This feature is enabled by [Color Pairings](/docs/\[framework]/design/colors#color-pairings), which implement the native CSS property [light-dark](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark).

> TIP: try toggling light/dark mode to see the difference

```astro
<div class="w-full grid grid-cols-3 gap-4">
	<!-- Default -->
	<div>
		<label class="label">
			<span class="label-text">default</span>
			<input type="date" class="input" />
		</label>
	</div>

	<!-- Scheme Light -->
	<div class="scheme-light">
		<label class="label">
			<span class="label-text">scheme-light</span>
			<input type="date" class="input" />
		</label>
	</div>

	<!-- Scheme Dark -->
	<div class="scheme-dark">
		<label class="label">
			<span class="label-text">scheme-dark</span>
			<input type="date" class="input" />
		</label>
	</div>
</div>

```

***

## Light Switch

Refer to the following Cookbook recipe to learn how to create an interactive toggle interface element.

<figure class="linker bg-noise">
  <a class="btn preset-filled" href={resolvePath(props.Astro, '/docs/[framework]/guides/cookbook/light-switch')}>
    Light Switch →
  </a>
</figure>

