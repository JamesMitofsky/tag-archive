# Date Picker

Select dates from a calendar interface.

```svelte
<script lang="ts">
	import { DatePicker, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<DatePicker>
	<DatePicker.Label>Choose Date</DatePicker.Label>
	<DatePicker.Control>
		<DatePicker.Input placeholder="mm/dd/yyyy" />
		<DatePicker.Trigger />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content>
				<DatePicker.View view="day">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableHead>
									<DatePicker.TableRow>
										{#each datePicker().weekDays as weekDay, id (id)}
											<DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>
										{/each}
									</DatePicker.TableRow>
								</DatePicker.TableHead>
								<DatePicker.TableBody>
									{#each datePicker().weeks as week, id (id)}
										<DatePicker.TableRow>
											{#each week as day, id (id)}
												<DatePicker.TableCell value={day}>
													<DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="month">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
										<DatePicker.TableRow>
											{#each months as month, id (id)}
												<DatePicker.TableCell value={month.value}>
													<DatePicker.TableCellTrigger>{month.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="year">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
										<DatePicker.TableRow>
											{#each years as year, id (id)}
												<DatePicker.TableCell value={year.value}>
													<DatePicker.TableCellTrigger>{year.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
			</DatePicker.Content>
		</DatePicker.Positioner>
	</Portal>
</DatePicker>

```

## Usage

Given the scale and scope of the Date Picker component, consider implementing within a local component to add a layer of abstraction. Then utlize the props and event handlers to pass data to and from the component respectively.

## Controlled

Manage the selected date value with controlled state.

```svelte
<script lang="ts">
	import { DatePicker, parseDate, Portal } from '@skeletonlabs/skeleton-svelte';

	let value = $state([parseDate('2025-10-15')]);
</script>

<DatePicker {value} onValueChange={(e) => (value = e.value)}>
	<DatePicker.Label>Picked date: {value.at(0)?.toString()}</DatePicker.Label>
	<DatePicker.Control>
		<DatePicker.Input placeholder="mm/dd/yyyy" />
		<DatePicker.Trigger />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content>
				<DatePicker.View view="day">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableHead>
									<DatePicker.TableRow>
										{#each datePicker().weekDays as weekDay, id (id)}
											<DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>
										{/each}
									</DatePicker.TableRow>
								</DatePicker.TableHead>
								<DatePicker.TableBody>
									{#each datePicker().weeks as week, id (id)}
										<DatePicker.TableRow>
											{#each week as day, id (id)}
												<DatePicker.TableCell value={day}>
													<DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="month">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
										<DatePicker.TableRow>
											{#each months as month, id (id)}
												<DatePicker.TableCell value={month.value}>
													<DatePicker.TableCellTrigger>{month.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="year">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
										<DatePicker.TableRow>
											{#each years as year, id (id)}
												<DatePicker.TableCell value={year.value}>
													<DatePicker.TableCellTrigger>{year.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
			</DatePicker.Content>
		</DatePicker.Positioner>
	</Portal>
</DatePicker>

```

## Disabled

Disable the date picker to prevent user interaction.

```svelte
<script lang="ts">
	import { DatePicker, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<DatePicker disabled>
	<DatePicker.Label>Choose Date</DatePicker.Label>
	<DatePicker.Control>
		<DatePicker.Input placeholder="mm/dd/yyyy" />
		<DatePicker.Trigger />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content>
				<DatePicker.View view="day">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableHead>
									<DatePicker.TableRow>
										{#each datePicker().weekDays as weekDay, id (id)}
											<DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>
										{/each}
									</DatePicker.TableRow>
								</DatePicker.TableHead>
								<DatePicker.TableBody>
									{#each datePicker().weeks as week, id (id)}
										<DatePicker.TableRow>
											{#each week as day, id (id)}
												<DatePicker.TableCell value={day}>
													<DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="month">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
										<DatePicker.TableRow>
											{#each months as month, id (id)}
												<DatePicker.TableCell value={month.value}>
													<DatePicker.TableCellTrigger>{month.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="year">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
										<DatePicker.TableRow>
											{#each years as year, id (id)}
												<DatePicker.TableCell value={year.value}>
													<DatePicker.TableCellTrigger>{year.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
			</DatePicker.Content>
		</DatePicker.Positioner>
	</Portal>
</DatePicker>

```

