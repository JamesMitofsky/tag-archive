# Locale Provider

Provides locale context to components for controlling reading direction.

```svelte
<script lang="ts">
	import { LocaleProvider } from '@skeletonlabs/skeleton-svelte';
</script>

<LocaleProvider locale="en-US">
	<!-- your app -->
</LocaleProvider>
```

## Anatomy

Here's an overview of how the LocaleProvider component is structured in code:

```svelte
<script lang="ts">
	import { LocaleProvider } from '@skeletonlabs/skeleton-svelte';
</script>

<LocaleProvider></LocaleProvider>
```

## API Reference

### Root

| Prop     | Description                                                   | Type                       | Default |
| -------- | ------------------------------------------------------------- | -------------------------- | ------- |
| locale   | The locale to use for the application.                        | string                     | 'en-US' |
| children | The default slot content to be rendered within the component. | Snippet\<\[]> \| undefined | -       |

### Context

| Prop     | Description | Type             | Default |
| -------- | ----------- | ---------------- | ------- |
| children | -           | Snippet\<\[any]> | -       |

