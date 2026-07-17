# Cards

Provides container elements that wrap and separate content.

```astro
<div class="card w-full max-w-md preset-filled-surface-100-900 p-4 text-center">
	<p>Card</p>
</div>

```

## Hover

Hover styles are applied when the card is an `anchor` or `button` element.

```astro
---
const unsplashId = 'photo-1598305758677-7548ff30583b';
const imgSrc = `https://images.unsplash.com/${unsplashId}?q=80&w=450&h=190&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D`;
---

<a href="#" class="card preset-filled-surface-100-900 divide-y divide-surface-200-800 max-w-md overflow-hidden">
	<!-- Header -->
	<header>
		<img src={imgSrc} class="aspect-21/9 w-full grayscale hue-rotate-90" alt="banner" />
	</header>

	<!-- Article -->
	<article class="space-y-4 p-4">
		<div>
			<h2 class="h6">Announcements</h2>
			<h3 class="h3">Skeleton is Awesome</h3>
		</div>
		<p class="opacity-60">
			Lorem ipsum dolor sit amet consectetur adipisicing elit. Numquam aspernatur provident eveniet eligendi cumque consequatur tempore sint
			nisi sapiente. Iste beatae laboriosam iure molestias cum expedita architecto itaque quae rem.
		</p>
	</article>

	<!-- Footer -->
	<footer class="flex items-center justify-between gap-4 p-4">
		<small class="opacity-60">By Alex</small>
		<small class="opacity-60">On {new Date().toLocaleDateString()}</small>
	</footer>
</a>

```

## Presets

Provides full support of [Presets](/docs/\[framework]/tailwind-utilities/presets).

```astro
<div class="w-full space-y-4">
	<div class="grid grid-cols-3 gap-4">
		<div class="card p-4 preset-filled">Card</div>
		<div class="card p-4 preset-tonal">Card</div>
		<div class="card p-4 preset-outlined">Card</div>

		<div class="card p-4 preset-filled-brand">Card</div>
		<div class="card p-4 preset-tonal-brand">Card</div>
		<div class="card p-4 preset-outlined-brand">Card</div>
	</div>
	<hr class="hr" />
	<div class="grid grid-cols-3 gap-4">
		<div class="card p-4 preset-filled-primary-500">Card</div>
		<div class="card p-4 preset-tonal-primary">Card</div>
		<div class="card p-4 preset-outlined-primary-500">Card</div>

		<div class="card p-4 preset-filled-secondary-500">Card</div>
		<div class="card p-4 preset-tonal-secondary">Card</div>
		<div class="card p-4 preset-outlined-secondary-500">Card</div>

		<div class="card p-4 preset-filled-tertiary-500">Card</div>
		<div class="card p-4 preset-tonal-tertiary">Card</div>
		<div class="card p-4 preset-outlined-tertiary-500">Card</div>

		<div class="card p-4 preset-filled-success-500">Card</div>
		<div class="card p-4 preset-tonal-success">Card</div>
		<div class="card p-4 preset-outlined-success-500">Card</div>

		<div class="card p-4 preset-filled-warning-500">Card</div>
		<div class="card p-4 preset-tonal-warning">Card</div>
		<div class="card p-4 preset-outlined-warning-500">Card</div>

		<div class="card p-4 preset-filled-error-500">Card</div>
		<div class="card p-4 preset-tonal-error">Card</div>
		<div class="card p-4 preset-outlined-error-500">Card</div>

		<div class="card p-4 preset-filled-surface-500">Card</div>
		<div class="card p-4 preset-tonal-surface">Card</div>
		<div class="card p-4 preset-outlined-surface-500">Card</div>
	</div>
</div>

```

