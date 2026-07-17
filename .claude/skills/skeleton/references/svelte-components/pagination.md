# Pagination

Client and server-side pagination controls.

```svelte
<script lang="ts" module>
	const PAGE_SIZE = 5;
</script>

<script>
	import { users } from './data';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Pagination } from '@skeletonlabs/skeleton-svelte';

	let page = $state(1);

	const start = $derived((page - 1) * PAGE_SIZE);
	const end = $derived(start + PAGE_SIZE);
	const paginatedUsers = $derived(users.slice(start, end));
</script>

<div class="grid gap-4 w-full place-items-center">
	<table class="table table-auto">
		<thead>
			<tr>
				<th>ID</th>
				<th>Name</th>
				<th>Email</th>
				<th>Country</th>
			</tr>
		</thead>
		<tbody>
			{#each paginatedUsers as user}
				<tr>
					<td>{user.id}</td>
					<td>{user.name}</td>
					<td>{user.email}</td>
					<td>{user.country}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<Pagination count={users.length} pageSize={PAGE_SIZE} {page} onPageChange={(event) => (page = event.page)}>
		<Pagination.PrevTrigger>
			<ArrowLeftIcon class="size-4" />
		</Pagination.PrevTrigger>
		<Pagination.Context>
			{#snippet children(pagination)}
				{#each pagination().pages as page, index (page)}
					{#if page.type === 'page'}
						<Pagination.Item {...page}>
							{page.value}
						</Pagination.Item>
					{:else}
						<Pagination.Ellipsis {index}>&#8230;</Pagination.Ellipsis>
					{/if}
				{/each}
			{/snippet}
		</Pagination.Context>
		<Pagination.NextTrigger>
			<ArrowRightIcon class="size-4" />
		</Pagination.NextTrigger>
	</Pagination>
</div>

```

```ts
import { faker } from '@faker-js/faker';

faker.seed(0);

export const users = Array.from({ length: 500 }, (_, i) => ({
	id: i + 1,
	name: faker.person.fullName(),
	email: faker.internet.email(),
	country: faker.location.country(),
}));

```

## Page Size

Implement a custom page `pageSize` amount using a select element.

```svelte
<script lang="ts">
	import { users } from './data';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Pagination } from '@skeletonlabs/skeleton-svelte';

	let page = $state(1);
	let pageSize = $state(5);

	const start = $derived((page - 1) * pageSize);
	const end = $derived(start + pageSize);
	const paginatedUsers = $derived(users.slice(start, end));
</script>

<div class="grid gap-4 w-full place-items-center">
	<table class="table table-auto">
		<thead>
			<tr>
				<th>ID</th>
				<th>Name</th>
				<th>Email</th>
				<th>Country</th>
			</tr>
		</thead>
		<tbody>
			{#each paginatedUsers as user}
				<tr>
					<td>{user.id}</td>
					<td>{user.name}</td>
					<td>{user.email}</td>
					<td>{user.country}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<div class="flex justify-between items-center gap-4 w-full">
		<label class="label">
			<span class="sr-only">Page Size</span>
			<select class="select w-fit" value={String(pageSize)} onchange={(e) => (pageSize = Number(e.currentTarget.value))}>
				<option value="5">5</option>
				<option value="10">10</option>
				<option value="20">20</option>
			</select>
		</label>
		<Pagination count={users.length} {pageSize} {page} onPageChange={(event) => (page = event.page)}>
			<Pagination.PrevTrigger>
				<ArrowLeftIcon class="size-4" />
			</Pagination.PrevTrigger>
			<Pagination.Context>
				{#snippet children(pagination)}
					{#each pagination().pages as page, index (page)}
						{#if page.type === 'page'}
							<Pagination.Item {...page}>
								{page.value}
							</Pagination.Item>
						{:else}
							<Pagination.Ellipsis {index}>&#8230;</Pagination.Ellipsis>
						{/if}
					{/each}
				{/snippet}
			</Pagination.Context>
			<Pagination.NextTrigger>
				<ArrowRightIcon class="size-4" />
			</Pagination.NextTrigger>
		</Pagination>
	</div>
</div>

```

