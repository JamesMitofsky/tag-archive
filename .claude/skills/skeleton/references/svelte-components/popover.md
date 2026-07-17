# Popover

Small overlay panels positioned relative to a trigger.

```svelte
<script>
	import XIcon from '@lucide/svelte/icons/x';
	import { Avatar, Popover, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Popover>
	<Popover.Trigger class="btn preset-filled">Trigger</Popover.Trigger>
	<Portal>
		<Popover.Positioner>
			<Popover.Content class="card w-96 p-4 bg-surface-100-900 shadow-xl">
				<div class="space-y-4">
					<header class="grid grid-cols-[auto_1fr_auto] gap-4 items-center">
						<Avatar>
							<Avatar.Image
								src="https://cdn.bsky.app/img/avatar/plain/did:plc:whtgi5zx7ylmdw2i76vq7vq4/bafkreibgoxuqahwcpiah22yfovqszh33x2u4sysmqoyuk5j54aoakt7364@jpeg"
								alt="Skeleton Labs"
							/>
						</Avatar>
						<div>
							<Popover.Title class="text-lg font-bold">Skeleton Labs</Popover.Title>
							<a href="https://bsky.app/profile/skeleton.dev" target="_blank" class="anchor">@skeletonlabs.dev</a>
						</div>
						<Popover.CloseTrigger class="btn-icon hover:preset-tonal self-start">
							<XIcon class="size-4" />
						</Popover.CloseTrigger>
					</header>
					<Popover.Description>Your friendly neighborhood open source maintainers. Creators of Skeleton.</Popover.Description>
					<div class="flex gap-4">
						<p class="text-sm">800 <span class="opacity-60">Followers</span></p>
						<p class="text-sm">120 <span class="opacity-60">Following</span></p>
						<p class="text-sm">100 <span class="opacity-60">Posts</span></p>
					</div>
				</div>
				<Popover.Arrow class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-100-900)]">
					<Popover.ArrowTip />
				</Popover.Arrow>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>

```

Breaking convention in Skeleton, this component is provided "headless". Meaning no default styles are applied out of the box. This ensures you retain full control of all styling for maximum flexibility.

## Anchor

Use the `Anchor` component to position the popover contents relative to an element other than the trigger.

```svelte
<script>
	import XIcon from '@lucide/svelte/icons/x';
	import { Avatar, Popover, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Popover>
	<div class="flex items-center gap-4">
		<Popover.Anchor>
			<Avatar>
				<Avatar.Image
					src="https://cdn.bsky.app/img/avatar/plain/did:plc:whtgi5zx7ylmdw2i76vq7vq4/bafkreibgoxuqahwcpiah22yfovqszh33x2u4sysmqoyuk5j54aoakt7364@jpeg"
					alt="Skeleton Labs"
				/>
			</Avatar>
		</Popover.Anchor>
		<Popover.Trigger class="btn preset-filled">Show Profile</Popover.Trigger>
	</div>
	<Portal>
		<Popover.Positioner>
			<Popover.Content class="card w-96 p-4 bg-surface-100-900 shadow-xl">
				<div class="space-y-4">
					<header class="grid grid-cols-[auto_1fr_auto] gap-4 items-center">
						<Avatar>
							<Avatar.Image
								src="https://cdn.bsky.app/img/avatar/plain/did:plc:whtgi5zx7ylmdw2i76vq7vq4/bafkreibgoxuqahwcpiah22yfovqszh33x2u4sysmqoyuk5j54aoakt7364@jpeg"
								alt="Skeleton Labs"
							/>
						</Avatar>
						<div>
							<Popover.Title class="text-lg font-bold">Skeleton Labs</Popover.Title>
							<a href="https://bsky.app/profile/skeleton.dev" target="_blank" rel="noopener noreferrer" class="anchor">@skeletonlabs.dev</a>
						</div>
						<Popover.CloseTrigger class="btn-icon hover:preset-tonal self-start">
							<XIcon class="size-4" />
						</Popover.CloseTrigger>
					</header>
					<Popover.Description>Your friendly neighborhood open source maintainers. Creators of Skeleton.</Popover.Description>
					<div class="flex gap-4">
						<p class="text-sm">800 <span class="opacity-60">Followers</span></p>
						<p class="text-sm">120 <span class="opacity-60">Following</span></p>
						<p class="text-sm">100 <span class="opacity-60">Posts</span></p>
					</div>
				</div>
				<Popover.Arrow class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-100-900)]">
					<Popover.ArrowTip />
				</Popover.Arrow>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>

```

## Arrow

Visually connects the popover content to the trigger element. Will automatically align based on the selected side.