## Minimum and Maximum

Restrict date selection to a specific range using the `min` and `max` props with the `parseDate` helper function.

```svelte
<script lang="ts">
	import { DatePicker, parseDate, Portal } from '@skeletonlabs/skeleton-svelte';

	const currentDate = new Date();
	const currentYear = currentDate.getFullYear();
</script>

<DatePicker min={parseDate(`${currentYear}-01-01`)} max={parseDate(`${currentYear}-12-31`)}>
	<DatePicker.Label>Choose Date</DatePicker.Label>
	<DatePicker.Control>
		<DatePicker.Input placeholder="mm/dd/yyyy" />
		<DatePicker.Trigger />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content>
				<DatePicker.View view="day">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableHead>
									<DatePicker.TableRow>
										{#each datePicker().weekDays as weekDay, id (id)}
											<DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>
										{/each}
									</DatePicker.TableRow>
								</DatePicker.TableHead>
								<DatePicker.TableBody>
									{#each datePicker().weeks as week, id (id)}
										<DatePicker.TableRow>
											{#each week as day, id (id)}
												<DatePicker.TableCell value={day}>
													<DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="month">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
										<DatePicker.TableRow>
											{#each months as month, id (id)}
												<DatePicker.TableCell value={month.value}>
													<DatePicker.TableCellTrigger>{month.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="year">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
										<DatePicker.TableRow>
											{#each years as year, id (id)}
												<DatePicker.TableCell value={year.value}>
													<DatePicker.TableCellTrigger>{year.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
			</DatePicker.Content>
		</DatePicker.Positioner>
	</Portal>
</DatePicker>

```

## Range Selection

Enable range selection by setting `selectionMode="range"` on the root component. Pair with two inputs fields:

* `index={0}` to represent the start dates.
* `index={1}` to represent the end dates.

```svelte
<script lang="ts">
	import { DatePicker, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<DatePicker selectionMode="range">
	<DatePicker.Label>Select Date Range</DatePicker.Label>
	<DatePicker.Control>
		<DatePicker.Input index={0} placeholder="Start date..." />
		<DatePicker.Input index={1} placeholder="End date..." />
		<DatePicker.Trigger />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content>
				<DatePicker.View view="day">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableHead>
									<DatePicker.TableRow>
										{#each datePicker().weekDays as weekDay, id (id)}
											<DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>
										{/each}
									</DatePicker.TableRow>
								</DatePicker.TableHead>
								<DatePicker.TableBody>
									{#each datePicker().weeks as week, id (id)}
										<DatePicker.TableRow>
											{#each week as day, id (id)}
												<DatePicker.TableCell value={day}>
													<DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="month">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
										<DatePicker.TableRow>
											{#each months as month, id (id)}
												<DatePicker.TableCell value={month.value}>
													<DatePicker.TableCellTrigger>{month.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="year">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
										<DatePicker.TableRow>
											{#each years as year, id (id)}
												<DatePicker.TableCell value={year.value}>
													<DatePicker.TableCellTrigger>{year.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
			</DatePicker.Content>
		</DatePicker.Positioner>
	</Portal>
</DatePicker>

```

### Presets

Use the `PresetTrigger` component to allow users to quickly select predefined date ranges.

```svelte
<script lang="ts">
	import { DatePicker, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<DatePicker selectionMode="range">
	<DatePicker.Label>Select Date Range</DatePicker.Label>
	<DatePicker.Control>
		<DatePicker.Input index={0} placeholder="Start date..." />
		<DatePicker.Input index={1} placeholder="End date..." />
		<DatePicker.Trigger />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content>
				<DatePicker.View view="day">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<div class="flex gap-2">
								<DatePicker.PresetTrigger value="last3Days">Last 3 Days</DatePicker.PresetTrigger>
								<DatePicker.PresetTrigger value="last7Days">Last 7 Days</DatePicker.PresetTrigger>
								<DatePicker.PresetTrigger value="last30Days">Last 30 Days</DatePicker.PresetTrigger>
							</div>
							<DatePicker.Table>
								<DatePicker.TableHead>
									<DatePicker.TableRow>
										{#each datePicker().weekDays as weekDay, id (id)}
											<DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>
										{/each}
									</DatePicker.TableRow>
								</DatePicker.TableHead>
								<DatePicker.TableBody>
									{#each datePicker().weeks as week, id (id)}
										<DatePicker.TableRow>
											{#each week as day, id (id)}
												<DatePicker.TableCell value={day}>
													<DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="month">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
										<DatePicker.TableRow>
											{#each months as month, id (id)}
												<DatePicker.TableCell value={month.value}>
													<DatePicker.TableCellTrigger>{month.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="year">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
										<DatePicker.TableRow>
											{#each years as year, id (id)}
												<DatePicker.TableCell value={year.value}>
													<DatePicker.TableCellTrigger>{year.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
			</DatePicker.Content>
		</DatePicker.Positioner>
	</Portal>
</DatePicker>

```