```ts
import { faker } from '@faker-js/faker';

faker.seed(0);

export const users = Array.from({ length: 500 }, (_, i) => ({
	id: i + 1,
	name: faker.person.fullName(),
	email: faker.internet.email(),
	country: faker.location.country(),
}));

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts" module>
	const PAGE_SIZE = 5;
</script>

<script lang="ts">
	import { users } from './data';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Pagination } from '@skeletonlabs/skeleton-svelte';

	let page = $state(1);

	const start = $derived((page - 1) * PAGE_SIZE);
	const end = $derived(start + PAGE_SIZE);
	const paginatedUsers = $derived(users.slice(start, end));
</script>

<div class="grid gap-4 w-full place-items-center">
	<table class="table table-auto">
		<thead>
			<tr>
				<th>ID</th>
				<th>Name</th>
				<th>Email</th>
				<th>Country</th>
			</tr>
		</thead>
		<tbody>
			{#each paginatedUsers as user}
				<tr>
					<td>{user.id}</td>
					<td>{user.name}</td>
					<td>{user.email}</td>
					<td>{user.country}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<Pagination count={users.length} pageSize={PAGE_SIZE} {page} onPageChange={(event) => (page = event.page)} dir="rtl">
		<Pagination.PrevTrigger>
			<ArrowRightIcon class="size-4" />
		</Pagination.PrevTrigger>
		<Pagination.Context>
			{#snippet children(pagination)}
				{#each pagination().pages as page, index (page)}
					{#if page.type === 'page'}
						<Pagination.Item {...page}>
							{page.value}
						</Pagination.Item>
					{:else}
						<Pagination.Ellipsis {index}>&#8230;</Pagination.Ellipsis>
					{/if}
				{/each}
			{/snippet}
		</Pagination.Context>
		<Pagination.NextTrigger>
			<ArrowLeftIcon class="size-4" />
		</Pagination.NextTrigger>
	</Pagination>
</div>

```

```ts
import { faker } from '@faker-js/faker';

faker.seed(0);

export const users = Array.from({ length: 500 }, (_, i) => ({
	id: i + 1,
	name: faker.person.fullName(),
	email: faker.internet.email(),
	country: faker.location.country(),
}));

```

## Total Count

For server-side pagination, your data source may be truncated. Make sure to specify the total records using `count`.

```ts
const res = {
	"results": [...],
	"pagination": {
		"page": 1,
		"limit": 10,
		"count": 500,
	}
}
```

{/* prettier-ignore */}

```html
<Pagination
	page={res.pagination.page}
	count={res.pagination.count}
	pageSize={res.pagination.limit}
>
	<!-- ... -->
</Pagination>
```

## Anatomy

Here's an overview of how the Pagination component is structured in code:

```svelte
<script lang="ts">
	import { Pagination } from '@skeletonlabs/skeleton-svelte';
</script>

<Pagination>
	<Pagination.FirstTrigger />
	<Pagination.PrevTrigger />
	<Pagination.Item />
	<Pagination.Ellipsis />
	<Pagination.NextTrigger />
	<Pagination.LastTrigger />
</Pagination>
```

## API Reference

### Root

| Prop             | Description                                                                                                                      | Type                                                                                                                                                                                                | Default  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ids              | The ids of the elements in the accordion. Useful for composition.                                                                | Partial\<\{ root: string; ellipsis: (index: number) => string; firstTrigger: string; prevTrigger: string; nextTrigger: string; lastTrigger: string; item: (page: number) => string; }> \| undefined | -        |
| translations     | Specifies the localized strings that identifies the accessibility elements and their states                                      | IntlTranslations \| undefined                                                                                                                                                                       | -        |
| count            | Total number of data items                                                                                                       | number \| undefined                                                                                                                                                                                 | -        |
| pageSize         | The controlled number of data items per page                                                                                     | number \| undefined                                                                                                                                                                                 | -        |
| defaultPageSize  | The initial number of data items per page when rendered.&#xA;Use when you don't need to control the page size of the pagination. | number \| undefined                                                                                                                                                                                 | 10       |
| siblingCount     | Number of pages to show beside active page                                                                                       | number \| undefined                                                                                                                                                                                 | 1        |
| boundaryCount    | Number of pages to show at the beginning and end                                                                                 | number \| undefined                                                                                                                                                                                 | 1        |
| page             | The controlled active page                                                                                                       | number \| undefined                                                                                                                                                                                 | -        |
| defaultPage      | The initial active page when rendered.&#xA;Use when you don't need to control the active page of the pagination.                 | number \| undefined                                                                                                                                                                                 | 1        |
| onPageChange     | Called when the page number is changed                                                                                           | ((details: PageChangeDetails) => void) \| undefined                                                                                                                                                 | -        |
| onPageSizeChange | Called when the page size is changed                                                                                             | ((details: PageSizeChangeDetails) => void) \| undefined                                                                                                                                             | -        |
| type             | The type of the trigger element                                                                                                  | "button" \| "link" \| undefined                                                                                                                                                                     | "button" |
| getPageUrl       | Function to generate href attributes for pagination links.&#xA;Only used when \`type\` is set to "link".                         | ((details: PageUrlDetails) => string) \| undefined                                                                                                                                                  | -        |
| dir              | The document's text/writing direction.                                                                                           | "ltr" \| "rtl" \| undefined                                                                                                                                                                         | "ltr"    |
| getRootNode      | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                       | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                 | -        |
| element          | Render the element yourself                                                                                                      | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                    | -        |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => PaginationApi\<PropTypes>                  | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                         | Default |
| -------- | ----------- | -------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => PaginationApi\<PropTypes>]> | -       |

### FirstTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### PrevTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Item

| Prop    | Description                 | Type                                           | Default |
| ------- | --------------------------- | ---------------------------------------------- | ------- |
| type    | -                           | "page"                                         | -       |
| value   | -                           | number                                         | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"a">]> \| undefined | -       |

### Ellipsis

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| index   | -                           | number                                            | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### NextTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### LastTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

