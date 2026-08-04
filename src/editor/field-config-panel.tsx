// src/editor/field-config-panel.tsx
import { Box, Flex, Input, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { Tabs } from "@knkcs/anker/primitives";
import { ChevronLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Field, Schema } from "../schema/types";
import { isField } from "../schema/types";
import type { SpecFieldError } from "../schema/validate-spec";
import { ConfigSection } from "./panel-sections/config-section";
import { SettingsSection } from "./panel-sections/settings-section";
import { SystemFieldSummary } from "./panel-sections/system-summary";
import { ValidationSection } from "./panel-sections/validation-section";
import type { EditorLabels } from "./spec-editor";

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
	/**
	 * Opens the panel's drill-in on a Field this Field's *settings* hold, under
	 * `settingsKey`, keyed by that Field's Accessor.
	 *
	 * The key travels from the plugin's own settings editor rather than being
	 * known here: the panel learns that some settings hold a list of Fields, and
	 * never which setting of which Field type. That is ADR-0007's instinct at
	 * the authoring surface — a plugin reaches into its own settings and nothing
	 * else does.
	 */
	onDrillIn: (settingsKey: string, accessor: string) => void;
	/** Every registered field type, for a settings editor that offers a type
	 * picker of its own. Absent when the panel was given no registry. */
	plugins?: FieldTypePlugin[];
}

/**
 * A Pick of EditorLabels — the panel consumes the SAME flat key names as
 * EditorLabels (tab captions → panelTabGeneral/panelTabValidation/
 * panelTabType, etc.) instead of its own shorter names, so a host's merged
 * EditorLabels satisfies this type structurally with no per-key renaming
 * layer required at the call site.
 */
export type PanelLabels = Pick<
	Required<EditorLabels>,
	| "panelTabGeneral"
	| "panelTabValidation"
	| "panelTabType"
	| "panelNoSettings"
	| "panelChildren"
	| "panelBack"
	| "panelClose"
	| "panelLocalizable"
	| "accessorInUse"
	| "accessorEmpty"
	| "committedAccessorWarning"
	// System field read-only summary (SystemFieldSummary).
	| "panelSystemNotice"
	// The group children list's per-row "Edit" button label.
	| "editChild"
	// ConfigSection's and ValidationSection's control labels.
	| "name"
	| "accessor"
	| "required"
	| "instructions"
	| "defaultValue"
	| "hidden"
	| "readOnly"
	| "minLength"
	| "maxLength"
	| "pattern"
	| "patternMessage"
	| "unique"
	// Card panel: the one-setting (Name) body.
	| "cardUntitled"
	| "panelCardNotice"
>;

export interface FieldConfigPanelProps {
	/** The panel has no hidden/empty state of its own — the only caller
	 * (SpecEditor) already gates rendering on `selectedField &&`, so there's
	 * no null case for this component to handle internally. */
	field: Field;
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
	/**
	 * The accessor this field had in the last committed schema — tracked
	 * across in-session renames by SpecEditor's rename-baseline map (keyed by
	 * the LIVE accessor, so a deselect/reselect mid-rename still recovers the
	 * true committed baseline instead of re-baselining to whatever the field
	 * currently is). Forwarded straight through to ConfigSection, which uses
	 * it for the committed-accessor disconnect warning.
	 *
	 * This tracked baseline applies to the TOP-LEVEL field ONLY — SpecEditor
	 * has no notion of a drilled-in group child's selection. A drilled child
	 * instead self-scopes to its OWN drill-in frame's `baselineAccessor` (see
	 * DrillFrame and the `chain.length` check below): the child's accessor
	 * frozen at the moment the frame was pushed, so a LIVE rename within the
	 * frame still trips the disconnect warning if that frozen baseline is
	 * committed. What does NOT persist for a drilled child is rename-tracking
	 * ACROSS a deselect/reselect of the whole panel (which discards
	 * `drillStack` entirely) — that recovery is a top-level-only feature,
	 * since only SpecEditor's map survives the remount.
	 */
	baselineAccessor: string;
	/** T12's DEFAULT_EDITOR_LABELS supplies English defaults; tests pass their own. */
	labels: PanelLabels;
	/**
	 * Every registered plugin, used only to resolve a DRILLED field's own type
	 * — the top-level field's plugin still arrives as `plugin` above.
	 *
	 * Optional, and absent means what it always meant: a drilled child shows
	 * "No additional settings" rather than risking the wrong type's settings UI.
	 * A settings-nested Field needs the real thing — a `select` Attribute is
	 * useless without its options — which is why the registry reaches here at
	 * all.
	 */
	plugins?: FieldTypePlugin[];
}

