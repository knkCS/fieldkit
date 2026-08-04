// src/editor/field-settings/pin-mode-picker.tsx
import { Box, chakra, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { useId } from "react";
import type { PinMode } from "../../schema/reference";

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the Author reads. */
interface PinModeOption {
	id: PinMode;
	label: string;
}

/**
 * What each mode is called where an Author reads it.
 *
 * The two pinning modes are named after the things they pin to; not pinning is
 * named after what it gets you, because "none" says nothing about the
 * behaviour. Fieldkit names the two kinds — the setting already does — without
 * modelling either of them (ADR-0002).
 */
const PIN_MODE_OPTIONS: PinModeOption[] = [
	{ id: "none", label: "The newest version" },
	{ id: "release", label: "A chosen release" },
	{ id: "version", label: "A chosen version" },
];

export interface PinModePickerProps {
	label: string;
	/** The mode currently set. Absent settings read as `"none"` at the caller,
	 * so this control never has to model "unset" as a fourth state. */
	value: PinMode;
	onChange: (mode: PinMode) => void;
}

/**
 * Chooses whether a Reference Field pins, and to what.
 *
 * Shared by both reference settings editors, on the same terms as
 * `BlueprintPicker`: the setting means exactly the same thing for one Reference
 * as for a tree, so it must not be written down twice. It is the same
 * `BaseSelect` that picker uses, so the two controls in one Type settings tab
 * do not read as two different design systems.
 *
 * The warning under it is the whole reason this setting is not an ordinary one.
 * A Pin stores only a target id and never which *kind* of target it is
 * (ADR-0008), so every Pin already saved stops meaning anything the moment the
 * mode changes. Fieldkit does not — and cannot — rewrite those values: only a
 * Consumer knows whether any Content would be stranded, and it is the
 * Consumer's content upgrade that nulls them. Saying so plainly is all this
 * control can do.
 */
export function PinModePicker({ label, value, onChange }: PinModePickerProps) {
	const inputId = useId();
	const selected =
		PIN_MODE_OPTIONS.find((option) => option.id === value) ??
		PIN_MODE_OPTIONS[0];

	return (
		<Box>
			{/* The warning sits outside the label on purpose: a <label> wraps its
			    descendants into the control's accessible name, and a sentence about
			    stranded pins is not a name. `htmlFor` rather than wrapping, because
			    a <label> around react-select's composite would name the widget from
			    everything inside it (see blueprint-picker.tsx). */}
			<chakra.label
				htmlFor={inputId}
				display="block"
				fontSize="xs"
				fontWeight="medium"
				color="fg.muted"
				mb="1"
			>
				{label}
			</chakra.label>

			<BaseSelect<PinModeOption>
				inputId={inputId}
				// Matches the panel's other controls — one settings tab must not
				// hold two sizes of the same kind of control.
				size="sm"
				options={PIN_MODE_OPTIONS}
				value={selected}
				onChange={(next) => {
					const option = Array.isArray(next) ? next[0] : next;
					// Clearing is not a fourth state: a Field always has a mode, and
					// not pinning is the one it falls back to.
					onChange(option ? option.id : "none");
				}}
			/>

			<Text fontSize="xs" color="fg.muted" mt="1">
				Changing this strands every pin already saved — those references fall
				back to the newest version.
			</Text>
		</Box>
	);
}
PinModePicker.displayName = "PinModePicker";
