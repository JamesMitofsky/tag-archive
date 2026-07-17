# Dividers

Horizontal and vertical rule styling.

```astro
<div class="card preset-filled-surface-100-900 w-full max-w-md p-4 space-y-4 text-center">
	<p class="opacity-60">Above the divider.</p>
	<!-- - -->
	<hr class="hr" />
	<!-- - -->
	<p class="opacity-60">Below the divider.</p>
</div>

```

## Vertical

Apply `vr` to a `<span>` for a vertical variant.

```astro
<div class="card preset-filled-surface-100-900 grid grid-cols-[1fr_auto_1fr] gap-4 w-full max-w-md p-4 text-center">
	<p class="opacity-60">Left Side</p>
	<!-- - -->
	<span class="vr"></span>
	<!-- - -->
	<p class="opacity-60">Right Side</p>
</div>

```

## Size

Use Tailwind's [border width](https://tailwindcss.com/docs/border-width) utilities to adjust thickness.

* Use `border-t` (top) for horizontal
* Use `border-l` (left) for vertical

```astro
<div class="w-full grid grid-cols-1 gap-4">
	<p>Default</p>
	<hr class="hr" />

	<p>border-t-2</p>
	<hr class="hr border-t-2" />

	<p>border-t-4</p>
	<hr class="hr border-t-4" />

	<p>border-t-8</p>
	<hr class="hr border-t-8" />
</div>

```

## Style

Use Tailwind's [border style](https://tailwindcss.com/docs/border-style) utilities to adjust visual style.

```astro
<div class="w-full grid grid-cols-1 gap-4">
	<p>border-solid</p>
	<hr class="hr border-solid" />

	<p>border-dashed</p>
	<hr class="hr border-dashed" />

	<p>border-dotted</p>
	<hr class="hr border-dotted" />

	<p>border-double</p>
	<hr class="hr border-4 border-double" />
</div>

```

## Colors

Use any Tailwind or Skeleton [colors or pairing](/docs/\[framework]/design/colors).

```astro
<div class="w-full grid grid-cols-1 gap-4">
	<p>border-brand</p>
	<hr class="hr border-brand" />

	<p>border-primary-500</p>
	<hr class="hr border-primary-500" />

	<p>border-secondary-500</p>
	<hr class="hr border-secondary-500" />

	<p>border-tertiary-500</p>
	<hr class="hr border-tertiary-500" />

	<p>border-success-500</p>
	<hr class="hr border-success-500" />

	<p>border-warning-500</p>
	<hr class="hr border-warning-500" />

	<p>border-error-500</p>
	<hr class="hr border-error-500" />

	<p>border-surface-950-50</p>
	<hr class="hr border-surface-950-50" />
</div>

```

