# Portal

Renders children into a DOM node that exists outside the DOM hierarchy.

```svelte
<script lang="ts">
	import SkullIcon from '@lucide/svelte/icons/skull';
	import { Portal } from '@skeletonlabs/skeleton-svelte';

	let disabled = $state(true);
	let target: HTMLElement | undefined = $state();

	const cardClasses = 'card preset-outlined-surface-300-700 size-24 grid place-items-center p-4';
	const buttonClasses = 'col-span-2 btn preset-filled';
</script>

<div class="grid grid-cols-2 gap-4">
	<!-- Source -->
	<div class={cardClasses}>
		<Portal {disabled} {target}>
			<SkullIcon class="size-8" />
		</Portal>
	</div>

	<!-- Target -->
	<div class={cardClasses} bind:this={target}>
		<!-- (the content will appear here) -->
	</div>

	<!-- Trigger -->
	<button class={buttonClasses} onclick={() => (disabled = !disabled)}>
		{disabled ? 'Enable' : 'Disable'}
	</button>
</div>

```

## How It Works

When enabled, the content will move from the source to the target element.

## Anatomy

Here's an overview of how the Portal component is structured in code:

```svelte
<script lang="ts">
	import { Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Portal>
	<!-- Content -->
</Portal>
```

## API Reference

### Root

| Prop     | Description                                                                       | Type                     | Default       |
| -------- | --------------------------------------------------------------------------------- | ------------------------ | ------------- |
| disabled | If true, the portal functionality is disabled and children are rendered in place. | boolean \| undefined     | false         |
| target   | The HTML element to which the portal content will be appended.                    | HTMLElement \| undefined | document.body |
| children | The default slot content to be rendered within the component.                     | Snippet\<\[]>            | -             |

