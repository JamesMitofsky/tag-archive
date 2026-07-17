# Tabs

Use tabs to quickly switch between different views and pages.

```svelte
<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
</script>

<Tabs defaultValue="overview">
	<Tabs.List>
		<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
		<Tabs.Trigger value="features">Key features</Tabs.Trigger>
		<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
		<Tabs.Indicator />
	</Tabs.List>
	<Tabs.Content value="overview">
		A concise overview of the project: usage, goals, and recent highlights. Use this area to orient readers with key metrics and links to
		deeper docs.
	</Tabs.Content>
	<Tabs.Content value="features">
		List the most important features here with short, pragmatic descriptions so readers can scan for what matters (accessibility, theming,
		integrations).
	</Tabs.Content>
	<Tabs.Content value="activity">
		Show recent activity or sample data: new releases, PRs merged, or notable user events. This helps examples feel realistic and
		actionable.
	</Tabs.Content>
</Tabs>

```

## Controlled

Use the `value` and `onValueChange` props to control state programmatically.

```svelte
<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';

	let value = $state('overview');
</script>

<Tabs {value} onValueChange={(details) => (value = details.value)}>
	<Tabs.List>
		<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
		<Tabs.Trigger value="features">Key features</Tabs.Trigger>
		<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
		<Tabs.Indicator />
	</Tabs.List>
	<Tabs.Content value="overview">
		A concise overview of the project: usage, goals, and recent highlights. Use this area to orient readers with key metrics and links to
		deeper docs.
	</Tabs.Content>
	<Tabs.Content value="features">
		List the most important features here with short, pragmatic descriptions so readers can scan for what matters (accessibility, theming,
		integrations).
	</Tabs.Content>
	<Tabs.Content value="activity">
		Show recent activity or sample data: new releases, PRs merged, or notable user events. This helps examples feel realistic and
		actionable.
	</Tabs.Content>
</Tabs>

```

## Navigation

Use the `element` slot to override the default `button` with an `a` tag for navigation tabs.

```svelte
<script lang="ts">
	/**
	 * Because demonstrating navigation inside a code snippet is not feasible, this example uses local state to simulate URL path changes.
	 *
	 * In a real application, you would:
	 * - Replace the `url` variable with the `url` of the current page.
	 * - Replace `onValueChange={(details) => setUrl(details.value)}` with `navigate((details) => navigate(details.value))` using your framework's navigation method.
	 */
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	let url = $state.raw('#overview');
</script>

<Tabs value={url} onValueChange={(details) => (url = details.value)}>
	<Tabs.List>
		<Tabs.Trigger value="#overview">
			{#snippet element(attributes)}
				<a {...attributes as HTMLAnchorAttributes} href="#overview">Overview</a>
			{/snippet}
		</Tabs.Trigger>
		<Tabs.Trigger value="#key-features">
			{#snippet element(attributes)}
				<a {...attributes as HTMLAnchorAttributes} href="#key-features">Key Features</a>
			{/snippet}
		</Tabs.Trigger>
		<Tabs.Trigger value="#activity">
			{#snippet element(attributes)}
				<a {...attributes as HTMLAnchorAttributes} href="#activity">Activity</a>
			{/snippet}
		</Tabs.Trigger>
		<Tabs.Indicator />
	</Tabs.List>
	<Tabs.Content value="#overview">
		A concise overview of the project: usage, goals, and recent highlights. Use this area to orient readers with key metrics and links to
		deeper docs.
	</Tabs.Content>
	<Tabs.Content value="#key-features">
		List the most important features here with short, pragmatic descriptions so readers can scan for what matters (accessibility, theming,
		integrations).
	</Tabs.Content>
	<Tabs.Content value="#activity">
		Show recent activity or sample data: new releases, PRs merged, or notable user events. This helps examples feel realistic and
		actionable.
	</Tabs.Content>
</Tabs>

```

## Fluid Width

Use `flex` utility classes to make the tabs stretch to fill the width of their container.

```svelte
<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
</script>

<Tabs defaultValue="overview">
	<Tabs.List>
		<Tabs.Trigger class="flex-1" value="overview">Overview</Tabs.Trigger>
		<Tabs.Trigger class="flex-1" value="features">Key features</Tabs.Trigger>
		<Tabs.Trigger class="flex-1" value="activity">Activity</Tabs.Trigger>
		<Tabs.Indicator />
	</Tabs.List>
	<Tabs.Content value="overview">
		A concise overview of the project: usage, goals, and recent highlights. Use this area to orient readers with key metrics and links to
		deeper docs.
	</Tabs.Content>
	<Tabs.Content value="features">
		List the most important features here with short, pragmatic descriptions so readers can scan for what matters (accessibility, theming,
		integrations).
	</Tabs.Content>
	<Tabs.Content value="activity">
		Show recent activity or sample data: new releases, PRs merged, or notable user events. This helps examples feel realistic and
		actionable.
	</Tabs.Content>
</Tabs>

```

## Orientation

Using the `orientation` prop to control the layout.

