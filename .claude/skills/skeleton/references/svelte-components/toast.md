# Toast

Display brief messages to users.

```svelte
<script lang="ts">
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

	const toaster = createToaster();
</script>

<button
	class="btn preset-filled"
	onclick={() =>
		toaster.info({
			title: 'Title',
			description: 'This is a description.',
		})}
>
	Toast
</button>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

```

## Usage

This component acts as a Singleton. Implement a single instance of `<Toast.Group>` in the root scope your application.

```svelte
<script lang="ts">
	import { toaster } from '/some/path/toaster.ts';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	const props: Props = $props();
</script>

{@render props.children?.()}

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast toast={toast}>
			<Toast.Message>
			<Toast.Title>{toast.title}</Toast.Title>
			<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>
```

Create a shared reference to the `createToaster()` instance. We'll call it `toaster` here.

```ts
<script lang="ts">
	import { createToaster } from '@skeletonlabs/skeleton-svelte';

	export const toaster = createToaster();
</script>
```

Use this shared reference to trigger messages on demand throughout your application.

```svelte
<script lang="ts">
	import { toaster } from '/some/path/toaster.ts';

	function onClickHandler() {
		toaster.info({ title: 'Example', description: 'This is a toast message.' });
	}

</script>
```

## Triggers

Shorthand methods are available for toast triggers, including: `info()`, `success()`, `warning()`, and `error()`.

```svelte
<script lang="ts">
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

	const toaster = createToaster();
</script>

<div class="grid grid-cols-2 gap-2">
	<button
		class="btn preset-filled"
		onclick={() =>
			toaster.info({
				title: 'Info',
				description: 'This is an info toast.',
			})}
	>
		Info
	</button>
	<button
		class="btn preset-filled-success-500"
		onclick={() =>
			toaster.success({
				title: 'Success',
				description: 'This is a success toast.',
			})}
	>
		Success
	</button>
	<button
		class="btn preset-filled-warning-500"
		onclick={() =>
			toaster.warning({
				title: 'Warning',
				description: 'This is a warning toast.',
			})}
	>
		Warning
	</button>
	<button
		class="btn preset-filled-error-500"
		onclick={() =>
			toaster.error({
				title: 'Error',
				description: 'This is an error toast.',
			})}
	>
		Error
	</button>
</div>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

```

Or use the generic `create()` method to trigger toasts of any type: `info|success|warning|error`.

```ts
toaster.create({
	type: 'info',
	title: 'This is a toast',
	description: 'This is a toast description.',
	duration: 4000, // Duration in milliseconds (default: 4000), use Infinity to prevent auto-close
	action: {
		label: 'Action',
		onClick: () => {
			// Handle action click
		},
	},
});
```

## Placement

Set the `placement` value in your `createToaster` instance to define the global screen position.

```svelte
<script lang="ts">
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

	const toaster = createToaster({
		placement: 'bottom-end',
	});
</script>

<button
	class="btn preset-filled"
	onclick={() =>
		toaster.info({
			title: 'Title',
			description: 'This is a description.',
		})}
>
	Toast
</button>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

```

## Overlap

Use the `overlap` option in your `createToaster` instance to enable overlapping toasts.

```svelte
<script lang="ts">
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

	const toaster = createToaster({
		overlap: true,
	});
</script>

<button
	class="btn preset-filled"
	onclick={() =>
		toaster.info({
			title: 'Title',
			description: 'This is a description.',
		})}
>
	Toast
</button>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

```

> Note: Hovering over the toast group will expand all the toasts.

## Closable

Use the `closable` prop to toggle display of the close button.

```svelte
<script lang="ts">
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

	const toaster = createToaster();
</script>

<button
	class="btn preset-filled"
	onclick={() =>
		toaster.info({
			title: 'Title',
			description: 'This is a description.',
			closable: false,
		})}
>
	Toast
</button>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			{#if toast.closable}
				<Toast.CloseTrigger />
			{/if}
		</Toast>
	{/snippet}
</Toast.Group>

```

## Action

Use the `action` key to add an interactive button to your toast. This is useful for actions like "Undo", "Retry", or other contextual operations.

```svelte
<script lang="ts">
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

	const toaster = createToaster();
</script>

<button
	class="btn preset-filled"
	onclick={() =>
		toaster.info({
			title: 'Toast',
			description: 'This is a toast message.',
			duration: Infinity,
			action: {
				label: 'Undo',
				onClick: () => {
					toaster.success({
						title: 'Task undone',
						description: 'The task has been undone.',
					});
				},
			},
		})}
>
	Toast
</button>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			{#if toast.action}
				<Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
			{/if}
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

```

## Meta

Use the `meta` key to pass arbitrary data along with the toast instance. This can be used to display an icon for example.

```svelte
<script lang="ts">
	import SkullIcon from '@lucide/svelte/icons/skull';
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

	const toaster = createToaster();
</script>

{#snippet skull()}
	<SkullIcon class="size-8" />
{/snippet}

<button
	class="btn preset-filled"
	onclick={() =>
		toaster.info({
			title: 'Title',
			description: 'This is a description.',
			meta: {
				icon: skull,
			},
		})}
>
	Toast
</button>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			{@render toast.meta!.icon()}
			<Toast.Message>
				<Toast.Title class="flex gap-2 items-center">{toast.title}</Toast.Title>
				<Toast.Description>{toast.description} {toast.meta?.foo}</Toast.Description>
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

```

## Promise

Toasts support asynchronous updates using promises.

```svelte
<script lang="ts">
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

	const toaster = createToaster();

	function generatePositiveNumber() {
		return new Promise<number>((resolve, reject) => {
			setTimeout(() => {
				const number = Math.random() - 0.5;
				if (number > 0) {
					resolve(number);
				} else {
					reject(number);
				}
			}, 2000);
		});
	}
</script>

<button
	class="btn preset-filled"
	onclick={() =>
		toaster.promise(generatePositiveNumber(), {
			loading: {
				title: 'Loading...',
				description: 'Please wait while generating your number',
			},
			success: (number) => ({
				title: 'Success',
				description: `Your number is ${number}`,
			}),
			error: (number) => ({
				title: 'Error',
				description: `Your number is ${number}`,
			}),
		})}
>
	Toast
</button>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

```

## Anatomy

Here's an overview of how the Toast component is structured in code:

```svelte
<script lang="ts">
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';
</script>

<Toast.Group>
	<Toast>
		<Toast.Message>
			<Toast.Title />
			<Toast.Description />
		</Toast.Message>
		<Toast.CloseTrigger />
	</Toast>
</Toast.Group>
```

## API Reference

### Root

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| toast   | -                           | ToastOptions\<any>                               | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                         | Default |
| -------- | ----------- | -------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => ToastApi\<PropTypes, any>]> | -       |

### Group

| Prop     | Description                 | Type                                             | Default |
| -------- | --------------------------- | ------------------------------------------------ | ------- |
| toaster  | -                           | ToastStore\<any>                                 | -       |
| children | -                           | Snippet\<\[any]> \| undefined                    | -       |
| element  | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Message

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Title

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Description

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ActionTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### CloseTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