## Inline calendar

Display the calendar inline without a popover by adding the `inline` prop to the root component. When using inline mode, omit the `Portal` and `Positioner` components.

```svelte
<script lang="ts">
	import { DatePicker } from '@skeletonlabs/skeleton-svelte';
</script>

<DatePicker inline>
	<DatePicker.Label>Choose Date</DatePicker.Label>
	<DatePicker.Content>
		<DatePicker.View view="day">
			<DatePicker.Context>
				{#snippet children(datePicker)}
					<DatePicker.ViewControl>
						<DatePicker.PrevTrigger />
						<DatePicker.ViewTrigger>
							<DatePicker.RangeText />
						</DatePicker.ViewTrigger>
						<DatePicker.NextTrigger />
					</DatePicker.ViewControl>
					<DatePicker.Table>
						<DatePicker.TableHead>
							<DatePicker.TableRow>
								{#each datePicker().weekDays as weekDay, id (id)}
									<DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>
								{/each}
							</DatePicker.TableRow>
						</DatePicker.TableHead>
						<DatePicker.TableBody>
							{#each datePicker().weeks as week, id (id)}
								<DatePicker.TableRow>
									{#each week as day, id (id)}
										<DatePicker.TableCell value={day}>
											<DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
										</DatePicker.TableCell>
									{/each}
								</DatePicker.TableRow>
							{/each}
						</DatePicker.TableBody>
					</DatePicker.Table>
				{/snippet}
			</DatePicker.Context>
		</DatePicker.View>
		<DatePicker.View view="month">
			<DatePicker.Context>
				{#snippet children(datePicker)}
					<DatePicker.ViewControl>
						<DatePicker.PrevTrigger />
						<DatePicker.ViewTrigger>
							<DatePicker.RangeText />
						</DatePicker.ViewTrigger>
						<DatePicker.NextTrigger />
					</DatePicker.ViewControl>
					<DatePicker.Table>
						<DatePicker.TableBody>
							{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
								<DatePicker.TableRow>
									{#each months as month, id (id)}
										<DatePicker.TableCell value={month.value}>
											<DatePicker.TableCellTrigger>{month.label}</DatePicker.TableCellTrigger>
										</DatePicker.TableCell>
									{/each}
								</DatePicker.TableRow>
							{/each}
						</DatePicker.TableBody>
					</DatePicker.Table>
				{/snippet}
			</DatePicker.Context>
		</DatePicker.View>
		<DatePicker.View view="year">
			<DatePicker.Context>
				{#snippet children(datePicker)}
					<DatePicker.ViewControl>
						<DatePicker.PrevTrigger />
						<DatePicker.ViewTrigger>
							<DatePicker.RangeText />
						</DatePicker.ViewTrigger>
						<DatePicker.NextTrigger />
					</DatePicker.ViewControl>
					<DatePicker.Table>
						<DatePicker.TableBody>
							{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
								<DatePicker.TableRow>
									{#each years as year, id (id)}
										<DatePicker.TableCell value={year.value}>
											<DatePicker.TableCellTrigger>{year.label}</DatePicker.TableCellTrigger>
										</DatePicker.TableCell>
									{/each}
								</DatePicker.TableRow>
							{/each}
						</DatePicker.TableBody>
					</DatePicker.Table>
				{/snippet}
			</DatePicker.Context>
		</DatePicker.View>
	</DatePicker.Content>
</DatePicker>

```

