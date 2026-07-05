// src/editor/panel-sections/validation-section.tsx
import { Box, Flex, Input, Text } from "@chakra-ui/react";
import type { ChangeEvent } from "react";
import type { FieldValidation } from "../../schema/types";
import type { PanelSectionProps } from "../field-config-panel";

/**
 * Validation section: min/max length, pattern, pattern message, unique.
 * `unique` actually lives on `field.config` (not `field.validation`), per
 * FieldConfig — it's grouped here for the UI only, matching field-modal's
 * original "Validation" heading. Numeric/string fields empty out to key
 * removal (ported from field-modal.tsx:179-185), and the whole `validation`
 * object collapses to `undefined` once every key is gone.
 */
export function ValidationSection({
	field,
	onFieldChange,
	labels,
}: PanelSectionProps) {
	const validation = field.validation ?? {};

	function commitValidation(next: FieldValidation) {
		const hasKeys = Object.keys(next).length > 0;
		onFieldChange({ ...field, validation: hasKeys ? next : undefined });
	}

	/**
	 * Every validation-field handler is "empty input → delete the key,
	 * otherwise set it (optionally parsed, e.g. Number() for the length
	 * fields)" — this factory replaces four near-identical copies of that
	 * same shape.
	 */
	function makeValidationHandler<K extends keyof FieldValidation>(
		key: K,
		parse: (raw: string) => FieldValidation[K] = (raw) =>
			raw as FieldValidation[K],
	) {
		return (e: ChangeEvent<HTMLInputElement>) => {
			const raw = e.target.value;
			const next = { ...validation };
			if (!raw) delete next[key];
			else next[key] = parse(raw);
			commitValidation(next);
		};
	}

	const handleMinLength = makeValidationHandler("min_length", Number);
	const handleMaxLength = makeValidationHandler("max_length", Number);
	const handlePattern = makeValidationHandler("pattern");
	const handlePatternMessage = makeValidationHandler("pattern_message");

	function handleUnique(e: ChangeEvent<HTMLInputElement>) {
		onFieldChange({
			...field,
			config: { ...field.config, unique: e.target.checked },
		});
	}

	return (
		<Box>
			<Flex gap="3" mb="3">
				<Box as="label" display="block" flex="1">
					<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
						{labels.minLength}
					</Text>
					<Input
						size="sm"
						mt="1"
						type="number"
						value={validation.min_length ?? ""}
						onChange={handleMinLength}
						data-testid="panel-min-length-input"
					/>
				</Box>
				<Box as="label" display="block" flex="1">
					<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
						{labels.maxLength}
					</Text>
					<Input
						size="sm"
						mt="1"
						type="number"
						value={validation.max_length ?? ""}
						onChange={handleMaxLength}
						data-testid="panel-max-length-input"
					/>
				</Box>
			</Flex>

			<Box as="label" display="block" mb="3">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					{labels.pattern}
				</Text>
				<Input
					size="sm"
					mt="1"
					value={validation.pattern ?? ""}
					onChange={handlePattern}
					data-testid="panel-pattern-input"
				/>
			</Box>

			<Box as="label" display="block" mb="3">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					{labels.patternMessage}
				</Text>
				<Input
					size="sm"
					mt="1"
					value={validation.pattern_message ?? ""}
					onChange={handlePatternMessage}
					data-testid="panel-pattern-message-input"
				/>
			</Box>

			<Box as="label" display="flex" alignItems="center" gap="2">
				<input
					type="checkbox"
					checked={field.config.unique ?? false}
					onChange={handleUnique}
					data-testid="panel-unique-input"
				/>
				<Text fontSize="sm">{labels.unique}</Text>
			</Box>
		</Box>
	);
}
ValidationSection.displayName = "ValidationSection";
