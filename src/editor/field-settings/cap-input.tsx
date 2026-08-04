// src/editor/field-settings/cap-input.tsx
import { Box, Input, Text } from "@chakra-ui/react";
import type { ChangeEvent } from "react";

export interface CapInputProps {
	label: string;
	/** The sentence under the box. It must say what an empty box means. */
	helperText: string;
	/** The cap as stored — `undefined` when the Field sets none. */
	value: number | undefined;
	/**
	 * The smallest cap worth offering. A number below it is raised to it rather
	 * than stored: an Author cannot usefully author a cap the Field could never
	 * satisfy, and silently reading such a cap as "unset" is the very
	 * conflation this control exists to avoid.
	 */
	min: number;
	/** What an empty box shows, so "no limit" is read rather than inferred. */
	placeholder: string;
	/**
	 * Handed `undefined` when the box is emptied — never `0`. Unset and zero
	 * are different caps, and only the caller knows which key to drop.
	 */
	onChange: (cap: number | undefined) => void;
	testId: string;
}

/**
 * One numeric cap in a type-settings panel, with an empty box meaning "no cap".
 *
 * It exists to write that last sentence down once. Every cap in this package
 * has three states an Author can reach — unset, zero, and a number — and
 * collapsing the first two is a real bug with a real name: knkCMS core reads
 * its reference cap as `settings.max_items ?? 0` and so disables adding on a
 * Field that never set one. A control that reports `undefined` for an empty box
 * makes that mistake impossible to make by accident at the call site.
 *
 * Styled to match `panel-sections/validation-section.tsx` — the panel's other
 * numeric inputs — rather than introducing a second look for one field type.
 */
export function CapInput({
	label,
	helperText,
	value,
	min,
	placeholder,
	onChange,
	testId,
}: CapInputProps) {
	function handleChange(event: ChangeEvent<HTMLInputElement>) {
		// A number input reports `""` for anything it cannot parse — a lone "-",
		// a half-typed "1e" — so an empty box is both "cleared" and "mid-edit
		// nonsense", and either way the Field has no cap. That is also why the
		// guard below can only fire if this element stops being `type="number"`:
		// storing `NaN` would read back as unset anyway, but silently.
		const raw = event.target.value.trim();
		if (raw === "") return onChange(undefined);
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) return;
		onChange(Math.max(min, Math.trunc(parsed)));
	}

	return (
		<Box>
			{/* The helper sits outside the <label> on purpose: a label wraps its
			    descendants into the input's accessible name, and a sentence about
			    what empty means is not a name. */}
			<Box as="label" display="block">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					{label}
				</Text>
				<Input
					size="sm"
					mt="1"
					type="number"
					min={min}
					value={value ?? ""}
					onChange={handleChange}
					placeholder={placeholder}
					data-testid={testId}
				/>
			</Box>
			<Text fontSize="xs" color="fg.muted" mt="1">
				{helperText}
			</Text>
		</Box>
	);
}
CapInput.displayName = "CapInput";
