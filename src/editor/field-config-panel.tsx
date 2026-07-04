// src/editor/field-config-panel.tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { ChevronDown, ChevronLeft, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Field } from "../schema/types";
import type { SpecFieldError } from "../schema/validate-spec";
import { ConfigSection } from "./panel-sections/config-section";
import { SettingsSection } from "./panel-sections/settings-section";
import { ValidationSection } from "./panel-sections/validation-section";

/** Shared props for every panel section (ConfigSection/ValidationSection/SettingsSection). */
export interface PanelSectionProps {
	field: Field;
	plugin: FieldTypePlugin | undefined;
	/** panel → canvas live update. */
	onFieldChange: (next: Field) => void;
	/** Ambient error from full-draft validation (e.g. a pre-existing duplicate
	 * introduced by something other than typing, like a drag-drop merge).
	 * ConfigSection's own local gate takes precedence when both are set. */
	accessorError: string | null;
	/** Accessors present in the last committed schema. */
	committedAccessors: Set<string>;
	labels: PanelLabels;
}

export interface PanelLabels {
	general: string;
	validation: string;
	typeSettings: string;
	noSettings: string;
	children: string;
	back: string;
	close: string;
	localizable: string;
	accessorInUse: string;
	accessorEmpty: string;
	committedAccessorWarning: string;
	/**
	 * Small addition beyond the T9 brief's literal PanelLabels snippet: the
	 * group children list's per-row "Edit" button needs a label too, and the
	 * project's "all strings via labels" constraint rules out hardcoding one.
	 */
	editChild: string;
}

export interface FieldConfigPanelProps {
	/** null → panel hidden. */
	field: Field | null;
	plugin: FieldTypePlugin | undefined;
	/** from draft validation. */
	fieldErrors: SpecFieldError[];
	onFieldChange: (next: Field) => void;
	onClose: () => void;
	/** set by onEdit / insertion flows. */
	autoFocusLabel?: boolean;
	/** future-proof; v1 renders children list read-only names + Edit buttons
	 * that select the child INTO the panel with a Back control. */
	onSelectChild?: (childAccessor: string) => void;
	/**
	 * Addition beyond the T9 brief's literal FieldConfigPanelProps snippet:
	 * PanelSectionProps (which the brief DOES specify verbatim) requires
	 * `committedAccessors` and `labels` on every section, and this panel is
	 * the only place that can supply them to its children — so it must
	 * accept them itself. T12 wires committedAccessors from
	 * `useMemo(() => new Set(schema.map(f => f.config.api_accessor)), [schema])`.
	 */
	committedAccessors: Set<string>;
	/** T12's DEFAULT_EDITOR_LABELS supplies English defaults; tests pass their own. */
	labels: PanelLabels;
}

function Disclosure({
	title,
	defaultOpen,
	testId,
	children,
}: {
	title: string;
	defaultOpen: boolean;
	testId: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<Box borderBottomWidth="1px" borderColor="border" pb="3" mb="3">
			<Button
				variant="ghost"
				width="full"
				justifyContent="space-between"
				px="0"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				data-testid={`panel-toggle-${testId}`}
			>
				<Text fontSize="sm" fontWeight="semibold">
					{title}
				</Text>
				<ChevronDown
					size={14}
					style={{ transform: open ? "rotate(180deg)" : undefined }}
				/>
			</Button>
			{open && <Box pt="2">{children}</Box>}
		</Box>
	);
}
Disclosure.displayName = "Disclosure";

/** Walks `drillStack` (a path of child accessors) down from the top-level
 * field, stopping early if a step no longer resolves (e.g. the child was
 * deleted out from under an open drill-in). */
function resolveChain(field: Field, drillStack: string[]): Field[] {
	const chain: Field[] = [field];
	for (const accessor of drillStack) {
		const parent = chain[chain.length - 1];
		const found = parent.children?.find(
			(c) => c.config.api_accessor === accessor,
		);
		if (!found) break;
		chain.push(found);
	}
	return chain;
}

