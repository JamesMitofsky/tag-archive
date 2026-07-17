# Badges

Show notifications, counts, or status information on navigation and icons

```astro
---
import { HeartIcon } from 'lucide-react';
---

<div class="flex items-center gap-2">
	<!-- A standard badge -->
	<span class="badge preset-filled-brand">Badge</span>

	<!-- A badge + icon -->
	<span class="badge preset-filled-brand">
		<HeartIcon className="fill-current stroke-0" size={10} />
		<span>Badge</span>
	</span>

	<!-- An icon badge -->
	<span class="badge-icon preset-filled-brand">
		<HeartIcon className="fill-current stroke-0" size={10} />
	</span>

	<!-- A badge dot -->
	<span class="badge-dot preset-filled-brand"> Badge </span>
</div>

```

## Inline

Display badges inline within buttons or list items.

```astro
---
import { HeartIcon } from 'lucide-react';
---

<div class="flex flex-col items-center gap-4">
	<btn class="btn btn-xs preset-tonal-brand">
		<HeartIcon />
		<span>Favorites</span>
		<span class="badge preset-filled-brand">64</span>
	</btn>
	<btn class="btn btn-sm preset-tonal-brand">
		<HeartIcon />
		<span>Favorites</span>
		<span class="badge preset-filled-brand">64</span>
	</btn>
	<btn class="btn btn-base preset-tonal-brand">
		<HeartIcon />
		<span>Favorites</span>
		<span class="badge preset-filled-brand">64</span>
	</btn>
	<btn class="btn btn-lg preset-tonal-brand">
		<HeartIcon />
		<span>Favorites</span>
		<span class="badge preset-filled-brand">64</span>
	</btn>
	<btn class="btn btn-xl preset-tonal-brand">
		<HeartIcon />
		<span>Favorites</span>
		<span class="badge preset-filled-brand">64</span>
	</btn>
</div>

```

## Overlapped

Create overlapping numeric or icon badge display.

```astro
---
import { HeartIcon } from 'lucide-react';

const imgSrc =
	'https://images.unsplash.com/photo-1620122303020-87ec826cf70d?q=80&w=256&h=256&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';
---

<div class="flex items-center gap-4">
	<!-- A badge dot -->
	<div class="relative inline-block">
		<span class="badge-dot preset-filled-success-500 absolute right-1.5 top-1.5 z-10">Badge</span>
		<img class="size-20 overflow-hidden rounded-full grayscale" src={imgSrc} alt="Avatar" />
	</div>

	<!-- A standard badge -->
	<div class="relative inline-block">
		<span class="badge preset-filled-warning-500 absolute right-0 top-0 z-10">10</span>
		<img class="size-20 overflow-hidden rounded-full grayscale" src={imgSrc} alt="Avatar" />
	</div>

	<!-- An icon badge -->
	<div class="relative inline-block">
		<span class="badge-icon preset-filled-error-500 absolute right-0 top-0 z-10">
			<HeartIcon className="fill-current stroke-0" />
		</span>
		<img class="size-20 overflow-hidden rounded-full grayscale" src={imgSrc} alt="Avatar" />
	</div>
</div>

```

## Presets

Provides full support of [Presets](/docs/\[framework]/tailwind-utilities/presets).

```astro
---
import { HeartIcon } from 'lucide-react';
---

<div class="space-y-4">
	<div class="flex gap-4">
		<span class="badge-icon preset-filled"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled">Badge</span>
		<span class="badge preset-tonal">Badge</span>
		<span class="badge preset-outlined">Badge</span>
	</div>
	<div class="flex gap-4">
		<span class="badge-icon preset-filled-brand"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled-brand">Badge</span>
		<span class="badge preset-tonal-brand">Badge</span>
		<span class="badge preset-outlined-brand">Badge</span>
	</div>
	<hr class="hr" />
	<div class="flex gap-4">
		<span class="badge-icon preset-filled-primary-500"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled-primary-500">Badge</span>
		<span class="badge preset-tonal-primary">Badge</span>
		<span class="badge preset-outlined-primary-500">Badge</span>
	</div>
	<div class="flex gap-4">
		<span class="badge-icon preset-filled-secondary-500"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled-secondary-500">Badge</span>
		<span class="badge preset-tonal-secondary">Badge</span>
		<span class="badge preset-outlined-secondary-500">Badge</span>
	</div>
	<div class="flex gap-4">
		<span class="badge-icon preset-filled-tertiary-500"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled-tertiary-500">Badge</span>
		<span class="badge preset-tonal-tertiary">Badge</span>
		<span class="badge preset-outlined-tertiary-500">Badge</span>
	</div>
	<div class="flex gap-4">
		<span class="badge-icon preset-filled-success-500"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled-success-500">Badge</span>
		<span class="badge preset-tonal-success">Badge</span>
		<span class="badge preset-outlined-success-500">Badge</span>
	</div>
	<div class="flex gap-4">
		<span class="badge-icon preset-filled-warning-500"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled-warning-500">Badge</span>
		<span class="badge preset-tonal-warning">Badge</span>
		<span class="badge preset-outlined-warning-500">Badge</span>
	</div>
	<div class="flex gap-4">
		<span class="badge-icon preset-filled-error-500"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled-error-500">Badge</span>
		<span class="badge preset-tonal-error">Badge</span>
		<span class="badge preset-outlined-error-500">Badge</span>
	</div>
	<div class="flex gap-4">
		<span class="badge-icon preset-filled-surface-500"><HeartIcon className="fill-current stroke-0" /></span>
		<span class="badge preset-filled-surface-500">Badge</span>
		<span class="badge preset-tonal-surface">Badge</span>
		<span class="badge preset-outlined-surface-500">Badge</span>
	</div>
</div>

```

