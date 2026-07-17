# Floating Panel

A draggable, resizable floating panel with minimize/maximize controls.

```svelte
<script>
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<FloatingPanel>
	<FloatingPanel.Trigger class="btn preset-filled">Open Panel</FloatingPanel.Trigger>
	<Portal>
		<FloatingPanel.Positioner class="z-50">
			<FloatingPanel.Content>
				<FloatingPanel.DragTrigger>
					<FloatingPanel.Header>
						<FloatingPanel.Title>
							<GripVerticalIcon class="size-4" />
							Floating Panel
						</FloatingPanel.Title>
						<FloatingPanel.Control>
							<FloatingPanel.StageTrigger stage="minimized">
								<MinusIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="maximized">
								<MaximizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="default">
								<MinimizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.CloseTrigger>
								<XIcon className="size-4" />
							</FloatingPanel.CloseTrigger>
						</FloatingPanel.Control>
					</FloatingPanel.Header>
				</FloatingPanel.DragTrigger>
				<FloatingPanel.Body>
					<p>
						This is a floating panel that can be dragged, resized, minimized, and maximized. Try dragging from the header or resizing from
						the bottom-right corner.
					</p>
				</FloatingPanel.Body>
				<FloatingPanel.ResizeTrigger axis="se" />
			</FloatingPanel.Content>
		</FloatingPanel.Positioner>
	</Portal>
</FloatingPanel>

```

## Size Constraints

Use the `minSize` and `maxSize` props to set size constraints on the Floating Panel.

```svelte
<script>
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<FloatingPanel maxSize={{ width: 900, height: 600 }} minSize={{ width: 300, height: 200 }}>
	<FloatingPanel.Trigger class="btn preset-filled">Open Panel</FloatingPanel.Trigger>
	<Portal>
		<FloatingPanel.Positioner class="z-50">
			<FloatingPanel.Content>
				<FloatingPanel.DragTrigger>
					<FloatingPanel.Header>
						<FloatingPanel.Title>
							<GripVerticalIcon class="size-4" />
							Floating Panel
						</FloatingPanel.Title>
						<FloatingPanel.Control>
							<FloatingPanel.StageTrigger stage="minimized">
								<MinusIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="maximized">
								<MaximizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="default">
								<MinimizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.CloseTrigger>
								<XIcon className="size-4" />
							</FloatingPanel.CloseTrigger>
						</FloatingPanel.Control>
					</FloatingPanel.Header>
				</FloatingPanel.DragTrigger>
				<FloatingPanel.Body>
					<p>This panel has size constraints applied: minimum 300x200 pixels and maximum 900x600 pixels.</p>
					<p>Try resizing from the bottom-right corner - the panel will respect these boundaries.</p>
				</FloatingPanel.Body>
				<FloatingPanel.ResizeTrigger axis="se" />
			</FloatingPanel.Content>
		</FloatingPanel.Positioner>
	</Portal>
</FloatingPanel>

```

## Controlled

Control the open state and size of the Floating Panel with your own state.