```svelte
<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
</script>

<Tabs defaultValue="overview" orientation="vertical">
	<Tabs.List>
		<Tabs.Trigger value="overview" class="justify-start">Overview</Tabs.Trigger>
		<Tabs.Trigger value="features" class="justify-start">Key features</Tabs.Trigger>
		<Tabs.Trigger value="activity" class="justify-start">Activity</Tabs.Trigger>
		<Tabs.Indicator />
	</Tabs.List>
	<Tabs.Content value="overview">
		A concise overview of the project: usage, goals, and recent highlights. Use this area to orient readers with key metrics and links to
		deeper docs.
	</Tabs.Content>
	<Tabs.Content value="features">
		List the most important features here with short, pragmatic descriptions so readers can scan for what matters (accessibility, theming,
		integrations).
	</Tabs.Content>
	<Tabs.Content value="activity">
		Show recent activity or sample data: new releases, PRs merged, or notable user events. This helps examples feel realistic and
		actionable.
	</Tabs.Content>
</Tabs>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
</script>

<Tabs defaultValue="overview" dir="rtl">
	<Tabs.List>
		<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
		<Tabs.Trigger value="features">Key features</Tabs.Trigger>
		<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
		<Tabs.Indicator />
	</Tabs.List>
	<Tabs.Content value="overview">
		A concise overview of the project: usage, goals, and recent highlights. Use this area to orient readers with key metrics and links to
		deeper docs.
	</Tabs.Content>
	<Tabs.Content value="features">
		List the most important features here with short, pragmatic descriptions so readers can scan for what matters (accessibility, theming,
		integrations).
	</Tabs.Content>
	<Tabs.Content value="activity">
		Show recent activity or sample data: new releases, PRs merged, or notable user events. This helps examples feel realistic and
		actionable.
	</Tabs.Content>
</Tabs>

```

## Anatomy

Here's an overview of how the Tabs component is structured in code:

```svelte
<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
</script>

<Tabs>
	<Tabs.List>
		<Tabs.Trigger />
		<Tabs.Indicator />
	</Tabs.List>
	<Tabs.Content />
</Tabs>
```

## API Reference

### Root

| Prop           | Description                                                                                                                                                                                                       | Type                                                                                                                                               | Default      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| ids            | The ids of the elements in the tabs. Useful for composition.                                                                                                                                                      | Partial\<\{ root: string; trigger: (value: string) => string; list: string; content: (value: string) => string; indicator: string; }> \| undefined | -            |
| translations   | Specifies the localized strings that identifies the accessibility elements and their states                                                                                                                       | IntlTranslations \| undefined                                                                                                                      | -            |
| loopFocus      | Whether the keyboard navigation will loop from last tab to first, and vice versa.                                                                                                                                 | boolean \| undefined                                                                                                                               | true         |
| value          | The controlled selected tab value                                                                                                                                                                                 | string \| null \| undefined                                                                                                                        | -            |
| defaultValue   | The initial selected tab value when rendered.&#xA;Use when you don't need to control the selected tab value.                                                                                                      | string \| null \| undefined                                                                                                                        | -            |
| orientation    | The orientation of the tabs. Can be \`horizontal\` or \`vertical\`&#xA;- \`horizontal\`: only left and right arrow key navigation will work.&#xA;- \`vertical\`: only up and down arrow key navigation will work. | "horizontal" \| "vertical" \| undefined                                                                                                            | "horizontal" |
| activationMode | The activation mode of the tabs. Can be \`manual\` or \`automatic\`&#xA;- \`manual\`: Tabs are activated when clicked or press \`enter\` key.&#xA;- \`automatic\`: Tabs are activated when receiving focus        | "manual" \| "automatic" \| undefined                                                                                                               | "automatic"  |
| onValueChange  | Callback to be called when the selected/active tab changes                                                                                                                                                        | ((details: ValueChangeDetails) => void) \| undefined                                                                                               | -            |
| onFocusChange  | Callback to be called when the focused tab changes                                                                                                                                                                | ((details: FocusChangeDetails) => void) \| undefined                                                                                               | -            |
| composite      | Whether the tab is composite                                                                                                                                                                                      | boolean \| undefined                                                                                                                               | -            |
| deselectable   | Whether the active tab can be deselected when clicking on it.                                                                                                                                                     | boolean \| undefined                                                                                                                               | -            |
| navigate       | Function to navigate to the selected tab when clicking on it.&#xA;Useful if tab triggers are anchor elements.                                                                                                     | ((details: NavigateDetails) => void) \| null \| undefined                                                                                          | -            |
| dir            | The document's text/writing direction.                                                                                                                                                                            | "ltr" \| "rtl" \| undefined                                                                                                                        | "ltr"        |
| getRootNode    | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                                                                                        | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                | -            |
| element        | Render the element yourself                                                                                                                                                                                       | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                   | -            |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => TabsApi\<PropTypes>                        | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                   | Default |
| -------- | ----------- | -------------------------------------- | ------- |
| children | -           | Snippet\<\[() => TabsApi\<PropTypes>]> | -       |

### List

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Trigger

| Prop     | Description                 | Type                                                | Default |
| -------- | --------------------------- | --------------------------------------------------- | ------- |
| value    | The value of the tab        | string                                              | -       |
| disabled | Whether the tab is disabled | boolean \| undefined                                | -       |
| element  | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Indicator

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Content

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | The value of the tab        | string                                           | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

