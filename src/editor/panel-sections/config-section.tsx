// src/editor/panel-sections/config-section.tsx
import { Box, Flex, Input, Text, Textarea } from "@chakra-ui/react";
import type { ChangeEvent, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import type { Field } from "../../schema/types";
import { slugify } from "../draft-ops";
import type { PanelSectionProps } from "../field-config-panel";

export interface ConfigSectionProps extends PanelSectionProps {
	/** Threaded from FieldConfigPanel so its autofocus effect can call
	 * `.focus()` directly on the Name input's DOM node instead of querying
	 * for its `data-testid` at runtime (that attribute stays a test hook
	 * only). */
	nameInputRef?: Ref<HTMLInputElement>;
}

/**
 * General section: name, accessor, instructions, required, default value,
 * hidden/readOnly/localizable. Every control applies its change immediately
 * via onFieldChange, except name/accessor/instructions which additionally
 * trim on blur (trimming per keystroke would make typing spaces impossible).
 *
 * The accessor input is the one control with real local state: it must be
 * able to display an in-progress, INVALID value (empty or colliding) without
 * that value ever reaching the draft (see the module-level contract notes in
 * field-config-panel.tsx). Name/instructions don't need this — every value
 * the user can type for them is valid, so they stay fully controlled by
 * `field.config.*` and apply on every keystroke.
 */
export function ConfigSection({
	field,
	onFieldChange,
	accessorError: externalAccessorError,
	takenAccessors,
	committedAccessors,
	labels,
	nameInputRef,
}: ConfigSectionProps) {
	// Tracks the last Field object *this component* produced via apply(), so
	// the resync effect below can tell "field changed because we edited it"
	// (skip resync — local state already reflects it) apart from "field
	// changed because a different field got selected" (resync local state).
	const appliedFieldRef = useRef<Field | null>(null);
	// Auto-slug latch: true means the user has (or the field already had, at
	// selection time, per the baseline-aware rule below) taken manual control
	// of the accessor, so name edits stop re-deriving it.
	const manuallyEditedRef = useRef(false);
	// The accessor as of the last time a *different* field was selected —
	// the "committed warning" comparison baseline.
	const syncedAccessorRef = useRef(field.config.api_accessor);

	const [accessorInput, setAccessorInput] = useState(field.config.api_accessor);
	const [localAccessorError, setLocalAccessorError] = useState<string | null>(
		null,
	);

	useEffect(() => {
		if (field === appliedFieldRef.current) return; // our own edit, echoed back
		setAccessorInput(field.config.api_accessor);
		setLocalAccessorError(null);
		syncedAccessorRef.current = field.config.api_accessor;
		// Baseline-aware latch: new-in-draft fields (accessor not yet
		// committed) start with auto-slug ACTIVE; committed fields never
		// auto-slug.
		manuallyEditedRef.current = committedAccessors.has(
			field.config.api_accessor,
		);
		appliedFieldRef.current = field;
	}, [field, committedAccessors]);

	// Re-arm the latch the instant the SELECTED field's accessor becomes
	// committed — e.g. right after a successful Save, while the field stays
	// selected. The resync effect above intentionally skips its own echoed-
	// back edit (`field === appliedFieldRef.current`), but a Save doesn't
	// change the draft field's object identity, so that effect alone never
	// re-arms the latch post-save. Committed fields must never auto-slug
	// again (F1), regardless of whose edit `field` currently reflects — this
	// effect only ever ARMS the latch (true), never disarms it, so it can't
	// fight the baseline-aware reset above when a genuinely different,
	// not-yet-committed field is selected next.
	useEffect(() => {
		if (committedAccessors.has(field.config.api_accessor)) {
			manuallyEditedRef.current = true;
		}
	}, [committedAccessors, field.config.api_accessor]);

	function apply(next: Field) {
		appliedFieldRef.current = next;
		onFieldChange(next);
	}

	/**
	 * Empty → accessorEmpty; taken in the LIVE DRAFT → accessorInUse.
	 * `takenAccessors` already excludes the field's own current accessor, so
	 * re-typing it is a no-op, not a clash. committedAccessors is deliberately
	 * NOT consulted here — a committed accessor absent from the draft (its
	 * field was deleted this session) is free to take.
	 */
	function validateAccessor(value: string): string | null {
		if (value.trim() === "") return labels.accessorEmpty;
		if (takenAccessors.has(value)) return labels.accessorInUse;
		return null;
	}

	function handleNameChange(e: ChangeEvent<HTMLInputElement>) {
		const newName = e.target.value;
		let nextAccessor = field.config.api_accessor;
		if (!manuallyEditedRef.current) {
			const slugged = slugify(newName);
			const err = validateAccessor(slugged);
			// Show the attempted slug + error either way, but only apply a
			// VALID slug to the draft — a colliding auto-slug must never reach
			// updateField (which replaces ALL accessor matches and would
			// destroy the other field's config). The name itself still applies.
			setAccessorInput(slugged);
			setLocalAccessorError(err);
			if (!err) nextAccessor = slugged;
		}
		apply({
			...field,
			config: { ...field.config, name: newName, api_accessor: nextAccessor },
		});
	}

	function handleNameBlur() {
		const trimmed = field.config.name.trim();
		if (trimmed !== field.config.name) {
			apply({ ...field, config: { ...field.config, name: trimmed } });
		}
	}

	function handleAccessorChange(e: ChangeEvent<HTMLInputElement>) {
		manuallyEditedRef.current = true;
		const value = e.target.value;
		setAccessorInput(value);
		const err = validateAccessor(value);
		setLocalAccessorError(err);
		if (!err) {
			apply({ ...field, config: { ...field.config, api_accessor: value } });
		}
		// Invalid values are gated here: the draft never sees them.
	}

	function handleAccessorBlur() {
		const trimmed = accessorInput.trim();
		if (trimmed === accessorInput) return;
		setAccessorInput(trimmed);
		const err = validateAccessor(trimmed);
		setLocalAccessorError(err);
		if (!err) {
			apply({ ...field, config: { ...field.config, api_accessor: trimmed } });
		}
	}

	function handleInstructionsChange(e: ChangeEvent<HTMLTextAreaElement>) {
		apply({
			...field,
			config: { ...field.config, instructions: e.target.value },
		});
	}

	function handleInstructionsBlur() {
		const trimmed = field.config.instructions.trim();
		if (trimmed !== field.config.instructions) {
			apply({ ...field, config: { ...field.config, instructions: trimmed } });
		}
	}

	function handleDefaultValueChange(e: ChangeEvent<HTMLInputElement>) {
		const value = e.target.value;
		apply({
			...field,
			config: { ...field.config, default_value: value || undefined },
		});
	}

	function handleCheckbox(
		key: "required" | "hidden" | "read_only" | "localizable",
	) {
		return (e: ChangeEvent<HTMLInputElement>) => {
			apply({
				...field,
				config: { ...field.config, [key]: e.target.checked },
			});
		};
	}

	const accessorError = localAccessorError ?? externalAccessorError;
	const isCommittedField = committedAccessors.has(syncedAccessorRef.current);
	const showCommittedWarning =
		!accessorError &&
		isCommittedField &&
		accessorInput !== syncedAccessorRef.current;

	const defaultValue =
		field.config.default_value != null
			? String(field.config.default_value)
			: "";

	return (
		<Box>
			<Box as="label" display="block" mb="3">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					{labels.name}
				</Text>
				<Input
					ref={nameInputRef}
					size="sm"
					mt="1"
					value={field.config.name}
					onChange={handleNameChange}
					onBlur={handleNameBlur}
					data-testid="panel-name-input"
				/>
			</Box>

			<Box as="label" display="block" mb="1">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					{labels.accessor}
				</Text>
				<Input
					size="sm"
					mt="1"
					value={accessorInput}
					onChange={handleAccessorChange}
					onBlur={handleAccessorBlur}
					disabled={field.system}
					borderColor={accessorError ? "danger.600" : undefined}
					data-testid="panel-accessor-input"
				/>
			</Box>
			{accessorError && (
				<Text
					fontSize="xs"
					color="danger.600"
					mb="3"
					data-testid="accessor-error"
				>
					{accessorError}
				</Text>
			)}
			{!accessorError && showCommittedWarning && (
				<Text
					fontSize="xs"
					color="warning.600"
					mb="3"
					data-testid="accessor-warning"
				>
					{labels.committedAccessorWarning}
				</Text>
			)}
			{!accessorError && !showCommittedWarning && <Box mb="3" />}

			<Box as="label" display="flex" alignItems="center" gap="2" mb="3">
				<input
					type="checkbox"
					checked={field.config.required}
					onChange={handleCheckbox("required")}
					data-testid="panel-required-input"
				/>
				<Text fontSize="sm">{labels.required}</Text>
			</Box>

			<Box as="label" display="block" mb="3">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					{labels.instructions}
				</Text>
				<Textarea
					size="sm"
					mt="1"
					rows={2}
					value={field.config.instructions}
					onChange={handleInstructionsChange}
					onBlur={handleInstructionsBlur}
					data-testid="panel-instructions-input"
				/>
			</Box>

			<Box as="label" display="block" mb="3">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					{labels.defaultValue}
				</Text>
				<Input
					size="sm"
					mt="1"
					value={defaultValue}
					onChange={handleDefaultValueChange}
					data-testid="panel-default-input"
				/>
			</Box>

			<Flex gap="4">
				<Box as="label" display="flex" alignItems="center" gap="2">
					<input
						type="checkbox"
						checked={field.config.hidden ?? false}
						onChange={handleCheckbox("hidden")}
						data-testid="panel-hidden-input"
					/>
					<Text fontSize="sm">{labels.hidden}</Text>
				</Box>
				<Box as="label" display="flex" alignItems="center" gap="2">
					<input
						type="checkbox"
						checked={field.config.read_only ?? false}
						onChange={handleCheckbox("read_only")}
						data-testid="panel-readonly-input"
					/>
					<Text fontSize="sm">{labels.readOnly}</Text>
				</Box>
				<Box as="label" display="flex" alignItems="center" gap="2">
					<input
						type="checkbox"
						checked={field.config.localizable ?? false}
						onChange={handleCheckbox("localizable")}
						data-testid="panel-localizable-input"
					/>
					<Text fontSize="sm">{labels.panelLocalizable}</Text>
				</Box>
			</Flex>
		</Box>
	);
}
ConfigSection.displayName = "ConfigSection";
