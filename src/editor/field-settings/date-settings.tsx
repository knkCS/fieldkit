// src/editor/field-settings/date-settings.tsx
import { Box, Stack } from "@chakra-ui/react";
import { DatePickerField, SwitchField } from "@knkcs/anker/forms";
import { useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { DateSettings } from "../../schema/field-types/date";
import type { SettingsProps } from "../../schema/plugin";
import { SettingLockReason, useSettingLock } from "./setting-lock";

interface DateSettingsForm {
	enable_range: boolean;
	min_date: string;
	max_date: string;
}

const INVERTED = "The latest date must be on or after the earliest date";

/**
 * Type-settings editor for `date` (#313): the earliest and latest date a value
 * may hold, picked with anker's `DatePickerField` — the generated form would
 * offer them as free text — and whether the Field holds a range.
 *
 * A date's limits are these settings, never `validation.min_length` and
 * friends, which a date does not honour (its Catalogue entry lists no
 * validations, so the Validation tab is hidden).
 *
 * anker's form fields read a React Hook Form context, so the three controls
 * share a scratch form of their own: it mirrors `settings` (`values`) and
 * writes each edit straight back through `onChange` — the panel applies
 * settings immediately, and nothing here buffers. A cleared limit is removed,
 * not stored as `""` (ADR-0021). A latest date before the earliest is written
 * as typed, so the author can go on to fix either end, and reported at the
 * latest date; each picker is also bounded by the other.
 */
export function DateSettingsEditor({
	settings,
	onChange,
}: SettingsProps<DateSettings>) {
	const rangeLock = useSettingLock("enable_range");
	const minLock = useSettingLock("min_date");
	const maxLock = useSettingLock("max_date");

	const values = useMemo<DateSettingsForm>(
		() => ({
			enable_range: settings?.enable_range === true,
			min_date: settings?.min_date ?? "",
			max_date: settings?.max_date ?? "",
		}),
		[settings?.enable_range, settings?.min_date, settings?.max_date],
	);
	const methods = useForm<DateSettingsForm>({
		values,
		resetOptions: { keepErrors: true },
	});

	// The latest render's settings and onChange, read by the subscription
	// below, which is set up once.
	const latest = useRef({ settings, onChange });
	latest.current = { settings, onChange };

	useEffect(() => {
		const subscription = methods.watch((form, { name }) => {
			// A `values` sync resets the form without naming a field; only an
			// edit names one, and only an edit is written back.
			if (!name) return;
			const { settings: current, onChange: write } = latest.current;
			const next: DateSettings = { ...current };
			if (name === "enable_range") {
				next.enable_range = form.enable_range === true;
			} else {
				const value = form[name];
				if (typeof value === "string" && value !== "") next[name] = value;
				else delete next[name];
			}
			write(next);
		});
		return () => subscription.unsubscribe();
	}, [methods]);

	// ISO dates (YYYY-MM-DD) order as strings do.
	const inverted =
		values.min_date !== "" &&
		values.max_date !== "" &&
		values.max_date < values.min_date;
	useEffect(() => {
		if (inverted) {
			methods.setError("max_date", { type: "validate", message: INVERTED });
		} else {
			methods.clearErrors("max_date");
		}
	}, [inverted, methods]);

	const scope = values.enable_range
		? "Both ends of the range must fall on or after this date."
		: undefined;

	return (
		<FormProvider {...methods}>
			<Stack gap="4">
				<Box>
					<SwitchField<DateSettingsForm>
						name="enable_range"
						label="Date range"
						helperText="The field holds a start and an end date."
						disabled={rangeLock.locked}
						showDirtyState={false}
					/>
					<SettingLockReason lock={rangeLock} />
				</Box>
				<Box>
					<DatePickerField<DateSettingsForm>
						name="min_date"
						label="Earliest date"
						helperText={scope}
						max={values.max_date || undefined}
						disabled={minLock.locked}
						showDirtyState={false}
					/>
					<SettingLockReason lock={minLock} />
				</Box>
				<Box>
					<DatePickerField<DateSettingsForm>
						name="max_date"
						label="Latest date"
						helperText={
							values.enable_range
								? "Both ends of the range must fall on or before this date."
								: undefined
						}
						min={values.min_date || undefined}
						disabled={maxLock.locked}
						showDirtyState={false}
					/>
					<SettingLockReason lock={maxLock} />
				</Box>
			</Stack>
		</FormProvider>
	);
}
DateSettingsEditor.displayName = "DateSettingsEditor";