## Month and Year Selection

Add `MonthSelect` and `YearSelect` components to provide selectors for quickly changing the month and year.

```svelte
<script lang="ts">
	import { DatePicker, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<DatePicker>
	<DatePicker.Label>Choose Date</DatePicker.Label>
	<DatePicker.Control>
		<DatePicker.Input placeholder="mm/dd/yyyy" />
		<DatePicker.Trigger />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content>
				<DatePicker.YearSelect />
				<DatePicker.MonthSelect />
				<DatePicker.View view="day">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger disabled>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableHead>
									<DatePicker.TableRow>
										{#each datePicker().weekDays as weekDay, id (id)}
											<DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>
										{/each}
									</DatePicker.TableRow>
								</DatePicker.TableHead>
								<DatePicker.TableBody>
									{#each datePicker().weeks as week, id (id)}
										<DatePicker.TableRow>
											{#each week as day, id (id)}
												<DatePicker.TableCell value={day}>
													<DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="month">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
										<DatePicker.TableRow>
											{#each months as month, id (id)}
												<DatePicker.TableCell value={month.value}>
													<DatePicker.TableCellTrigger>{month.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
				<DatePicker.View view="year">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl>
								<DatePicker.PrevTrigger />
								<DatePicker.ViewTrigger>
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger />
							</DatePicker.ViewControl>
							<DatePicker.Table>
								<DatePicker.TableBody>
									{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
										<DatePicker.TableRow>
											{#each years as year, id (id)}
												<DatePicker.TableCell value={year.value}>
													<DatePicker.TableCellTrigger>{year.label}</DatePicker.TableCellTrigger>
												</DatePicker.TableCell>
											{/each}
										</DatePicker.TableRow>
									{/each}
								</DatePicker.TableBody>
							</DatePicker.Table>
						{/snippet}
					</DatePicker.Context>
				</DatePicker.View>
			</DatePicker.Content>
		</DatePicker.Positioner>
	</Portal>
</DatePicker>

```

## Anatomy

Here's an overview of how the DatePicker component is structured in code:

```svelte
<script lang="ts">
	import { DatePicker, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<DatePicker>
	<DatePicker.Label />
	<DatePicker.Control>
		<DatePicker.Input />
		<DatePicker.Trigger />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content>
				<DatePicker.YearSelect />
				<DatePicker.MonthSelect />
				<DatePicker.View>
					<DatePicker.ViewControl>
						<DatePicker.PrevTrigger />
						<DatePicker.ViewTrigger>
							<DatePicker.RangeText />
						</DatePicker.ViewTrigger>
						<DatePicker.NextTrigger />
					</DatePicker.ViewControl>
					<DatePicker.Table>
						<DatePicker.TableHead>
							<DatePicker.TableRow>
								<DatePicker.TableHeader />
							</DatePicker.TableRow>
						</DatePicker.TableHead>
						<DatePicker.TableBody>
							<DatePicker.TableRow>
								<DatePicker.TableCell>
									<DatePicker.TableCellTrigger />
								</DatePicker.TableCell>
							</DatePicker.TableRow>
						</DatePicker.TableBody>
					</DatePicker.Table>
				</DatePicker.View>
			</DatePicker.Content>
		</DatePicker.Positioner>
	</Portal>
</DatePicker>
```

## API Reference

### Root

