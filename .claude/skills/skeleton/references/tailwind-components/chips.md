# Chips

Use chips to enter information, make selections, filter content, or trigger actions.

```astro
---
import { CheckIcon } from 'lucide-react';
---

<div class="flex items-center gap-2">
	<!-- A standard chip -->
	<button type="button" class="chip preset-outlined-surface-400-600 hover:preset-tonal">Chip</button>

	<!-- A chip + icon -->
	<button type="button" class="chip preset-outlined-surface-400-600 hover:preset-tonal">
		<span>Chip</span>
		<CheckIcon size={14} />
	</button>

	<!-- A simple icon chip -->
	<button type="button" class="chip-icon preset-outlined-surface-400-600 hover:preset-tonal">
		<CheckIcon size={14} />
	</button>
</div>

```

## Assist Chips

Represent a group of related contextual choices.

```svelte
<script lang="ts">
	import AlarmClockIcon from '@lucide/svelte/icons/alarm-clock';
	import AppWindowIcon from '@lucide/svelte/icons/app-window';
	import SunIcon from '@lucide/svelte/icons/sun';
</script>

<div class="card preset-filled-surface-100-900 p-4 space-y-4 w-full max-w-md overflow-hidden">
	<header>
		<h2 class="h6">Home Automation</h2>
	</header>
	<article class="space-y-4">
		<p class="opacity-60">Control your smart home with a single tap. Choose one of the quick actions below to get started.</p>
	</article>
	<hr class="hr" />
	<footer class="flex items-center justify-start gap-2 overflow-x-auto [scrollbar-width:none]">
		<button type="button" class="chip preset-outlined-surface-400-600">
			<SunIcon size={14} />
			<span>Turn on lights</span>
		</button>
		<button type="button" class="chip preset-outlined-surface-400-600">
			<AlarmClockIcon size={14} />
			<span>Set alarm</span>
		</button>
		<button type="button" class="chip preset-outlined-surface-400-600">
			<AppWindowIcon size={14} />
			<span>Close blinds</span>
		</button>
	</footer>
</div>

```

## Filter Chips

Represent a canned selection of options to choose from.

```svelte
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';

	const colors = ['red', 'green', 'blue'];
	let color = $state(colors[0]);

	function setColor(selectedColor: string) {
		color = selectedColor;
	}
</script>

<div class="card preset-filled-surface-100-900 w-full max-w-md p-4">
	<div class="flex justify-center items-center gap-2">
		<span class="text-sm opacity-60">Favorite Color</span>
		<!-- --- -->
		{#each colors as c (c)}
			<button
				class={`chip capitalize preset-outlined-surface-400-600 ${color === c ? 'preset-tonal-primary' : ''}`}
				onclick={() => setColor(c)}
			>
				{#if color === c}<CheckIcon size={14} />{/if}
				<span>{c}</span>
			</button>
		{/each}
		<!-- --- -->
	</div>
</div>

```

## Input Chips

Represent user input values such as contacts or search terms.

```svelte
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
</script>

<div class="card preset-filled-surface-100-900 w-full max-w-md p-4">
	<div class="flex justify-center items-center gap-2">
		<span class="text-sm opacity-60">To</span>
		<!-- --- -->
		<button class="chip preset-outlined-surface-400-600">
			<span>jane@email.com</span>
			<XIcon size={14} />
		</button>
		<button class="chip preset-outlined-surface-400-600">
			<span>dave@email.com</span>
			<XIcon size={14} />
		</button>
		<!-- --- -->
	</div>
</div>

```

## Suggestion Chips

Represent a canned set of suggested options for a user to choose from.

```svelte
<div class="card preset-filled-surface-100-900 w-full max-w-md p-4">
	<div class="flex justify-center items-center gap-2">
		<span class="text-sm opacity-60">Rating</span>
		<!-- --- -->
		<button class="chip preset-outlined-surface-400-600">
			<span>Bad</span>
		</button>
		<button class="chip preset-outlined-surface-400-600">
			<span>Good</span>
		</button>
		<button class="chip preset-outlined-surface-400-600">
			<span>Awesome</span>
		</button>
		<!-- --- -->
	</div>
</div>

```

## Disabled

When applied to a `<button>` element, you can use the `disabled` attribute.

```astro
<button type="button" class="chip preset-outlined-surface-400-600 hover:preset-tonal" disabled>Chip</button>

```

## Presets

Provides full support of [Presets](/docs/\[framework]/tailwind-utilities/presets).

```astro
<div class="space-y-4">
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled">Chip</button>
		<button type="button" class="chip preset-tonal">Chip</button>
		<button type="button" class="chip preset-outlined">Chip</button>
	</div>
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled-brand">Chip</button>
		<button type="button" class="chip preset-tonal-brand">Chip</button>
		<button type="button" class="chip preset-outlined-brand">Chip</button>
	</div>
	<hr class="hr" />
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled-primary-500">Chip</button>
		<button type="button" class="chip preset-tonal-primary">Chip</button>
		<button type="button" class="chip preset-outlined-primary-500">Chip</button>
	</div>
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled-secondary-500">Chip</button>
		<button type="button" class="chip preset-tonal-secondary">Chip</button>
		<button type="button" class="chip preset-outlined-secondary-500">Chip</button>
	</div>
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled-tertiary-500">Chip</button>
		<button type="button" class="chip preset-tonal-tertiary">Chip</button>
		<button type="button" class="chip preset-outlined-tertiary-500">Chip</button>
	</div>
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled-success-500">Chip</button>
		<button type="button" class="chip preset-tonal-success">Chip</button>
		<button type="button" class="chip preset-outlined-success-500">Chip</button>
	</div>
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled-warning-500">Chip</button>
		<button type="button" class="chip preset-tonal-warning">Chip</button>
		<button type="button" class="chip preset-outlined-warning-500">Chip</button>
	</div>
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled-error-500">Chip</button>
		<button type="button" class="chip preset-tonal-error">Chip</button>
		<button type="button" class="chip preset-outlined-error-500">Chip</button>
	</div>
	<div class="flex gap-4">
		<button type="button" class="chip preset-filled-surface-500">Chip</button>
		<button type="button" class="chip preset-tonal-surface">Chip</button>
		<button type="button" class="chip preset-outlined-surface-500">Chip</button>
	</div>
</div>

```