```svelte
<script>
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Popover>
	<Popover.Trigger class="btn preset-filled">Trigger</Popover.Trigger>
	<Portal>
		<Popover.Positioner>
			<Popover.Content class="card max-w-md p-4 bg-surface-100-900 shadow-xl">
				<Popover.Description>This example will have a small arrow.</Popover.Description>
				<Popover.Arrow class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-100-900)]">
					<Popover.ArrowTip />
				</Popover.Arrow>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>

```

## Z-Index

By default Skeleton does not take an opinionated stance regarding z-index stacking. The result is the component can sometimes be occluded beneath other elements with a higher index. The Z-Index can controlled by applying a utility class to the `Positioner` component.

```svelte
<script>
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="grid grid-cols-2 gap-4">
	<Popover>
		<Popover.Trigger class="btn preset-filled">Default (auto)</Popover.Trigger>
		<Portal>
			<Popover.Positioner>
				<Popover.Content class="card max-w-md p-4 bg-surface-100-900 space-y-2">
					<Popover.Description>This example will be below the sibling.</Popover.Description>
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>

	<Popover>
		<Popover.Trigger class="btn preset-filled">Above (20)</Popover.Trigger>
		<Portal>
			<Popover.Positioner class="z-20!">
				<Popover.Content class="card max-w-md p-4 bg-surface-100-900 shadow-xl space-y-2">
					<Popover.Description>This example will be above the sibling.</Popover.Description>
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>

	<div class="col-span-2 h-[100px] relative">
		<div class="rounded bg-primary-200-800/75 w-full h-full z-10 flex justify-center items-center absolute">Sibling (10)</div>
	</div>
</div>

```

## Provider Pattern

