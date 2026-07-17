<script lang="ts">
	import { DatePicker, parseDate, Portal } from '@skeletonlabs/skeleton-svelte';

	// Wrapper around Skeleton's DatePicker. Keeps the verbose calendar markup out of
	// the form and exposes a hidden <input> so the native POST still sees `name=YYYY-MM-DD`.
	let {
		name,
		label,
		value: initial = ''
	}: { name: string; label: string; value?: string } = $props();

	// CalendarDate[]; `.toString()` yields the ISO `YYYY-MM-DD` the server expects.
	// svelte-ignore state_referenced_locally
	let value = $state(initial ? [parseDate(initial)] : []);
	const iso = $derived(value.at(0)?.toString() ?? '');
</script>

<DatePicker {value} onValueChange={(e) => (value = e.value)}>
	<DatePicker.Label class="label-text">{label}</DatePicker.Label>
	<DatePicker.Control class="mt-1.5 flex gap-2">
		<DatePicker.Input class="input" placeholder="yyyy-mm-dd" />
		<DatePicker.Trigger class="text-surface-500 hover:text-surface-900-100 px-1" />
	</DatePicker.Control>
	<Portal>
		<DatePicker.Positioner>
			<DatePicker.Content class="card z-50 bg-surface-50-950 p-4 shadow-xl">
				<DatePicker.View view="day">
					<DatePicker.Context>
						{#snippet children(datePicker)}
							<DatePicker.ViewControl class="flex items-center justify-between">
								<DatePicker.PrevTrigger class="btn-icon preset-tonal" />
								<DatePicker.ViewTrigger class="btn preset-tonal">
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger class="btn-icon preset-tonal" />
							</DatePicker.ViewControl>
							<DatePicker.Table class="mt-2">
								<DatePicker.TableHead>
									<DatePicker.TableRow>
										{#each datePicker().weekDays as weekDay, id (id)}
											<DatePicker.TableHeader class="text-surface-500 text-xs">
												{weekDay.short}
											</DatePicker.TableHeader>
										{/each}
									</DatePicker.TableRow>
								</DatePicker.TableHead>
								<DatePicker.TableBody>
									{#each datePicker().weeks as week, id (id)}
										<DatePicker.TableRow>
											{#each week as day, id (id)}
												<DatePicker.TableCell value={day}>
													<DatePicker.TableCellTrigger
														class="btn-icon hover:preset-tonal data-selected:preset-filled-primary-500"
													>
														{day.day}
													</DatePicker.TableCellTrigger>
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
							<DatePicker.ViewControl class="flex items-center justify-between">
								<DatePicker.PrevTrigger class="btn-icon preset-tonal" />
								<DatePicker.ViewTrigger class="btn preset-tonal">
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger class="btn-icon preset-tonal" />
							</DatePicker.ViewControl>
							<DatePicker.Table class="mt-2">
								<DatePicker.TableBody>
									{#each datePicker().getMonthsGrid({ columns: 4, format: 'short' }) as months, id (id)}
										<DatePicker.TableRow>
											{#each months as month, id (id)}
												<DatePicker.TableCell value={month.value}>
													<DatePicker.TableCellTrigger
														class="btn hover:preset-tonal data-selected:preset-filled-primary-500"
													>
														{month.label}
													</DatePicker.TableCellTrigger>
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
							<DatePicker.ViewControl class="flex items-center justify-between">
								<DatePicker.PrevTrigger class="btn-icon preset-tonal" />
								<DatePicker.ViewTrigger class="btn preset-tonal">
									<DatePicker.RangeText />
								</DatePicker.ViewTrigger>
								<DatePicker.NextTrigger class="btn-icon preset-tonal" />
							</DatePicker.ViewControl>
							<DatePicker.Table class="mt-2">
								<DatePicker.TableBody>
									{#each datePicker().getYearsGrid({ columns: 4 }) as years, id (id)}
										<DatePicker.TableRow>
											{#each years as year, id (id)}
												<DatePicker.TableCell value={year.value}>
													<DatePicker.TableCellTrigger
														class="btn hover:preset-tonal data-selected:preset-filled-primary-500"
													>
														{year.label}
													</DatePicker.TableCellTrigger>
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

<!-- Resolved ISO date the server action reads. -->
<input type="hidden" {name} value={iso} />
