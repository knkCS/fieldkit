// src/editor/field-settings/pin-mode-picker.tsx
import { Box, NativeSelect, Text } from "@chakra-ui/react";
import type { ChangeEvent } from "react";
import type { PinMode } from "../../schema/reference";

/** What each mode is called where an Author reads it. The two pinning modes
 * are named after the things they pin to; not pinning is named after what it
 * gets you, because "none" says nothing about the behaviour. */
const PIN_MODE_LABELS: { value: PinMode; label: string }[] = [
	{ value: "none", label: "The newest version" },
	{ value: "release", label: "A chosen release" },
	{ value: "version", label: "A chosen version" },
];

export interface PinModePickerProps {
	label: string;
	/** The mode currently set. Absent settings read as `"none"` at the caller,
	 * so this control never has to model "unset" as a fourth state. */
	value: PinMode;
	onChange: (mode: PinMode) => void;
	testId: string;
}

/**
 * Chooses whether a Reference Field pins, and to what.
 *
 * Shared by both reference settings editors, on the same terms as
 * `BlueprintPicker`: the setting means exactly the same thing for one Reference
 * as for a tree, so it must not be written down twice.
 *
 * A plain select styled to match the panel's other controls. The warning under
 * it is the whole reason this setting is not an ordinary one: a Pin stores only
 * a target id and never which *kind* of target it is (ADR-0008), so changing
 * the mode strands every Pin already saved at once. Fieldkit cannot refuse the
 * change — only a Consumer knows whether any Content would be stranded — so
 * saying so plainly is all it can do.
 */
export function PinModePicker({
	label,
	value,
	onChange,
	testId,
}: PinModePickerProps) {
	function handleChange(e: ChangeEvent<HTMLSelectElement>) {
		onChange(e.currentTarget.value as PinMode);
	}

	return (
		<Box>
			{/* The warning sits outside the <label> on purpose: a label wraps its
			    descendants into the control's accessible name, and a sentence
			    about stranded pins is not a name. */}
			<Box as="label" display="block">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					{label}
				</Text>
				<NativeSelect.Root size="sm" mt="1">
					<NativeSelect.Field
						value={value}
						onChange={handleChange}
						data-testid={testId}
					>
						{PIN_MODE_LABELS.map((mode) => (
							<option key={mode.value} value={mode.value}>
								{mode.label}
							</option>
						))}
					</NativeSelect.Field>
					<NativeSelect.Indicator />
				</NativeSelect.Root>
			</Box>
			<Text fontSize="xs" color="fg.muted" mt="1">
				Changing this clears every pin already saved — those references fall
				back to the newest version.
			</Text>
		</Box>
	);
}
PinModePicker.displayName = "PinModePicker";