```svelte
<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';

	let open = $state(false);
	let size = $state({
		width: 400,
		height: 300,
	});
</script>

<div class="flex flex-col gap-4">
	<label class="label flex items-center gap-2">
		<input type="checkbox" class="checkbox" bind:checked={open} />
		<span class="label-text">Open Panel</span>
	</label>
	<label class="label">
		<span class="label-text">Width:</span>
		<input type="number" class="input" bind:value={size.width} />
	</label>
	<label class="label">
		<span class="label-text">Height:</span>
		<input type="number" class="input" bind:value={size.height} />
	</label>
</div>

<FloatingPanel {open} onOpenChange={(details) => (open = details.open)} {size} onSizeChange={(details) => (size = details.size)}>
	<Portal>
		<FloatingPanel.Positioner class="z-50">
			<FloatingPanel.Content>
				<FloatingPanel.DragTrigger>
					<FloatingPanel.Header>
						<FloatingPanel.Title>
							<GripVerticalIcon class="size-4" />
							Controlled Panel
						</FloatingPanel.Title>
						<FloatingPanel.Control>
							<FloatingPanel.StageTrigger stage="minimized">
								<MinusIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="maximized">
								<MaximizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="default">
								<MinimizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.CloseTrigger>
								<XIcon class="size-4" />
							</FloatingPanel.CloseTrigger>
						</FloatingPanel.Control>
					</FloatingPanel.Header>
				</FloatingPanel.DragTrigger>
				<FloatingPanel.Body>
					<p>This panel's open state and size are controlled via the inputs above.</p>
					<p>Try changing the values or resizing/closing the panel to see the inputs update.</p>
				</FloatingPanel.Body>
				<FloatingPanel.ResizeTrigger axis="se" />
			</FloatingPanel.Content>
		</FloatingPanel.Positioner>
	</Portal>
</FloatingPanel>

```

## Anchor Position

Position the panel relative to another element using the `defaultPosition` prop.

```svelte
<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="space-y-4">
	<FloatingPanel
		getAnchorPosition={(ctx) => {
			if (!ctx.triggerRect) return { x: 0, y: 0 };
			return {
				x: ctx.triggerRect.x + ctx.triggerRect.width / 2,
				y: ctx.triggerRect.y + ctx.triggerRect.height / 2,
			};
		}}
	>
		<FloatingPanel.Trigger class="btn preset-filled">Open Panel</FloatingPanel.Trigger>
		<Portal>
			<FloatingPanel.Positioner class="z-50">
				<FloatingPanel.Content>
					<FloatingPanel.DragTrigger>
						<FloatingPanel.Header>
							<FloatingPanel.Title>
								<GripVerticalIcon class="size-4" />
								Anchored Panel
							</FloatingPanel.Title>
							<FloatingPanel.Control>
								<FloatingPanel.StageTrigger stage="minimized">
									<MinusIcon class="size-4" />
								</FloatingPanel.StageTrigger>
								<FloatingPanel.StageTrigger stage="maximized">
									<MaximizeIcon class="size-4" />
								</FloatingPanel.StageTrigger>
								<FloatingPanel.StageTrigger stage="default">
									<MinimizeIcon class="size-4" />
								</FloatingPanel.StageTrigger>
								<FloatingPanel.CloseTrigger>
									<XIcon class="size-4" />
								</FloatingPanel.CloseTrigger>
							</FloatingPanel.Control>
						</FloatingPanel.Header>
					</FloatingPanel.DragTrigger>
					<FloatingPanel.Body>
						<p>This panel is centered in the viewport using getAnchorPosition.</p>
						<p>The position is calculated based on the boundary rectangle.</p>
					</FloatingPanel.Body>
					<FloatingPanel.ResizeTrigger axis="se" />
				</FloatingPanel.Content>
			</FloatingPanel.Positioner>
		</Portal>
	</FloatingPanel>
</div>

```

## Resize Triggers

Add resize triggers on all sides and corners of the Floating Panel using the `axis` prop.

