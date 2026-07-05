// src/editor/field-config-panel.tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { ChevronDown, ChevronLeft, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Field, Schema } from "../schema/types";
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
	/**
	 * Accessors the active field may NOT take, derived from the LIVE DRAFT by
	 * FieldConfigPanel (top-level field: every other top-level accessor;
	 * drilled child: its sibling children within the parent group). This — not
	 * `committedAccessors` — is the collision gate: two new-in-draft fields
	 * colliding would otherwise slip through and a later `updateField` (which
	 * replaces ALL accessor matches) would destroy one field's config.
	 */
	takenAccessors: Set<string>;
	/** Accessors present in the last committed schema — drives the disconnect
	 * warning and the auto-slug latch baseline, NOT collision checking. */
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
	/**
	 * Final-review batch: ConfigSection and ValidationSection hardcoded their
	 * control labels in English (Name, Accessor, Required, …) despite the
	 * project's "every author-facing string routes through labels" rule.
	 * These twelve keys route those controls through PanelLabels like every
	 * other panel string.
	 */
	name: string;
	accessor: string;
	required: string;
	instructions: string;
	defaultValue: string;
	hidden: string;
	readOnly: string;
	minLength: string;
	maxLength: string;
	pattern: string;
	patternMessage: string;
	unique: string;
}

export interface FieldConfigPanelProps {
	/** null → panel hidden. */
	field: Field | null;
	plugin: FieldTypePlugin | undefined;
	/**
	 * The LIVE draft schema. The panel derives the accessor collision pool
	 * for the active field from it (see PanelSectionProps.takenAccessors) —
	 * `committedAccessors` alone cannot catch collisions between two fields
	 * that were both added in the current draft session.
	 */
	draft: Schema;
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
	 * accept them itself.
	 *
	 * IMPORTANT for T12: build this set RECURSIVELY — top-level accessors AND
	 * every group's children accessors (all nesting levels). A flat
	 * `new Set(schema.map((f) => f.config.api_accessor))` would omit committed
	 * group children; their auto-slug latch would then start ACTIVE and a
	 * simple name edit would silently re-slug a saved child's accessor,
	 * disconnecting its data.
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
	draft,
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
	const prevAutoFocusRef = useRef(false);
	const focusChainRef = useRef<{
		accessor: string | null;
		raf1: number;
		raf2?: number;
	} | null>(null);

	// Selecting a different top-level field resets any open drill-in — the
	// child path belongs to the previously selected group, not the new field.
	useEffect(() => {
		const topAccessor = field?.config.api_accessor ?? null;
		if (topAccessorRef.current !== topAccessor) {
			topAccessorRef.current = topAccessor;
			setDrillStack([]);
		}
	}, [field]);