Use the [Provider Pattern](/docs/\[framework]/get-started/fundamentals#provider-pattern) to gain access to the inner component APIs.

```svelte
<script>
	import { Popover, Portal, usePopover } from '@skeletonlabs/skeleton-svelte';

	const id = $props.id();
	const popover = usePopover({
		id: id,
		closeOnInteractOutside: false,
	});

	function showAndHide() {
		popover().setOpen(true);
		setTimeout(() => {
			popover().setOpen(false);
		}, 3000);
	}
</script>

<div class="flex flex-col gap-4">
	<button class="btn preset-filled" onclick={showAndHide}>Show for 3 seconds</button>

	<Popover.Provider value={popover}>
		<Popover.Trigger class="btn preset-tonal">Anchor</Popover.Trigger>
		<Portal>
			<Popover.Positioner>
				<Popover.Content class="card max-w-sm p-4 bg-surface-100-900 shadow-xl space-y-2">
					<Popover.Description>This popover will appear, stay open for three seconds, then close on it's own.</Popover.Description>
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover.Provider>
</div>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script>
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Popover dir="rtl">
	<Popover.Trigger class="btn preset-filled">Trigger</Popover.Trigger>
	<Portal>
		<Popover.Positioner>
			<Popover.Content class="card max-w-md p-4 bg-surface-100-900 shadow-xl space-y-2">
				<Popover.Title class="font-bold">Example</Popover.Title>
				<Popover.Description>This is a basic example of a popover.</Popover.Description>
				<Popover.CloseTrigger class="btn preset-tonal">Close</Popover.CloseTrigger>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>

```

## Anatomy

Here's an overview of how the Popover component is structured in code:

```svelte
<script lang="ts">
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Popover>
	<Popover.Anchor />
	<Popover.Trigger />
	<Portal>
		<Popover.Positioner>
			<Popover.Content>
				<Popover.Title />
				<Popover.Description />
				<Popover.CloseTrigger />
				<Popover.Arrow>
					<Popover.ArrowTip />
				</Popover.Arrow>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
```

## API Reference

### Root

| Prop                   | Description                                                                                                                                                                                                                                           | Type                                                                                                                                                                                                                    | Default |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| translations           | Specifies the localized strings that identifies the accessibility elements and their states                                                                                                                                                           | IntlTranslations \| undefined                                                                                                                                                                                           | -       |
| ids                    | The ids of the elements in the popover. Useful for composition.                                                                                                                                                                                       | Partial\<\{ anchor: string; trigger: string \| ((value?: string \| undefined) => string); content: string; title: string; description: string; closeTrigger: string; positioner: string; arrow: string; }> \| undefined | -       |
| modal                  | Whether the popover should be modal. When set to \`true\`:&#xA;- interaction with outside elements will be disabled&#xA;- only popover content will be visible to screen readers&#xA;- scrolling is blocked&#xA;- focus is trapped within the popover | boolean \| undefined                                                                                                                                                                                                    | false   |
| portalled              | Whether the popover is portalled. This will proxy the tabbing behavior regardless of the DOM position&#xA;of the popover content.                                                                                                                     | boolean \| undefined                                                                                                                                                                                                    | true    |
| autoFocus              | Whether to automatically set focus on the first focusable&#xA;content within the popover when opened.                                                                                                                                                 | boolean \| undefined                                                                                                                                                                                                    | true    |
| initialFocusEl         | The element to focus on when the popover is opened.                                                                                                                                                                                                   | (() => HTMLElement \| null) \| undefined                                                                                                                                                                                | -       |
| finalFocusEl           | Element to receive focus when the popover is closed.                                                                                                                                                                                                  | (() => MaybeElement) \| undefined                                                                                                                                                                                       | -       |
| restoreFocus           | Whether to restore focus to the element that had focus before the popover was opened.                                                                                                                                                                 | boolean \| undefined                                                                                                                                                                                                    | true    |
| closeOnInteractOutside | Whether to close the popover when the user clicks outside of the popover.                                                                                                                                                                             | boolean \| undefined                                                                                                                                                                                                    | true    |
| closeOnEscape          | Whether to close the popover when the escape key is pressed.                                                                                                                                                                                          | boolean \| undefined                                                                                                                                                                                                    | true    |
| onOpenChange           | Function invoked when the popover opens or closes                                                                                                                                                                                                     | ((details: OpenChangeDetails) => void) \| undefined                                                                                                                                                                     | -       |
| positioning            | The user provided options used to position the popover content                                                                                                                                                                                        | PositioningOptions \| undefined                                                                                                                                                                                         | -       |
| open                   | The controlled open state of the popover                                                                                                                                                                                                              | boolean \| undefined                                                                                                                                                                                                    | -       |
| defaultOpen            | The initial open state of the popover when rendered.&#xA;Use when you don't need to control the open state of the popover.                                                                                                                            | boolean \| undefined                                                                                                                                                                                                    | -       |
| triggerValue           | The controlled trigger value                                                                                                                                                                                                                          | string \| null \| undefined                                                                                                                                                                                             | -       |
| defaultTriggerValue    | The initial trigger value when rendered.&#xA;Use when you don't need to control the trigger value.                                                                                                                                                    | string \| null \| undefined                                                                                                                                                                                             | -       |
| onTriggerValueChange   | Function called when the trigger value changes.                                                                                                                                                                                                       | ((details: TriggerValueChangeDetails) => void) \| undefined                                                                                                                                                             | -       |
| getRootNode            | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                                                                                                                            | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                                     | -       |
| dir                    | The document's text/writing direction.                                                                                                                                                                                                                | "ltr" \| "rtl" \| undefined                                                                                                                                                                                             | "ltr"   |
| onEscapeKeyDown        | Function called when the escape key is pressed                                                                                                                                                                                                        | ((event: KeyboardEvent) => void) \| undefined                                                                                                                                                                           | -       |
| onRequestDismiss       | Function called when this layer is closed due to a parent layer being closed                                                                                                                                                                          | ((event: LayerDismissEvent) => void) \| undefined                                                                                                                                                                       | -       |
| onPointerDownOutside   | Function called when the pointer is pressed down outside the component                                                                                                                                                                                | ((event: PointerDownOutsideEvent) => void) \| undefined                                                                                                                                                                 | -       |
| onFocusOutside         | Function called when the focus is moved outside the component                                                                                                                                                                                         | ((event: FocusOutsideEvent) => void) \| undefined                                                                                                                                                                       | -       |
| onInteractOutside      | Function called when an interaction happens outside the component                                                                                                                                                                                     | ((event: InteractOutsideEvent) => void) \| undefined                                                                                                                                                                    | -       |
| persistentElements     | Returns the persistent elements that:&#xA;- should not have pointer-events disabled&#xA;- should not trigger the dismiss event                                                                                                                        | (() => Element \| null)\[] \| undefined                                                                                                                                                                                 | -       |
| children               | The default slot content to be rendered within the component.                                                                                                                                                                                         | Snippet\<\[]> \| undefined                                                                                                                                                                                              | -       |

### Provider

| Prop     | Description                                                   | Type                         | Default |
| -------- | ------------------------------------------------------------- | ---------------------------- | ------- |
| value    | -                                                             | () => PopoverApi\<PropTypes> | -       |
| children | The default slot content to be rendered within the component. | Snippet\<\[]> \| undefined   | -       |

### Context

| Prop     | Description | Type                                      | Default |
| -------- | ----------- | ----------------------------------------- | ------- |
| children | -           | Snippet\<\[() => PopoverApi\<PropTypes>]> | -       |

### Anchor

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Trigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Positioner

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Content

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Arrow

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ArrowTip

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

### CloseTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