/** The config panel's three tab ids (0.10.0 tabs redesign). Captions come
 * from PanelLabels' panelTab* keys; these ids are internal state and the
 * Tabs value dialect only — never author-facing. */
type PanelTab = "general" | "validation" | "type-settings";

/**
 * Which list of Fields on a parent a drill frame stepped into: the parent's own
 * `children`, or a `Field[]` its settings hold under a named key.
 *
 * A bare key, not a Field type's name. The panel learns only that *some*
 * settings hold Fields; which setting of which type is the plugin's own
 * business, and travels in from its settings editor when it asks for the
 * drill-in. That keeps the same line ADR-0007 draws through the schema layer —
 * a plugin reaches into its own settings, shared machinery does not — at the
 * authoring surface where an Attribute Spec is written.
 */
type DrillHolder = { kind: "children" } | { kind: "settings"; key: string };

const CHILDREN: DrillHolder = { kind: "children" };

/** The Fields a frame's holder offers on `parent`.
 *
 * Filtered by `isField`, because a settings key names whatever the plugin says
 * it names: `blueprints` is a `string[]`, and a hand-written Attribute Spec may
 * hold anything at all. A key that resolves to something else must resolve to
 * nothing, never take the panel down. */
function readHolder(parent: Field, holder: DrillHolder): Field[] {
	if (holder.kind === "children") return parent.children ?? [];
	const settings = parent.settings as Record<string, unknown> | null;
	const held = settings?.[holder.key];
	return Array.isArray(held) ? held.filter(isField) : [];
}

/** `parent` with its holder's Fields replaced — the write half of the above. */
function writeHolder(
	parent: Field,
	holder: DrillHolder,
	fields: Field[],
): Field {
	if (holder.kind === "children") return { ...parent, children: fields };
	return {
		...parent,
		settings: {
			...(parent.settings as Record<string, unknown> | null),
			[holder.key]: fields,
		},
	};
}

/**
 * A single level of the drill-in path. `accessor` is the LIVE lookup key —
 * it follows renames (see the rename-follow logic in
 * `handleActiveFieldChange`) so `resolveChain` keeps resolving the drilled
 * child. `baselineAccessor` is captured ONCE, when the frame is pushed (the
 * child's accessor at that moment), and is never rewritten by a rename — it
 * is the frozen value the disconnect warning compares the live input against.
 * `holder` says where on the parent the frame stepped into, and never changes.
 */
interface DrillFrame {
	accessor: string;
	baselineAccessor: string;
	holder: DrillHolder;
}

/** Walks `drillStack` (a path of child frames) down from the top-level
 * field, stopping early if a step no longer resolves (e.g. the child was
 * deleted out from under an open drill-in). */