```svelte
<script>
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<FloatingPanel>
	<FloatingPanel.Trigger class="btn preset-filled">Open Panel</FloatingPanel.Trigger>
	<Portal>
		<FloatingPanel.Positioner class="z-50">
			<FloatingPanel.Content>
				<FloatingPanel.DragTrigger>
					<FloatingPanel.Header>
						<FloatingPanel.Title>
							<GripVerticalIcon class="size-4" />
							Floating Panel
						</FloatingPanel.Title>
						<FloatingPanel.Control>
							<FloatingPanel.StageTrigger stage="minimized">
								<MinusIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="maximized">
								<MaximizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="default">
								<MinimizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.CloseTrigger>
								<XIcon className="size-4" />
							</FloatingPanel.CloseTrigger>
						</FloatingPanel.Control>
					</FloatingPanel.Header>
				</FloatingPanel.DragTrigger>
				<FloatingPanel.Body>
					<p>
						This is a floating panel that can be dragged, resized, minimized, and maximized. Try dragging from the header or resizing from
						the bottom-right corner.
					</p>
				</FloatingPanel.Body>
				<FloatingPanel.ResizeTrigger class="bg-primary-500/50" axis="n" />
				<FloatingPanel.ResizeTrigger class="bg-primary-500/50" axis="e" />
				<FloatingPanel.ResizeTrigger class="bg-primary-500/50" axis="w" />
				<FloatingPanel.ResizeTrigger class="bg-primary-500/50" axis="s" />
				<FloatingPanel.ResizeTrigger class="bg-primary-500/50" axis="ne" />
				<FloatingPanel.ResizeTrigger class="bg-primary-500/50" axis="se" />
				<FloatingPanel.ResizeTrigger class="bg-primary-500/50" axis="sw" />
				<FloatingPanel.ResizeTrigger class="bg-primary-500/50" axis="nw" />
			</FloatingPanel.Content>
		</FloatingPanel.Positioner>
	</Portal>
</FloatingPanel>

```

## Disable Dragging

Disable dragging by setting the `draggable` prop to `false`. The panel will remain in a fixed position but can still be resized.

```svelte
<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<FloatingPanel draggable={false}>
	<FloatingPanel.Trigger class="btn preset-filled">Open Panel</FloatingPanel.Trigger>
	<Portal>
		<FloatingPanel.Positioner class="z-50">
			<FloatingPanel.Content>
				<FloatingPanel.DragTrigger>
					<FloatingPanel.Header>
						<FloatingPanel.Title>
							<GripVerticalIcon class="size-4" />
							Fixed Position Panel
						</FloatingPanel.Title>
						<FloatingPanel.Control>
							<FloatingPanel.StageTrigger stage="minimized">
								<MinusIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="maximized">
								<MaximizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="default">
								<MinimizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.CloseTrigger>
								<XIcon class="size-4" />
							</FloatingPanel.CloseTrigger>
						</FloatingPanel.Control>
					</FloatingPanel.Header>
				</FloatingPanel.DragTrigger>
				<FloatingPanel.Body>
					<p>This panel cannot be dragged - the position is fixed.</p>
					<p>However, it can still be resized from the bottom-right corner.</p>
				</FloatingPanel.Body>
				<FloatingPanel.ResizeTrigger axis="se" />
			</FloatingPanel.Content>
		</FloatingPanel.Positioner>
	</Portal>
</FloatingPanel>

```

## Disable Resizing

Disable resizing by setting the `resizable` prop to `false`. The panel will have a fixed size but can still be dragged.