export function FieldConfigPanel({
	field,
	plugin,
	fieldErrors,
	onFieldChange,
	onClose,
	autoFocusLabel,
	onSelectChild,
	committedAccessors,
	labels,
}: FieldConfigPanelProps) {
	const [drillStack, setDrillStack] = useState<string[]>([]);
	const containerRef = useRef<HTMLDivElement>(null);
	const topAccessorRef = useRef<string | null>(
		field?.config.api_accessor ?? null,
	);

	// Selecting a different top-level field resets any open drill-in — the
	// child path belongs to the previously selected group, not the new field.
	useEffect(() => {
		const topAccessor = field?.config.api_accessor ?? null;
		if (topAccessorRef.current !== topAccessor) {
			topAccessorRef.current = topAccessor;
			setDrillStack([]);
		}
	}, [field]);

	// `field` is a real dependency, not just autoFocusLabel: re-focus on every
	// newly-selected field while autoFocusLabel stays `true` across
	// consecutive edits (e.g. Edit on field A, then Edit on field B without
	// an intervening plain select, which would otherwise leave the prop
	// unchanged and this effect wouldn't refire).
	useEffect(() => {
		if (!autoFocusLabel || !field) return;
		const input = containerRef.current?.querySelector<HTMLInputElement>(
			'[data-testid="panel-name-input"]',
		);
		input?.focus();
	}, [autoFocusLabel, field]);

	if (!field) return null;

	const chain = resolveChain(field, drillStack);
	const activeField = chain[chain.length - 1];
	// Children don't have a resolvable plugin here (FieldConfigPanel only
	// receives the top-level field's plugin, not a full registry) — v1
	// minimal drill-in shows "No additional settings" for a child rather
	// than risk rendering the wrong type's settings UI.
	const activePlugin = chain.length === 1 ? plugin : undefined;

	function handleActiveFieldChange(next: Field) {
		if (chain.length === 1) {
			onFieldChange(next);
			return;
		}
		// Rebuild the tree bottom-up, replacing each level's edited child by
		// its PRE-edit accessor (captured in `chain`) so a rename of the
		// active child doesn't orphan it from its parent's children array.
		let rebuilt = next;
		for (let i = chain.length - 2; i >= 0; i--) {
			const parent = chain[i];
			const oldChildAccessor = chain[i + 1].config.api_accessor;
			const children = (parent.children ?? []).map((c) =>
				c.config.api_accessor === oldChildAccessor ? rebuilt : c,
			);
			rebuilt = { ...parent, children };
		}
		onFieldChange(rebuilt);
	}

	const accessorError =
		fieldErrors.find(
			(e) =>
				e.code === "duplicate_accessor" &&
				e.accessor === activeField.config.api_accessor,
		)?.message ?? null;

	const sectionProps: PanelSectionProps = {
		field: activeField,
		plugin: activePlugin,
		onFieldChange: handleActiveFieldChange,
		accessorError,
		committedAccessors,
		labels,
	};

	const children = activeField.children ?? [];

	return (
		<Box
			ref={containerRef}
			bg="bg-subtle"
			borderLeftWidth="1px"
			borderColor="border"
			p="4"
			minWidth="72"
			data-testid="field-config-panel"
		>
			{drillStack.length > 0 && (
				<Button
					size="xs"
					variant="ghost"
					mb="2"
					onClick={() => setDrillStack((s) => s.slice(0, -1))}
					data-testid="panel-back"
				>
					<ChevronLeft size={14} />
					{labels.back}
				</Button>
			)}

			<Flex align="center" justify="space-between" mb="4">
				<Box>
					<Text fontWeight="semibold">{activeField.config.name}</Text>
					{activePlugin && (
						<Text fontSize="xs" color="fg.muted">
							{activePlugin.name}
						</Text>
					)}
				</Box>
				<IconButton
					aria-label={labels.close}
					size="xs"
					variant="ghost"
					onClick={onClose}
					data-testid="panel-close"
				>
					<X size={16} />
				</IconButton>
			</Flex>

			<Disclosure title={labels.general} defaultOpen testId="general">
				<ConfigSection {...sectionProps} />
			</Disclosure>

			<Disclosure
				title={labels.validation}
				defaultOpen={false}
				testId="validation"
			>
				<ValidationSection {...sectionProps} />
			</Disclosure>

			<Disclosure
				title={labels.typeSettings}
				defaultOpen={false}
				testId="type-settings"
			>
				<SettingsSection {...sectionProps} />
			</Disclosure>

			{activeField.field_type === "group" && (
				<Disclosure title={labels.children} defaultOpen testId="children">
					<Box>
						{children.map((child) => (
							<Flex
								key={child.config.api_accessor}
								align="center"
								justify="space-between"
								py="1"
							>
								<Box>
									<Text fontSize="sm">{child.config.name}</Text>
									<Text fontSize="xs" color="fg.muted">
										{child.field_type}
									</Text>
								</Box>
								<Button
									size="xs"
									variant="ghost"
									onClick={() => {
										setDrillStack((s) => [...s, child.config.api_accessor]);
										onSelectChild?.(child.config.api_accessor);
									}}
									data-testid={`panel-child-edit-${child.config.api_accessor}`}
								>
									{labels.editChild}
								</Button>
							</Flex>
						))}
					</Box>
				</Disclosure>
			)}
		</Box>
	);
}
FieldConfigPanel.displayName = "FieldConfigPanel";