function resolveChain(field: Field, drillStack: DrillFrame[]): Field[] {
	const chain: Field[] = [field];
	for (const frame of drillStack) {
		const parent = chain[chain.length - 1];
		const found = readHolder(parent, frame.holder).find(
			(c) => c.config.api_accessor === frame.accessor,
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
	committedAccessors,
	baselineAccessor,
	labels,
	plugins,
}: FieldConfigPanelProps) {
	const [drillStack, setDrillStack] = useState<DrillFrame[]>([]);
	// Panel-local active tab (spec Decision 3). General is the default; the
	// reset effect below (after `chain` resolves) returns here whenever the
	// panel starts showing a different field.
	const [activeTab, setActiveTab] = useState<PanelTab>("general");
	const nameInputRef = useRef<HTMLInputElement>(null);
	const topAccessorRef = useRef<string>(field.config.api_accessor);
	const prevAutoFocusRef = useRef(false);
	const focusChainRef = useRef<{ accessor: string; raf: number } | null>(null);

	// Selecting a different top-level field resets any open drill-in — the
	// child path belongs to the previously selected group, not the new field.
	useEffect(() => {
		const topAccessor = field.config.api_accessor;
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
	// BOUNDED RETRY-UNTIL-FOCUSABLE LOOP (runtime-gate fix, replacing a fixed
	// two-rAF wait): the ⊕ popover (zag-js Popover) restores focus to its
	// trigger button on close via a SINGLE rAF, so this effect must not focus
	// the name input synchronously or after only one rAF — zag's restore
	// would still win the race and steal focus back to the "Add field"
	// trigger (verified live in Storybook via Playwright). A FIXED two-rAF
	// wait was tried next, but a real-browser measurement (deterministic 3/3)
	// showed the INSERT-via-⊕ flow — where a non-General tab was previously
	// active — commits the General tabpanel's `hidden` removal ~47ms AFTER
	// the second rAF's focus() call: the same frame budget also carries the
	// popover unmount and the canvas re-render, so two frames is not always
	// enough. `focus()` silently no-ops on an element inside a `hidden`
	// subtree, so the fixed schedule could lose the race with no error. The
	// Edit-pencil path (a lighter frame, no popover/canvas churn) always
	// happened to make the two-frame deadline, which is why it never
	// surfaced this. The fix: each rAF tick, check whether the name input is
	// ACTUALLY out of a `hidden` ancestor before focusing; if not yet,
	// reschedule; give up silently after ~20 frames (a generous ceiling for
	// pathological cases — matches the old silent-failure behavior rather
	// than throwing or looping forever).
	//
	// Visibility predicate: `!el.closest("[hidden]")`, NOT `el.offsetParent
	// !== null`. jsdom (this suite's test environment) never computes layout,
	// so `offsetParent` is null for every element regardless of visibility —
	// unusable as a predicate here. zag's Tabs sets the inactive tabpanel's
	// `hidden` attribute directly (`hidden: !selected`,
	// @zag-js/tabs/tabs.connect.mjs), and jsdom DOES model the `hidden`
	// attribute/CSS (`[hidden] { display: none }`), so `closest("[hidden]")`
	// is both the real-browser-correct check AND the one jsdom can verify.
	//
	// The chain is deliberately NOT cancelled by a RETURNED cleanup tied to
	// [autoFocusLabel]. spec-editor.tsx's "pulse" resets autoFocusLabel back
	// to false immediately after setting it true (so the NEXT Edit also gets
	// a fresh rising edge) — that reset lands in the SAME passive-effect
	// flush, before any scheduled frame has had a chance to fire. A cleanup
	// keyed to the dependency change would cancel the chain on that falling
	// edge and autofocus would never happen. Instead: a NEW rising edge
	// cancels any still-pending chain from a previous one (guarded below),
	// true unmount cancels via the ref-cleanup effect right after, and every
	// tick re-checks the accessor in case the selected field genuinely
	// changed while frames were in flight (bailing immediately rather than
	// only at the end, now that "the end" isn't a fixed frame count).
	//
	// Card selections reuse this SAME effect and nameInputRef (the card
	// branch's Name input is the only control it renders), so the loop must
	// — and does — work there identically; nothing here is General-tab- or
	// custom-field-specific.
	useEffect(() => {
		const rising = Boolean(autoFocusLabel) && !prevAutoFocusRef.current;
		prevAutoFocusRef.current = Boolean(autoFocusLabel);
		if (!rising) return;

		// Final-review fix wave (Fix 1): land back on General BEFORE scheduling
		// the focus loop below. A same-field Edit pulse (e.g. the toolbar
		// Edit-pencil clicked again on the ALREADY-selected field, or the
		// +Section/+Card rename pulse) rises here without `chain.length` or the
		// active accessor changing, so the tabIdentity reset effect below never
		// fires. Left as-is, the retry loop's focus() calls at nameInputRef
		// would keep no-op'ing (and eventually give up) whenever the
		// Validation/Type-settings tab was active, since that input lives
		// inside a `hidden` tabpanel. This also hardens the DIFFERENT-field
		// path (where tabIdentity's effect already resets the tab) against
		// zag's controlled-value sync timing — this effect's setActiveTab runs
		// in the same passive-effect flush, so it can't lose a race with
		// anything zag schedules afterward.
		setActiveTab("general");

		if (focusChainRef.current) {
			cancelAnimationFrame(focusChainRef.current.raf);
		}

		const accessor = topAccessorRef.current;
		const MAX_ATTEMPTS = 20;
		let attempt = 0;
		const focusChain: { accessor: string; raf: number } = {
			accessor,
			raf: 0,
		};

		function tick() {
			// The selected field may have changed since this loop was
			// scheduled — only keep trying (and only ever focus) while the
			// panel is still showing the field the chain was scheduled for.
			if (topAccessorRef.current !== accessor) {
				focusChainRef.current = null;
				return;
			}
			const el = nameInputRef.current;
			attempt += 1;
			if (el && !el.closest("[hidden]")) {
				focusChainRef.current = null;
				el.focus();
				return;
			}
			if (attempt >= MAX_ATTEMPTS) {
				// Give up silently — the pre-existing behavior for pathological
				// cases (e.g. the panel closing/reopening in a way this effect
				// doesn't otherwise anticipate).
				focusChainRef.current = null;
				return;
			}
			focusChain.raf = requestAnimationFrame(tick);
		}
		focusChain.raf = requestAnimationFrame(tick);
		focusChainRef.current = focusChain;
	}, [autoFocusLabel]);

	// Cancel any still-pending focus loop on unmount (e.g. the panel closes
	// entirely — the parent stops rendering it — while a retry is in flight).
	useEffect(() => {
		return () => {
			if (focusChainRef.current) {
				cancelAnimationFrame(focusChainRef.current.raf);
			}
		};
	}, []);

	const chain = resolveChain(field, drillStack);
	const activeField = chain[chain.length - 1];
	// The drillStack index of the ACTIVE field's own frame. `chain.length - 2`
	// (not `drillStack.length - 1`): if a deeper frame failed to resolve (its
	// child was deleted under an open drill-in), the active field is the last
	// one that DID resolve, short of the stack's end. Shared by the
	// rename-follow and the baselineAccessor forwarding so the two can never
	// drift apart again (#35). Only meaningful when `chain.length >= 2` —
	// it's -1 at the top level; both consumers guard on that, and any new
	// consumer must too (an unguarded -1 silently changes slice semantics).
	const activeFrameIndex = chain.length - 2;
	// The top-level field's plugin arrives as a prop; a drilled field's is
	// looked up, and only when a registry was supplied. Without one this stays
	// what it always was — "No additional settings" for a child, rather than
	// risking the wrong type's settings UI. With one, a drilled Field gets its
	// own settings editor, which is what a settings-nested Spec needs: a select
	// Attribute is useless until someone can give it options.
	const activePlugin =
		chain.length === 1
			? plugin
			: plugins?.find((p) => p.id === activeField.field_type);

	// The active tab RESETS to General whenever the panel starts showing a
	// DIFFERENT field (spec Decision 3): selecting another top-level field,
	// drilling into a child, popping a frame with Back — and the broken-frame
	// fallback (a drilled child deleted externally drops the active field to
	// its deepest resolvable ancestor). `chain.length` + the active accessor
	// capture all of these. A RENAME also changes the active accessor, but
	// renames are only ever typed in the General tab's inputs, so that reset
	// is always a same-value no-op (React bails on same-state updates).
	// Ref-compare (not a bare dependency effect) so it can't fire on mount.
	const tabIdentity = `${chain.length}:${activeField.config.api_accessor}`;
	const tabIdentityRef = useRef(tabIdentity);
	useEffect(() => {
		if (tabIdentityRef.current !== tabIdentity) {
			tabIdentityRef.current = tabIdentity;
			setActiveTab("general");
		}
	}, [tabIdentity]);

	function handleActiveFieldChange(next: Field) {
		if (chain.length === 1) {
			onFieldChange(next);
			return;
		}
		// A rename (manual or auto-slug) changes the drilled child's accessor;
		// the drillStack entry pointing at it must follow in the same update,
		// or the stale path would stop resolving and the panel would silently
		// fall back to editing the PARENT GROUP while still showing Back. Only
		// the frame's LOOKUP KEY (`accessor`) follows the rename — its
		// `baselineAccessor` is captured once at drill-in and must stay frozen
		// so the disconnect warning keeps comparing against the accessor the
		// child had when the user drilled in, not wherever it's been renamed to
		// since.
		//
		// The frame to rewrite is `activeFrameIndex` (shared with the
		// baselineAccessor forwarding below) — NOT unconditionally the stack's
		// last entry. Always rewriting `s[s.length - 1]` would mutate an
		// already-broken deeper frame, leave the active field's own (now
		// stale) frame unrewritten, and orphan the whole drill path on the
		// next resolve.
		const oldActiveAccessor = chain[chain.length - 1].config.api_accessor;
		if (next.config.api_accessor !== oldActiveAccessor) {
			setDrillStack((s) => {
				const activeFrame = s[activeFrameIndex];
				return [
					...s.slice(0, activeFrameIndex),
					{ ...activeFrame, accessor: next.config.api_accessor },
					...s.slice(activeFrameIndex + 1),
				];
			});
		}
		// Rebuild the tree bottom-up, replacing each level's edited child by
		// its PRE-edit accessor (captured in `chain`) so a rename of the
		// active child doesn't orphan it from its parent's list. Each level is
		// read and written through ITS OWN frame's holder, so a Field drilled
		// into out of settings is put back into settings.
		let rebuilt = next;
		for (let i = chain.length - 2; i >= 0; i--) {
			const parent = chain[i];
			const holder = drillStack[i].holder;
			const oldChildAccessor = chain[i + 1].config.api_accessor;
			const siblings = readHolder(parent, holder).map((c) =>
				c.config.api_accessor === oldChildAccessor ? rebuilt : c,
			);
			rebuilt = writeHolder(parent, holder, siblings);
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
		chain.length === 1
			? draft
			: readHolder(
					chain[chain.length - 2],
					drillStack[activeFrameIndex].holder,
				);
	const takenAccessors = new Set(
		collisionPool.map((f) => f.config.api_accessor),
	);
	takenAccessors.delete(activeField.config.api_accessor);

	/** Pushes a frame onto a Field list one of the ACTIVE field's settings
	 * holds. `baselineAccessor` is frozen here, exactly as the group children
	 * list freezes it — see DrillFrame. */
	function drillIntoSettings(settingsKey: string, accessor: string) {
		setDrillStack((s) => [
			...s,
			{
				accessor,
				baselineAccessor: accessor,
				holder: { kind: "settings", key: settingsKey },
			},
		]);
	}

	const sectionProps: PanelSectionProps = {
		field: activeField,
		plugin: activePlugin,
		onFieldChange: guardedFieldChange,
		accessorError,
		takenAccessors,
		committedAccessors,
		labels,
		onDrillIn: drillIntoSettings,
		plugins,
	};

	const children = activeField.children ?? [];

	return (
		<Box
			bg="bg-subtle"
			borderLeftWidth="1px"
			borderColor="border"
			p="4"
			// #40 (absorbed into the tabs spec, Decision 7): FIXED width. The old
			// minWidth let intrinsic content stretch the panel, so system/custom/
			// card selections rendered three different panel sizes.
			width="72"
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
					{labels.panelBack}
				</Button>
			)}

			<Flex align="center" justify="space-between" mb="4">
				<Box>
					<Text fontWeight="semibold">
						{activeField.field_type === "card" &&
						!activeField.config.name.trim()
							? labels.cardUntitled
							: activeField.config.name}
					</Text>
					{activePlugin && (
						<Text fontSize="xs" color="fg.muted">
							{activePlugin.name}
						</Text>
					)}
				</Box>
				<IconButton
					aria-label={labels.panelClose}
					size="xs"
					variant="ghost"
					onClick={onClose}
					data-testid="panel-close"
				>
					<X size={16} />
				</IconButton>
			</Flex>

			{activeField.system ? (
				<SystemFieldSummary
					field={activeField}
					plugin={activePlugin}
					labels={labels}
				/>
			) : activeField.field_type === "card" ? (
				// A card's ONE setting is its Name (title, optional) — no
				// accessor/validation/type-settings sections. Live draft edits
				// with the same semantics as field renames: apply per keystroke,
				// trim on blur. The accessor is never touched (no auto-slug).
				// (fieldkit#42's panel→tabs redesign subsumes this trivially.)
				// The `system` check above wins first: hand-authored system
				// markers are consumer-supplied (insertCard always emits
				// `system: false`), so a `system: true` card must still get the
				// locked read-only summary, not the editable Name input.
				<Box>
					<Text
						fontSize="xs"
						color="fg.muted"
						mb="3"
						data-testid="panel-card-notice"
					>
						{labels.panelCardNotice}
					</Text>

					{/* fieldkit#43 item 1: same F2 containment as the normal-field
					    branch below (guardedFieldChange no-ops while the accessor is
					    ambiguous) — but until now this branch rendered no explanation,
					    so a hand-authored duplicate-accessor card silently blocked
					    Name edits with no visible cause. Only reachable with
					    hand-written schemas (insertCard's generated accessors are
					    always unique). */}
					{isDuplicateSelection && (
						<Box
							borderWidth="1px"
							borderColor="danger.600"
							borderRadius="md"
							p="2"
							mb="3"
							data-testid="panel-duplicate-banner"
						>
							<Text fontSize="xs" fontWeight="semibold" color="danger.600">
								{accessorError}
							</Text>
						</Box>
					)}

					<Box as="label" display="block" mb="3">
						<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
							{labels.name}
						</Text>
						<Input
							ref={nameInputRef}
							size="sm"
							mt="1"
							value={activeField.config.name}
							placeholder={labels.cardUntitled}
							onChange={(e) =>
								guardedFieldChange({
									...activeField,
									config: { ...activeField.config, name: e.target.value },
								})
							}
							onBlur={() => {
								const trimmed = activeField.config.name.trim();
								if (trimmed !== activeField.config.name) {
									guardedFieldChange({
										...activeField,
										config: { ...activeField.config, name: trimmed },
									});
								}
							}}
							data-testid="panel-card-name-input"
						/>
					</Box>
				</Box>
			) : (
				<>
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

					{/* The tab strip (spec Decisions 2–4). Structure order: banner
					    ABOVE the strip (rendered just before this Tabs.Root, so it
					    is visible from any tab), strip, body. All three bodies
					    stay MOUNTED (zag Tabs' default `hidden` attribute — the
					    editor-canvas idiom): `unmountOnExit` would reset
					    ConfigSection's local accessor state and auto-slug latch on
					    every tab switch, changing live-edit semantics. */}
					<Tabs.Root
						value={activeTab}
						onValueChange={(e) => setActiveTab(e.value as PanelTab)}
					>
						<Tabs.List>
							<Tabs.Trigger value="general">
								{labels.panelTabGeneral}
							</Tabs.Trigger>
							<Tabs.Trigger value="validation">
								{labels.panelTabValidation}
							</Tabs.Trigger>
							<Tabs.Trigger value="type-settings">
								{labels.panelTabType}
							</Tabs.Trigger>
						</Tabs.List>

						<Tabs.Content value="general">
							<Box pt="2">
								<ConfigSection
									{...sectionProps}
									nameInputRef={nameInputRef}
									// SpecEditor's rename-baseline map only tracks the TOP-LEVEL
									// selected field (see the prop doc below) — it always reflects
									// the top-level field's committed accessor, never a drilled-in
									// child's. Forwarding it unconditionally would compare a
									// drilled child's accessor against its PARENT's baseline (e.g.
									// child "item_name" !== group baseline "items") and produce a
									// false-positive disconnect warning for every untouched
									// committed child. Any drilled frame instead self-scopes to
									// its OWN drill-in frame's `baselineAccessor` — the child's
									// accessor AT THE MOMENT it was drilled into, frozen across
									// renames within the frame (see DrillFrame above) — so a LIVE
									// rename of a committed child still trips the disconnect
									// warning instead of silently chasing the field's current
									// accessor and never comparing against anything committed.
									// Indexed by the shared `activeFrameIndex` (see its comment):
									// the active frame is not necessarily the stack's last entry.
									baselineAccessor={
										chain.length === 1
											? baselineAccessor
											: (drillStack[activeFrameIndex]?.baselineAccessor ??
												activeField.config.api_accessor)
									}
								/>
								{activeField.field_type === "group" && (
									<Box mt="4" pt="3" borderTopWidth="1px" borderColor="border">
										{/* The locked tab set has no fourth tab — the group
										    children list lives in the General body under its own
										    heading (plan refinement 1). */}
										<Text fontSize="sm" fontWeight="semibold" mb="1">
											{labels.panelChildren}
										</Text>
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
													onClick={() =>
														// Freeze `baselineAccessor` to the child's accessor AT
														// THIS MOMENT — the disconnect-warning baseline for the
														// whole time this frame stays on top of the stack. `accessor`
														// (the lookup key) starts equal to it but, unlike
														// `baselineAccessor`, follows subsequent renames — see the
														// rename-follow logic in `handleActiveFieldChange`.
														setDrillStack((s) => [
															...s,
															{
																accessor: child.config.api_accessor,
																baselineAccessor: child.config.api_accessor,
																holder: CHILDREN,
															},
														])
													}
													data-testid={`panel-child-edit-${child.config.api_accessor}`}
												>
													{labels.editChild}
												</Button>
											</Flex>
										))}
									</Box>
								)}
							</Box>
						</Tabs.Content>

						<Tabs.Content value="validation">
							<Box pt="2">
								<ValidationSection {...sectionProps} />
							</Box>
						</Tabs.Content>

						<Tabs.Content value="type-settings">
							<Box pt="2">
								<SettingsSection {...sectionProps} />
							</Box>
						</Tabs.Content>
					</Tabs.Root>
				</>
			)}
		</Box>
	);
}
FieldConfigPanel.displayName = "FieldConfigPanel";