```svelte
<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<FloatingPanel resizable={false}>
	<FloatingPanel.Trigger class="btn preset-filled">Open Panel</FloatingPanel.Trigger>
	<Portal>
		<FloatingPanel.Positioner class="z-50">
			<FloatingPanel.Content>
				<FloatingPanel.DragTrigger>
					<FloatingPanel.Header>
						<FloatingPanel.Title>
							<GripVerticalIcon class="size-4" />
							Fixed Size Panel
						</FloatingPanel.Title>
						<FloatingPanel.Control>
							<FloatingPanel.StageTrigger stage="minimized">
								<MinusIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="maximized">
								<MaximizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="default">
								<MinimizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.CloseTrigger>
								<XIcon class="size-4" />
							</FloatingPanel.CloseTrigger>
						</FloatingPanel.Control>
					</FloatingPanel.Header>
				</FloatingPanel.DragTrigger>
				<FloatingPanel.Body>
					<p>This panel cannot be resized.</p>
					<p>Try dragging the edges - they won't respond.</p>
				</FloatingPanel.Body>
				<FloatingPanel.ResizeTrigger axis="se" />
			</FloatingPanel.Content>
		</FloatingPanel.Positioner>
	</Portal>
</FloatingPanel>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<FloatingPanel dir="rtl">
	<FloatingPanel.Trigger class="btn preset-filled">Open Panel</FloatingPanel.Trigger>
	<Portal>
		<FloatingPanel.Positioner class="z-50">
			<FloatingPanel.Content>
				<FloatingPanel.DragTrigger>
					<FloatingPanel.Header>
						<FloatingPanel.Title>
							<GripVerticalIcon class="size-4" />
							Floating Panel
						</FloatingPanel.Title>
						<FloatingPanel.Control>
							<FloatingPanel.StageTrigger stage="minimized">
								<MinusIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="maximized">
								<MaximizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.StageTrigger stage="default">
								<MinimizeIcon class="size-4" />
							</FloatingPanel.StageTrigger>
							<FloatingPanel.CloseTrigger>
								<XIcon class="size-4" />
							</FloatingPanel.CloseTrigger>
						</FloatingPanel.Control>
					</FloatingPanel.Header>
				</FloatingPanel.DragTrigger>
				<FloatingPanel.Body>
					<p>This is a floating panel with right-to-left (RTL) direction.</p>
					<p>You can drag it from the header or resize it from the bottom-right corner.</p>
				</FloatingPanel.Body>
				<FloatingPanel.ResizeTrigger axis="se" />
			</FloatingPanel.Content>
		</FloatingPanel.Positioner>
	</Portal>
</FloatingPanel>

```

## Anatomy

Here's an overview of how the Floating Panel component is structured in code:

```svelte
<script lang="ts">
	import { FloatingPanel, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<FloatingPanel>
	<FloatingPanel.Trigger />
	<Portal>
		<FloatingPanel.Positioner>
			<FloatingPanel.Content>
				<FloatingPanel.DragTrigger>
					<FloatingPanel.Header>
						<FloatingPanel.Title />
						<FloatingPanel.Control>
							<FloatingPanel.StageTrigger />
							<FloatingPanel.CloseTrigger />
						</FloatingPanel.Control>
					</FloatingPanel.Header>
				</FloatingPanel.DragTrigger>
				<FloatingPanel.Body />
				<FloatingPanel.ResizeTrigger />
			</FloatingPanel.Content>
		</FloatingPanel.Positioner>
	</Portal>
</FloatingPanel>
```

## API Reference

### Root