| Prop                 | Description                                                                                                                                                                                             | Type                                                                                                                                                                                                                                                      | Default  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| locale               | The locale (BCP 47 language tag) to use when formatting the date.                                                                                                                                       | string \| undefined                                                                                                                                                                                                                                       | "en-US"  |
| createCalendar       | A function that creates a Calendar object for a given calendar identifier.&#xA;Enables non-Gregorian calendar support (Persian, Buddhist, Islamic, etc.)&#xA;without bundling all calendars by default. | ((identifier: CalendarIdentifier) => Calendar) \| undefined                                                                                                                                                                                               | -        |
| translations         | The localized messages to use.                                                                                                                                                                          | IntlTranslations \| undefined                                                                                                                                                                                                                             | -        |
| ids                  | The ids of the elements in the date picker. Useful for composition.                                                                                                                                     | Partial\<\{ root: string; label: (index: number) => string; table: (id: string) => string; tableHeader: (id: string) => string; tableBody: (id: string) => string; tableRow: (id: string) => string; ... 11 more ...; positioner: string; }> \| undefined | -        |
| name                 | The \`name\` attribute of the input element.                                                                                                                                                            | string \| undefined                                                                                                                                                                                                                                       | -        |
| timeZone             | The time zone to use                                                                                                                                                                                    | string \| undefined                                                                                                                                                                                                                                       | "UTC"    |
| disabled             | Whether the calendar is disabled.                                                                                                                                                                       | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| readOnly             | Whether the calendar is read-only.                                                                                                                                                                      | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| required             | Whether the date picker is required                                                                                                                                                                     | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| invalid              | Whether the date picker is invalid                                                                                                                                                                      | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| outsideDaySelectable | Whether day outside the visible range can be selected.                                                                                                                                                  | boolean \| undefined                                                                                                                                                                                                                                      | false    |
| min                  | The minimum date that can be selected.                                                                                                                                                                  | DateValue \| undefined                                                                                                                                                                                                                                    | -        |
| max                  | The maximum date that can be selected.                                                                                                                                                                  | DateValue \| undefined                                                                                                                                                                                                                                    | -        |
| closeOnSelect        | Whether the calendar should close after the date selection is complete.&#xA;This is ignored when the selection mode is \`multiple\`.                                                                    | boolean \| undefined                                                                                                                                                                                                                                      | true     |
| openOnClick          | Whether to open the calendar when the input is clicked.                                                                                                                                                 | boolean \| undefined                                                                                                                                                                                                                                      | false    |
| value                | The controlled selected date(s).                                                                                                                                                                        | DateValue\[] \| undefined                                                                                                                                                                                                                                 | -        |
| defaultValue         | The initial selected date(s) when rendered.&#xA;Use when you don't need to control the selected date(s) of the date picker.                                                                             | DateValue\[] \| undefined                                                                                                                                                                                                                                 | -        |
| focusedValue         | The controlled focused date.                                                                                                                                                                            | DateValue \| undefined                                                                                                                                                                                                                                    | -        |
| defaultFocusedValue  | The initial focused date when rendered.&#xA;Use when you don't need to control the focused date of the date picker.                                                                                     | DateValue \| undefined                                                                                                                                                                                                                                    | -        |
| numOfMonths          | The number of months to display.                                                                                                                                                                        | number \| undefined                                                                                                                                                                                                                                       | -        |
| startOfWeek          | The first day of the week.&#xA; \`0\` - Sunday&#xA; \`1\` - Monday&#xA; \`2\` - Tuesday&#xA; \`3\` - Wednesday&#xA; \`4\` - Thursday&#xA; \`5\` - Friday&#xA; \`6\` - Saturday                          | number \| undefined                                                                                                                                                                                                                                       | -        |
| fixedWeeks           | Whether the calendar should have a fixed number of weeks.&#xA;This renders the calendar with 6 weeks instead of 5 or 6.                                                                                 | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| showWeekNumbers      | Whether to show the week number column in the day view.                                                                                                                                                 | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| onValueChange        | Function called when the value changes.                                                                                                                                                                 | ((details: ValueChangeDetails) => void) \| undefined                                                                                                                                                                                                      | -        |
| onFocusChange        | Function called when the focused date changes.                                                                                                                                                          | ((details: FocusChangeDetails) => void) \| undefined                                                                                                                                                                                                      | -        |
| onViewChange         | Function called when the view changes.                                                                                                                                                                  | ((details: ViewChangeDetails) => void) \| undefined                                                                                                                                                                                                       | -        |
| onVisibleRangeChange | Function called when the visible range changes.                                                                                                                                                         | ((details: VisibleRangeChangeDetails) => void) \| undefined                                                                                                                                                                                               | -        |
| onOpenChange         | Function called when the calendar opens or closes.                                                                                                                                                      | ((details: OpenChangeDetails) => void) \| undefined                                                                                                                                                                                                       | -        |
| isDateUnavailable    | Returns whether a date of the calendar is available.                                                                                                                                                    | ((date: DateValue, locale: string) => boolean) \| undefined                                                                                                                                                                                               | -        |
| selectionMode        | The selection mode of the calendar.&#xA;- \`single\` - only one date can be selected&#xA;- \`multiple\` - multiple dates can be selected&#xA;- \`range\` - a range of dates can be selected             | SelectionMode \| undefined                                                                                                                                                                                                                                | "single" |
| maxSelectedDates     | The maximum number of dates that can be selected.&#xA;This is only applicable when \`selectionMode\` is \`multiple\`.                                                                                   | number \| undefined                                                                                                                                                                                                                                       | -        |
| format               | The format of the date to display in the input.                                                                                                                                                         | ((date: DateValue, details: LocaleDetails) => string) \| undefined                                                                                                                                                                                        | -        |
| parse                | Function to parse the date from the input back to a DateValue.                                                                                                                                          | ((value: string, details: LocaleDetails) => DateValue \| undefined) \| undefined                                                                                                                                                                          | -        |
| placeholder          | The placeholder text to display in the input.                                                                                                                                                           | string \| undefined                                                                                                                                                                                                                                       | -        |
| view                 | The view of the calendar                                                                                                                                                                                | DateView \| undefined                                                                                                                                                                                                                                     | -        |
| defaultView          | The default view of the calendar                                                                                                                                                                        | DateView \| undefined                                                                                                                                                                                                                                     | "day"    |
| minView              | The minimum view of the calendar                                                                                                                                                                        | DateView \| undefined                                                                                                                                                                                                                                     | "day"    |
| maxView              | The maximum view of the calendar                                                                                                                                                                        | DateView \| undefined                                                                                                                                                                                                                                     | "year"   |
| positioning          | The user provided options used to position the date picker content                                                                                                                                      | PositioningOptions \| undefined                                                                                                                                                                                                                           | -        |
| open                 | The controlled open state of the date picker                                                                                                                                                            | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| defaultOpen          | The initial open state of the date picker when rendered.&#xA;Use when you don't need to control the open state of the date picker.                                                                      | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| inline               | Whether to render the date picker inline                                                                                                                                                                | boolean \| undefined                                                                                                                                                                                                                                      | -        |
| dir                  | The document's text/writing direction.                                                                                                                                                                  | "ltr" \| "rtl" \| undefined                                                                                                                                                                                                                               | "ltr"    |
| getRootNode          | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                                                                              | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                                                                       | -        |
| element              | Render the element yourself                                                                                                                                                                             | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                                                                          | -        |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => DatePickerApi\<PropTypes>                  | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                         | Default |
| -------- | ----------- | -------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => DatePickerApi\<PropTypes>]> | -       |

### Label

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### Control

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### PresetTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| value   | -                           | PresetTriggerValue                                  | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Input

| Prop      | Description                             | Type                                               | Default |
| --------- | --------------------------------------- | -------------------------------------------------- | ------- |
| index     | The index of the input to focus.        | number \| undefined                                | -       |
| fixOnBlur | Whether to fix the input value on blur. | boolean \| undefined                               | true    |
| element   | Render the element yourself             | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

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

### YearSelect

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"select">]> \| undefined | -       |

### MonthSelect

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"select">]> \| undefined | -       |

### View

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| view    | -                           | DateView \| undefined                            | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ViewControl

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### PrevTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### ViewTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### RangeText

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### NextTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Table

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"table">]> \| undefined | -       |

### TableHead

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"thead">]> \| undefined | -       |

### TableRow

| Prop    | Description                 | Type                                            | Default |
| ------- | --------------------------- | ----------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"tr">]> \| undefined | -       |

### TableHeader

| Prop    | Description                 | Type                                            | Default |
| ------- | --------------------------- | ----------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"th">]> \| undefined | -       |

### TableBody

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"tbody">]> \| undefined | -       |

### TableCell

| Prop         | Description                 | Type                                            | Default |
| ------------ | --------------------------- | ----------------------------------------------- | ------- |
| disabled     | -                           | boolean \| undefined                            | -       |
| value        | -                           | number \| DateValue                             | -       |
| columns      | -                           | number \| undefined                             | -       |
| visibleRange | -                           | VisibleRange \| undefined                       | -       |
| element      | Render the element yourself | Snippet\<\[HTMLAttributes\<"td">]> \| undefined | -       |

### TableCellTrigger

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

