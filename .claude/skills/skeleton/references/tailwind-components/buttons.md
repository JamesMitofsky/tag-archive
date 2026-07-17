# Buttons

Provide a variety of button, including customizable sizes and types.

```astro
---
import { ArrowUpRightIcon } from 'lucide-react';
---

<div class="flex items-center gap-4">
	<!-- A standard button -->
	<button type="button" class="btn preset-filled">Button</button>
	<!-- A button + icon -->
	<button type="button" class="btn preset-filled">
		<span>Button</span>
		<ArrowUpRightIcon size={16} />
	</button>
	<!-- An icon button -->
	<button type="button" class="btn-icon preset-filled" title="Go" aria-label="Go">
		<ArrowUpRightIcon size={16} />
	</button>
</div>

```

## Sizes

Use `btn-{size}` paired with: `xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl`

```astro
---
import { ArrowUpRightIcon, PlusIcon } from 'lucide-react';
---

<div class="flex flex-col items-center gap-4">
	<div class="flex items-center gap-4">
		<button type="button" class="btn btn-xs preset-filled">Button</button>
		<button type="button" class="btn-icon btn-icon-xs preset-filled" title="Go" aria-label="Go">
			<ArrowUpRightIcon />
		</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn btn-sm preset-filled">Button</button>
		<button type="button" class="btn-icon btn-icon-sm preset-filled" title="Go" aria-label="Go">
			<ArrowUpRightIcon />
		</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn btn-base preset-filled">Button</button>
		<button type="button" class="btn-icon btn-icon-base preset-filled" title="Go" aria-label="Go">
			<ArrowUpRightIcon />
		</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn btn-lg preset-filled">Button</button>
		<button type="button" class="btn-icon btn-icon-lg preset-filled" title="Go" aria-label="Go">
			<ArrowUpRightIcon />
		</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn btn-xl preset-filled">Button</button>
		<button type="button" class="btn-icon btn-icon-xl preset-filled" title="Go" aria-label="Go">
			<ArrowUpRightIcon />
		</button>
	</div>

	<!-- NOTE: 2x|3xl|4xl|5xl|6xl|7xl|8xl|9xl tructated for space -->

	<hr class="hr" />

	<!-- Floating Action Buttons -->
	<div class="flex items-center gap-4">
		<!-- Shaped -->
		<button type="button" class="btn-icon btn-icon-2xl preset-filled" title="Go" aria-label="Go">
			<PlusIcon />
		</button>
		<!-- Circular -->
		<button type="button" class="btn-icon btn-icon-2xl preset-filled rounded-full" title="Go" aria-label="Go">
			<PlusIcon />
		</button>
	</div>
</div>

```

## Disabled

When applied to a `<button>` element you can use the `disabled` attribute.

```astro
---
import { ArrowUpRightIcon } from 'lucide-react';
---

<div class="flex items-center gap-4">
	<!-- A standard button -->
	<button type="button" class="btn preset-filled" disabled>Button</button>
	<!-- A button + icon -->
	<button type="button" class="btn preset-filled" disabled>
		<span>Button</span>
		<ArrowUpRightIcon size={16} />
	</button>
	<!-- An icon button -->
	<button type="button" class="btn-icon preset-filled" title="Go" aria-label="Go" disabled>
		<ArrowUpRightIcon size={16} />
	</button>
</div>

```

## Presets

Provides full support of [Presets](/docs/\[framework]/tailwind-utilities/presets).

```astro
---
import { ArrowUpRightIcon } from 'lucide-react';
---

<div class="space-y-4">
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled">Button</button>
		<button type="button" class="btn preset-tonal">Button</button>
		<button type="button" class="btn preset-outlined">Button</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled-brand" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled-brand">Button</button>
		<button type="button" class="btn preset-tonal-brand">Button</button>
		<button type="button" class="btn preset-outlined-brand">Button</button>
	</div>
	<hr class="hr" />
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled-primary-500" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled-primary-500">Button</button>
		<button type="button" class="btn preset-tonal-primary">Button</button>
		<button type="button" class="btn preset-outlined-primary-500">Button</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled-secondary-500" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled-secondary-500">Button</button>
		<button type="button" class="btn preset-tonal-secondary">Button</button>
		<button type="button" class="btn preset-outlined-secondary-500">Button</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled-tertiary-500" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled-tertiary-500">Button</button>
		<button type="button" class="btn preset-tonal-tertiary">Button</button>
		<button type="button" class="btn preset-outlined-tertiary-500">Button</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled-success-500" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled-success-500">Button</button>
		<button type="button" class="btn preset-tonal-success">Button</button>
		<button type="button" class="btn preset-outlined-success-500">Button</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled-warning-500" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled-warning-500">Button</button>
		<button type="button" class="btn preset-tonal-warning">Button</button>
		<button type="button" class="btn preset-outlined-warning-500">Button</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled-error-500" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled-error-500">Button</button>
		<button type="button" class="btn preset-tonal-error">Button</button>
		<button type="button" class="btn preset-outlined-error-500">Button</button>
	</div>
	<div class="flex items-center gap-4">
		<button type="button" class="btn-icon preset-filled-surface-500" title="Go" aria-label="Go"><ArrowUpRightIcon size={16} /></button>
		<button type="button" class="btn preset-filled-surface-500">Button</button>
		<button type="button" class="btn preset-tonal-surface">Button</button>
		<button type="button" class="btn preset-outlined-surface-500">Button</button>
	</div>
</div>

```

## Group

```svelte
<script lang="ts">
	let active = $state('january');
	const months = ['january', 'february', 'march'];
</script>

<nav class="btn-group preset-outlined-surface-200-800 flex-col md:flex-row">
	{#each months as month (month)}
		<button type="button" class="btn capitalize {month === active ? 'preset-filled' : 'preset-tonal'}" onclick={() => (active = month)}>
			{month}
		</button>
	{/each}
</nav>

```

