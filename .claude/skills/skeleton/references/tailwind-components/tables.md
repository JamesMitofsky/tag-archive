# Tables

Provides a set of styles for native HTML table elements.

```astro
---
const tableData = [
	{ position: '0', name: 'Iron', symbol: 'Fe', atomic_no: '26' },
	{ position: '1', name: 'Rhodium', symbol: 'Rh', atomic_no: '45' },
	{ position: '2', name: 'Iodine', symbol: 'I', atomic_no: '53' },
	{ position: '3', name: 'Radon', symbol: 'Rn', atomic_no: '86' },
	{ position: '4', name: 'Technetium', symbol: 'Tc', atomic_no: '43' },
];
---

<div class="card bg-surface-100-900 p-4 table-wrap">
	<!-- - -->
	<table class="table caption-bottom">
		<tbody class="[&>tr]:hover:preset-tonal-brand">
			{
				tableData.map((row) => (
					<tr>
						<td>{row.position}</td>
						<td>{row.symbol}</td>
						<td>{row.name}</td>
						<td class="text-right">{row.atomic_no}</td>
					</tr>
				))
			}
		</tbody>
	</table>
	<!-- - -->
</div>

```

## Zebra Striping

Apply the `table-zebra` class to add alternating row background colors.

```astro
---
const tableData = [
	{ position: '0', name: 'Iron', symbol: 'Fe', atomic_no: '26' },
	{ position: '1', name: 'Rhodium', symbol: 'Rh', atomic_no: '45' },
	{ position: '2', name: 'Iodine', symbol: 'I', atomic_no: '53' },
	{ position: '3', name: 'Radon', symbol: 'Rn', atomic_no: '86' },
	{ position: '4', name: 'Technetium', symbol: 'Tc', atomic_no: '43' },
];
---

<div class="table-wrap">
	<table class="table table-zebra caption-bottom">
		<tbody class="[&>tr]:hover:preset-tonal-brand">
			{
				tableData.map((row) => (
					<tr>
						<td>{row.position}</td>
						<td>{row.symbol}</td>
						<td>{row.name}</td>
						<td class="text-right">{row.atomic_no}</td>
					</tr>
				))
			}
		</tbody>
	</table>
</div>

```

## Extras

Optionally add a header, footer, and caption.

```astro
---
const tableData = [
	{ position: '0', name: 'Iron', symbol: 'Fe', atomic_no: '26' },
	{ position: '1', name: 'Rhodium', symbol: 'Rh', atomic_no: '45' },
	{ position: '2', name: 'Iodine', symbol: 'I', atomic_no: '53' },
	{ position: '3', name: 'Radon', symbol: 'Rn', atomic_no: '86' },
	{ position: '4', name: 'Technetium', symbol: 'Tc', atomic_no: '43' },
];
---

<div class="table-wrap">
	<table class="table caption-bottom">
		<caption class="pt-4">A list of elements from the periodic table.</caption>
		<thead>
			<tr>
				<th>Position</th>
				<th>Symbol</th>
				<th>Name</th>
				<th class="text-right!">Weight</th>
			</tr>
		</thead>
		<tbody class="[&>tr]:hover:preset-tonal-brand">
			{
				tableData.map((row) => (
					<tr>
						<td>{row.position}</td>
						<td>{row.symbol}</td>
						<td>{row.name}</td>
						<td class="text-right">{row.atomic_no}</td>
					</tr>
				))
			}
		</tbody>
		<tfoot>
			<tr>
				<td colspan="3">Total</td>
				<td class="text-right">{tableData.length} Elements</td>
			</tr>
		</tfoot>
	</table>
</div>

```

## Navigation

Note that table rows and cells are [not interactive](https://www.w3.org/WAI/ARIA/apg/patterns/table/). Instead, use anchors or buttons within the last cell.

```astro
---
const tableData = [
	{ first: 'Liam', last: 'Steele', email: 'liam@email.com' },
	{ first: 'Athena', last: 'Marks', email: 'athena@email.com' },
	{ first: 'Angela', last: 'Rivers', email: 'angela@email.com' },
];
---

<div class="table-wrap">
	<table class="table caption-bottom">
		<tbody>
			<thead>
				<tr>
					<th>First Name</th>
					<th>Last Name</th>
					<th>Email</th>
					<th>&nbsp;</th>
				</tr>
			</thead>
			{
				tableData.map((row) => (
					<tr>
						<td>{row.first}</td>
						<td>{row.last}</td>
						<td>{row.email}</td>
						<td class="text-right">
							<a class="btn btn-xs preset-tonal" href="#">
								View &rarr;
							</a>
						</td>
					</tr>
				))
			}
		</tbody>
	</table>
</div>

```

## Layout

See [Tailwind's utility classes](https://tailwindcss.com/docs/table-layout) for adjusting the table layout algorithm. Apply this to the Table element.

\| Class         | Styles               |
\| ------------- | -------------------- |
\| `table-auto`  | table-layout: auto;  |
\| `table-fixed` | table-layout: fixed; |

## Hover Rows

Add a visual hover effect using the following Tailwind syntax.

```html
<tbody class="[&>tr]:hover:preset-tonal-primary">
	...
</tbody>
```

## Pagination

Pair with the Skeleton [Pagination](/docs/\[framework]/framework-components/pagination/) component for large data sets.

## Framework Components

