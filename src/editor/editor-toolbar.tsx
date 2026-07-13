// src/editor/editor-toolbar.tsx
import { Flex } from "@chakra-ui/react";
import { Button, DirtyDot } from "@knkcs/anker/atoms";
import { SegmentedControl, Tooltip } from "@knkcs/anker/primitives";
import { LayoutDashboard, PanelTop } from "lucide-react";
import type { EditorLabels } from "./spec-editor";

/** The toolbar's strings — a Pick of EditorLabels' flat keys (the
 * CanvasLabels pattern), so SpecEditor's mergedLabels satisfies it
 * structurally with no mapping layer. */
export type EditorToolbarLabels = Pick<
	Required<EditorLabels>,
	| "addCard"
	| "addSection"
	| "addCardDisabledEmpty"
	| "build"
	| "tryIt"
	| "fixValidationFirst"
	| "discard"
	| "save"
	| "dirty"
>;

export interface EditorToolbarProps {
	/** "tryit" is Preview's INTERNAL value — frozen like the `tryIt` label
	 * key; only the default STRING was renamed in 0.9.0. */
	mode: "build" | "tryit";
	dirty: boolean;
	saving: boolean;
	/** `validation.valid` — one source of truth gating the Preview segment
	 * AND Save, exactly as the pre-toolbar header did. */
	canPreview: boolean;
	/** True when the draft has no fields at all: + Card disables with the
	 * `addCardDisabledEmpty` tooltip. + Section stays enabled — sections can
	 * be added to an empty spec. */
	specEmpty: boolean;
	labels: EditorToolbarLabels;
	onAddCard: () => void;
	onAddSection: () => void;
	onModeChange: (mode: "build" | "tryit") => void;
	onDiscard: () => void;
	onSave: () => void;
}

/**
 * The editor's single chrome row (toolbar spec 2026-07-13, composition A2):
 * ▦ Card, ⊞ Section, spacer, dirty-dot, Build|Preview segmented control,
 * Discard, Save. Pure presentational — every state and callback is a prop;
 * SpecEditor stays the orchestrator. Preview DISABLES (never hides) the
 * insert buttons so the bar keeps its shape across modes. Button icons are
 * the structural plugins' own (cardPlugin: PanelTop, sectionPlugin:
 * LayoutDashboard).
 */
export function EditorToolbar({
	mode,
	dirty,
	saving,
	canPreview,
	specEmpty,
	labels,
	onAddCard,
	onAddSection,
	onModeChange,
	onDiscard,
	onSave,
}: EditorToolbarProps) {
	const build = mode === "build";

	const addCardButton = (
		<Button
			variant="outline"
			size="sm"
			disabled={!build || specEmpty}
			onClick={onAddCard}
		>
			<PanelTop size={14} />
			{labels.addCard}
		</Button>
	);

	const modeControl = (
		<SegmentedControl
			size="sm"
			value={mode}
			onValueChange={({ value }) => {
				if (value === "build" || value === "tryit") onModeChange(value);
			}}
			items={[
				{ value: "build", label: labels.build },
				// Inherits Try-it's gating: disabled while the draft is invalid.
				// SpecEditor's handleEnterTryIt keeps its own guard as
				// defense-in-depth.
				{ value: "tryit", label: labels.tryIt, disabled: !canPreview },
			]}
		/>
	);

	return (
		<Flex
			as="header"
			align="center"
			justify="space-between"
			gap="2"
			borderBottomWidth="1px"
			bg="bg-subtle"
			p="2"
			data-testid="editor-toolbar"
		>
			<Flex align="center" gap="2">
				{build && specEmpty ? (
					// Disabled-Button-in-Tooltip: the same idiom the old header used
					// for the gated Try-it button. Only the EMPTY reason gets a
					// tooltip — in Preview the whole cluster is mode-disabled and
					// self-explanatory.
					<Tooltip content={labels.addCardDisabledEmpty}>
						{addCardButton}
					</Tooltip>
				) : (
					addCardButton
				)}
				<Button
					variant="outline"
					size="sm"
					disabled={!build}
					onClick={onAddSection}
				>
					<LayoutDashboard size={14} />
					{labels.addSection}
				</Button>
			</Flex>
			<Flex align="center" gap="2">
				<DirtyDot active={dirty} label={labels.dirty} />
				{canPreview ? (
					modeControl
				) : (
					<Tooltip content={labels.fixValidationFirst}>{modeControl}</Tooltip>
				)}
				<Button
					variant="outline"
					size="sm"
					disabled={!dirty || saving}
					onClick={onDiscard}
				>
					{labels.discard}
				</Button>
				<Button
					variant="solid"
					size="sm"
					disabled={!dirty || !canPreview || saving}
					loading={saving}
					onClick={onSave}
				>
					{labels.save}
				</Button>
			</Flex>
		</Flex>
	);
}
EditorToolbar.displayName = "EditorToolbar";
