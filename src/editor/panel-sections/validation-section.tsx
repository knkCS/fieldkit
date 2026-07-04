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
export function ValidationSection({ field, onFieldChange }: PanelSectionProps) {
	const validation = field.validation ?? {};

	function commitValidation(next: FieldValidation) {
		const hasKeys = Object.keys(next).length > 0;
		onFieldChange({ ...field, validation: hasKeys ? next : undefined });
	}

	function handleMinLength(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value;
		const next = { ...validation };
		if (raw === "") delete next.min_length;
		else next.min_length = Number(raw);
		commitValidation(next);
	}

	function handleMaxLength(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value;
		const next = { ...validation };
		if (raw === "") delete next.max_length;
		else next.max_length = Number(raw);
		commitValidation(next);
	}

	function handlePattern(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value;
		const next = { ...validation };
		if (!raw) delete next.pattern;
		else next.pattern = raw;
		commitValidation(next);
	}

	function handlePatternMessage(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value;
		const next = { ...validation };
		if (!raw) delete next.pattern_message;
		else next.pattern_message = raw;
		commitValidation(next);
	}

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
						Min length
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
						Max length
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
					Pattern (regex)
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
					Pattern message
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
				<Text fontSize="sm">Unique</Text>
			</Box>
		</Box>
	);
}
ValidationSection.displayName = "ValidationSection";