	// Focus the name input on the RISING EDGE of autoFocusLabel only. The
	// field object changes identity on every applied edit, so depending on it
	// would steal focus back to the name input on each keystroke in any other
	// panel control. T12 resets autoFocusLabel to false on plain select and
	// sets it true on Edit — each Edit produces a fresh rising edge.
	//
	// DOUBLE requestAnimationFrame: the ⊕ popover (zag-js Popover) restores
	// focus to its trigger button on close via a SINGLE rAF. If this effect
	// focused the name input synchronously (or after only one rAF), zag's
	// restore — scheduled afterward on close — would still win the race and
	// steal focus back to the "Add field" trigger, verified live in Storybook
	// via Playwright (activeElement ended up on the trigger button, not the
	// name input). Waiting two frames guarantees this focus call runs strictly
	// after zag's single-rAF restore, regardless of whether autoFocusLabel
	// rose from an insertion or a toolbar Edit click.
	//
	// The chain is deliberately NOT cancelled by a RETURNED cleanup tied to
	// [autoFocusLabel]. spec-editor.tsx's "pulse" resets autoFocusLabel back
	// to false immediately after setting it true (so the NEXT Edit also gets
	// a fresh rising edge) — that reset lands in the SAME passive-effect
	// flush, before either scheduled frame has had a chance to fire. A
	// cleanup keyed to the dependency change would cancel the chain on that
	// falling edge and autofocus would never happen. Instead: a NEW rising
	// edge cancels any still-pending chain from a previous one (guarded
	// below), true unmount cancels via the ref-cleanup effect right after,
	// and the final callback re-checks the accessor in case the selected
	// field genuinely changed while the two frames were in flight.
	useEffect(() => {
		const rising = Boolean(autoFocusLabel) && !prevAutoFocusRef.current;
		prevAutoFocusRef.current = Boolean(autoFocusLabel);
		if (!rising) return;

		if (focusChainRef.current) {
			cancelAnimationFrame(focusChainRef.current.raf1);
			if (focusChainRef.current.raf2 !== undefined) {
				cancelAnimationFrame(focusChainRef.current.raf2);
			}
		}

		const accessor = topAccessorRef.current;
		const focusChain: { accessor: string | null; raf1: number; raf2?: number } =
			{ accessor, raf1: 0 };
		focusChain.raf1 = requestAnimationFrame(() => {
			focusChain.raf2 = requestAnimationFrame(() => {
				focusChainRef.current = null;
				// The selected field may have changed in the two frames since
				// this chain was scheduled — only focus if the panel is still
				// showing the field the chain was scheduled for.
				if (topAccessorRef.current !== accessor) return;
				const input = containerRef.current?.querySelector<HTMLInputElement>(
					'[data-testid="panel-name-input"]',
				);
				input?.focus();
			});
		});
		focusChainRef.current = focusChain;
	}, [autoFocusLabel]);

	// Cancel any still-pending focus chain on unmount (e.g. the panel closes
	// entirely — field becomes null — while a chain is in flight).
	useEffect(() => {
		return () => {
			if (focusChainRef.current) {
				cancelAnimationFrame(focusChainRef.current.raf1);
				if (focusChainRef.current.raf2 !== undefined) {
					cancelAnimationFrame(focusChainRef.current.raf2);
				}
			}
		};
	}, []);

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
		// A rename (manual or auto-slug) changes the drilled child's accessor;
		// the drillStack entry pointing at it must follow in the same update,
		// or the stale path would stop resolving and the panel would silently
		// fall back to editing the PARENT GROUP while still showing Back.
		const oldActiveAccessor = chain[chain.length - 1].config.api_accessor;
		if (next.config.api_accessor !== oldActiveAccessor) {
			setDrillStack((s) => [...s.slice(0, -1), next.config.api_accessor]);
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

	// F2: a consumer-supplied schema can contain duplicate accessors — exactly
	// the state validateSpec flags via the `duplicate_accessor` fieldError
	// found above. Selection and updateField key on accessor alone elsewhere
	// in the editor, so applying an edit here while the active accessor is
	// ambiguous would go on to corrupt or destroy the OTHER field sharing it.
	// Pragmatic containment (not an identity refactor): go read-only and
	// surface the error prominently until the author resolves the duplicate.
	const isDuplicateSelection = accessorError !== null;

	function guardedFieldChange(next: Field) {
		if (isDuplicateSelection) return;
		handleActiveFieldChange(next);
	}

	// Collision pool for the ACTIVE field, from the LIVE draft: a top-level
	// field competes with every other top-level accessor; a drilled child
	// competes with its siblings inside the parent group. The active field's
	// own current accessor is excluded (re-typing it is a no-op, not a clash).
	const collisionPool =
		chain.length === 1 ? draft : (chain[chain.length - 2].children ?? []);
	const takenAccessors = new Set(
		collisionPool.map((f) => f.config.api_accessor),
	);
	takenAccessors.delete(activeField.config.api_accessor);

	const sectionProps: PanelSectionProps = {
		field: activeField,
		plugin: activePlugin,
		onFieldChange: guardedFieldChange,
		accessorError,
		takenAccessors,
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

			{isDuplicateSelection && (
				<Box
					borderWidth="1px"
					borderColor="danger.600"
					borderRadius="md"
					p="2"
					mb="4"
					data-testid="panel-duplicate-banner"
				>
					<Text fontSize="xs" fontWeight="semibold" color="danger.600">
						{accessorError}
					</Text>
				</Box>
			)}

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