| Prop                | Description                                                                                                                               | Type                                                                                                             | Default |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------- |
| ids                 | The ids of the elements in the floating panel. Useful for composition.                                                                    | Partial\<\{ trigger: string; positioner: string; content: string; title: string; header: string; }> \| undefined | -       |
| translations        | The translations for the floating panel.                                                                                                  | IntlTranslations \| undefined                                                                                    | -       |
| strategy            | The strategy to use for positioning                                                                                                       | "absolute" \| "fixed" \| undefined                                                                               | "fixed" |
| allowOverflow       | Whether the panel should be strictly contained within the boundary when dragging                                                          | boolean \| undefined                                                                                             | true    |
| open                | The controlled open state of the panel                                                                                                    | boolean \| undefined                                                                                             | -       |
| defaultOpen         | The initial open state of the panel when rendered.&#xA;Use when you don't need to control the open state of the panel.                    | boolean \| undefined                                                                                             | false   |
| draggable           | Whether the panel is draggable                                                                                                            | boolean \| undefined                                                                                             | true    |
| resizable           | Whether the panel is resizable                                                                                                            | boolean \| undefined                                                                                             | true    |
| size                | The size of the panel                                                                                                                     | Size \| undefined                                                                                                | -       |
| defaultSize         | The default size of the panel                                                                                                             | Size \| undefined                                                                                                | -       |
| minSize             | The minimum size of the panel                                                                                                             | Size \| undefined                                                                                                | -       |
| maxSize             | The maximum size of the panel                                                                                                             | Size \| undefined                                                                                                | -       |
| position            | The controlled position of the panel                                                                                                      | Point \| undefined                                                                                               | -       |
| defaultPosition     | The initial position of the panel when rendered.&#xA;Use when you don't need to control the position of the panel.                        | Point \| undefined                                                                                               | -       |
| getAnchorPosition   | Function that returns the initial position of the panel when it is opened.&#xA;If provided, will be used instead of the default position. | ((details: AnchorPositionDetails) => Point) \| undefined                                                         | -       |
| lockAspectRatio     | Whether the panel is locked to its aspect ratio                                                                                           | boolean \| undefined                                                                                             | -       |
| closeOnEscape       | Whether the panel should close when the escape key is pressed                                                                             | boolean \| undefined                                                                                             | -       |
| getBoundaryEl       | The boundary of the panel. Useful for recalculating the boundary rect when&#xA;the it is resized.                                         | (() => HTMLElement \| null) \| undefined                                                                         | -       |
| initialFocusEl      | Element to receive focus when the panel is opened.&#xA;By default, the first focusable element in the content is focused.                 | (() => HTMLElement \| null) \| undefined                                                                         | -       |
| finalFocusEl        | Element to receive focus when the panel is closed.&#xA;By default, the trigger element is focused.                                        | (() => HTMLElement \| null) \| undefined                                                                         | -       |
| restoreFocus        | Whether to restore focus to the trigger when the panel is closed.                                                                         | boolean \| undefined                                                                                             | true    |
| disabled            | Whether the panel is disabled                                                                                                             | boolean \| undefined                                                                                             | -       |
| onPositionChange    | Function called when the position of the panel changes via dragging                                                                       | ((details: PositionChangeDetails) => void) \| undefined                                                          | -       |
| onPositionChangeEnd | Function called when the position of the panel changes via dragging ends                                                                  | ((details: PositionChangeDetails) => void) \| undefined                                                          | -       |
| onOpenChange        | Function called when the panel is opened or closed                                                                                        | ((details: OpenChangeDetails) => void) \| undefined                                                              | -       |
| onSizeChange        | Function called when the size of the panel changes via resizing                                                                           | ((details: SizeChangeDetails) => void) \| undefined                                                              | -       |
| onSizeChangeEnd     | Function called when the size of the panel changes via resizing ends                                                                      | ((details: SizeChangeDetails) => void) \| undefined                                                              | -       |
| persistRect         | Whether the panel size and position should be preserved when it is closed                                                                 | boolean \| undefined                                                                                             | -       |
| gridSize            | The snap grid for the panel                                                                                                               | number \| undefined                                                                                              | 1       |
| onStageChange       | Function called when the stage of the panel changes                                                                                       | ((details: StageChangeDetails) => void) \| undefined                                                             | -       |
| dir                 | The document's text/writing direction.                                                                                                    | "ltr" \| "rtl" \| undefined                                                                                      | "ltr"   |
| getRootNode         | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                | (() => ShadowRoot \| Node \| Document) \| undefined                                                              | -       |
| children            | The default slot content to be rendered within the component.                                                                             | Snippet\<\[]> \| undefined                                                                                       | -       |

### Provider

| Prop     | Description                                                   | Type                               | Default |
| -------- | ------------------------------------------------------------- | ---------------------------------- | ------- |
| value    | -                                                             | () => FloatingPanelApi\<PropTypes> | -       |
| children | The default slot content to be rendered within the component. | Snippet\<\[]> \| undefined         | -       |

### Context

| Prop     | Description | Type                                            | Default |
| -------- | ----------- | ----------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => FloatingPanelApi\<PropTypes>]> | -       |

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

### DragTrigger

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Header

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Title

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Control

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### StageTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |
| stage   | The stage of the panel      | Stage                                               | -       |

### CloseTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Body

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ResizeTrigger

| Prop    | Description                   | Type                                             | Default |
| ------- | ----------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself   | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |
| axis    | The axis of the resize handle | ResizeTriggerAxis                                | -       |

