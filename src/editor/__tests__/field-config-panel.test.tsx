// src/editor/__tests__/field-config-panel.test.tsx

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import type { SpecFieldError } from "../../schema/validate-spec";
import { FieldConfigPanel, type PanelLabels } from "../field-config-panel";
import { EditorWrap, makeCard, makeField } from "./editor-helpers";

const testLabels: PanelLabels = {
	panelTabGeneral: "General",
	panelTabValidation: "Validation",
	panelTabType: "Type settings",
	panelNoSettings: "No additional settings",
	panelChildren: "Children",
	panelBack: "Back",
	panelClose: "Close",
	panelLocalizable: "Localizable",
	editChild: "Edit",
	accessorInUse: "This accessor is already in use",
	accessorEmpty: "Accessor is required",
	committedAccessorWarning:
		"Changing the accessor of a saved field disconnects its existing data",
	name: "Name",
	accessor: "Accessor",
	required: "Required",
	instructions: "Instructions",
	defaultValue: "Default value",
	hidden: "Hidden",
	readOnly: "Read only",
	minLength: "Min length",
	maxLength: "Max length",
	pattern: "Pattern (regex)",
	patternMessage: "Pattern message",
	unique: "Unique",
	panelSystemNotice: "System field notice",
};

function readDump(): Field {
	return JSON.parse(screen.getByTestId("dump").textContent ?? "null");
}

function Harness({
	initialField,
	otherFields = [],
	plugin,
	committedAccessors = new Set<string>(),
	fieldErrors = [],
	autoFocusLabel = false,
	onFieldChangeSpy,
	baselineAccessor,
}: {
	initialField: Field;
	/** Other fields present in the live draft alongside the edited field. */
	otherFields?: Field[];
	plugin?: FieldTypePlugin;
	committedAccessors?: Set<string>;
	fieldErrors?: SpecFieldError[];
	autoFocusLabel?: boolean;
	onFieldChangeSpy?: (next: Field) => void;
	/** The accessor `initialField` had in the last committed schema. Defaults
	 * to `initialField`'s own accessor (the common "nothing renamed yet"
	 * case) and, like SpecEditor's real rename-baseline map, stays fixed for
	 * the lifetime of this Harness instance even as `field` state changes. */
	baselineAccessor?: string;
}) {
	const [field, setField] = useState<Field>(initialField);
	const draft = [field, ...otherFields];
	return (
		<div>
			<FieldConfigPanel
				field={field}
				plugin={plugin}
				draft={draft}
				fieldErrors={fieldErrors}
				onFieldChange={(next) => {
					onFieldChangeSpy?.(next);
					setField(next);
				}}
				onClose={() => {}}
				autoFocusLabel={autoFocusLabel}
				committedAccessors={committedAccessors}
				baselineAccessor={baselineAccessor ?? initialField.config.api_accessor}
				labels={testLabels}
			/>
			<pre data-testid="dump">{JSON.stringify(field)}</pre>
		</div>
	);
}

describe("FieldConfigPanel", () => {
	it("blocks all edits and shows a prominent error when the selected accessor is duplicated in the draft (F2a)", () => {
		// Consumer-supplied schemas can contain duplicate accessors — the exact
		// state validateSpec flags. Selection/updateField key on accessor alone
		// elsewhere, so an unguarded edit here would go on to corrupt/destroy
		// the OTHER field sharing the accessor. The panel must go read-only
		// instead until the author resolves the duplication.
		const field = makeField("dup", "Dup A");
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field, makeField("dup", "Dup B")]}
					fieldErrors={[
						{
							accessor: "dup",
							code: "duplicate_accessor",
							message: 'Duplicate accessor "dup"',
						},
					]}
					onFieldChange={onFieldChangeSpy}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={field.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);

		expect(screen.getByTestId("panel-duplicate-banner")).toHaveTextContent(
			'Duplicate accessor "dup"',
		);

		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Renamed" },
		});
		fireEvent.click(screen.getByTestId("panel-required-input"));

		expect(onFieldChangeSpy).not.toHaveBeenCalled();
	});

	// fieldkit#43 item 1: the card branch used to render neither an
	// explanation nor a way out when a hand-authored schema gives two cards
	// the same accessor — guardedFieldChange silently no-ops (F2's
	// containment), but with no banner the author has no idea WHY typing in
	// Name does nothing. Only reachable with hand-written schemas
	// (insertCard's generated accessors are always unique).
	it("card branch: shows the duplicate banner and blocks Name edits for a duplicated card accessor", () => {
		const card = makeCard("dup", "Card A");
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={card}
					plugin={undefined}
					draft={[card, makeCard("dup", "Card B")]}
					fieldErrors={[
						{
							accessor: "dup",
							code: "duplicate_accessor",
							message: 'Duplicate accessor "dup"',
						},
					]}
					onFieldChange={onFieldChangeSpy}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={card.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);

		expect(screen.getByTestId("panel-duplicate-banner")).toHaveTextContent(
			'Duplicate accessor "dup"',
		);

		// Existing behavior, unchanged: guardedFieldChange still no-ops while
		// the accessor is ambiguous.
		fireEvent.change(screen.getByTestId("panel-card-name-input"), {
			target: { value: "Renamed" },
		});
		expect(onFieldChangeSpy).not.toHaveBeenCalled();
	});

	it("does not show the duplicate banner or block edits for a non-duplicated field", () => {
		const field = makeField("solo", "Solo");
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={onFieldChangeSpy}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={field.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);

		expect(
			screen.queryByTestId("panel-duplicate-banner"),
		).not.toBeInTheDocument();

		fireEvent.click(screen.getByTestId("panel-required-input"));
		expect(onFieldChangeSpy).toHaveBeenCalledTimes(1);
	});

	it("label edit calls onFieldChange with updated name (and auto-slugs a fresh accessor for a new-in-draft field)", () => {
		const field = makeField("draft_field", "Draft Field");
		render(
			<EditorWrap>
				<Harness initialField={field} committedAccessors={new Set()} />
			</EditorWrap>,
		);

		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "My Field" },
		});

		const dump = readDump();
		expect(dump.config.name).toBe("My Field");
		expect(dump.config.api_accessor).toBe("my_field");
	});

	it("manual accessor edit latches — subsequent label edits stop touching the accessor", () => {
		const field = makeField("draft_field", "Draft Field");
		render(
			<EditorWrap>
				<Harness initialField={field} committedAccessors={new Set()} />
			</EditorWrap>,
		);

		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "My Field" },
		});
		expect(readDump().config.api_accessor).toBe("my_field");

		fireEvent.change(screen.getByTestId("panel-accessor-input"), {
			target: { value: "custom" },
		});
		expect(readDump().config.api_accessor).toBe("custom");

		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Another Name" },
		});
		const dump = readDump();
		expect(dump.config.name).toBe("Another Name");
		expect(dump.config.api_accessor).toBe("custom");
	});

	it("auto-slug latch re-arms the moment the selected field's accessor becomes committed, e.g. right after Save (F1)", () => {
		// Regression for F1: the resync effect used to early-return whenever
		// `field === appliedFieldRef.current` (our own last edit echoed back) —
		// which is exactly what happens across a Save while the field stays
		// selected, since the draft's field object identity doesn't change.
		// That meant a save's `committedAccessors` update never re-armed the
		// latch, and a post-save rename could still silently re-slug the
		// accessor of a field whose data is now actually persisted.
		const initial = makeField("draft_field", "Draft Field");
		function ReArmHarness({ committed }: { committed: Set<string> }) {
			const [field, setField] = useState<Field>(initial);
			return (
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={setField}
					onClose={() => {}}
					committedAccessors={committed}
					baselineAccessor={initial.config.api_accessor}
					labels={testLabels}
				/>
			);
		}

		const { rerender } = render(
			<EditorWrap>
				<ReArmHarness committed={new Set()} />
			</EditorWrap>,
		);

		// New-in-draft: auto-slug is active.
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "My Field" },
		});
		expect(screen.getByTestId("panel-accessor-input")).toHaveValue("my_field");

		// Simulate a completed Save: the field stays selected (same component
		// instance/state, matching the real app where the draft's field object
		// identity is unchanged across a save), but `committedAccessors` now
		// contains its accessor.
		rerender(
			<EditorWrap>
				<ReArmHarness committed={new Set(["my_field"])} />
			</EditorWrap>,
		);

		// A further Name edit must NOT touch the now-committed accessor.
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Renamed After Save" },
		});
		expect(screen.getByTestId("panel-accessor-input")).toHaveValue("my_field");
	});

	it("committed fields never auto-slug (accessor in committedAccessors)", () => {
		const field = makeField("existing_field", "Existing Field");
		render(
			<EditorWrap>
				<Harness
					initialField={field}
					committedAccessors={new Set(["existing_field"])}
				/>
			</EditorWrap>,
		);

		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "New Name" },
		});

		const dump = readDump();
		expect(dump.config.name).toBe("New Name");
		expect(dump.config.api_accessor).toBe("existing_field");
	});

	it("colliding accessor edit shows the error and does NOT call onFieldChange", () => {
		const field = makeField("my_field", "My Field");
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<Harness
					initialField={field}
					otherFields={[makeField("other_field", "Other Field")]}
					committedAccessors={new Set(["other_field"])}
					onFieldChangeSpy={onFieldChangeSpy}
				/>
			</EditorWrap>,
		);

		fireEvent.change(screen.getByTestId("panel-accessor-input"), {
			target: { value: "other_field" },
		});

		expect(screen.getByTestId("accessor-error")).toHaveTextContent(
			testLabels.accessorInUse,
		);
		expect(onFieldChangeSpy).not.toHaveBeenCalled();
		expect(readDump().config.api_accessor).toBe("my_field");
	});

	it("colliding with another NEW-IN-DRAFT field's accessor shows the error and does NOT call onFieldChange", () => {
		// Neither field is committed — the collision can only be caught by
		// checking the LIVE DRAFT, not committedAccessors.
		const field = makeField("field_b", "Field B");
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<Harness
					initialField={field}
					otherFields={[makeField("field_a", "Field A")]}
					committedAccessors={new Set()}
					onFieldChangeSpy={onFieldChangeSpy}
				/>
			</EditorWrap>,
		);

		fireEvent.change(screen.getByTestId("panel-accessor-input"), {
			target: { value: "field_a" },
		});

		expect(screen.getByTestId("accessor-error")).toHaveTextContent(
			testLabels.accessorInUse,
		);
		expect(onFieldChangeSpy).not.toHaveBeenCalled();
		expect(readDump().config.api_accessor).toBe("field_b");
	});

	it("auto-slug collision with a draft sibling suppresses the accessor (error shown) but still applies the name", () => {
		const field = makeField("field_b", "Field B");
		render(
			<EditorWrap>
				<Harness
					initialField={field}
					otherFields={[makeField("title", "Title")]}
					committedAccessors={new Set()}
				/>
			</EditorWrap>,
		);

		// Slug of the new name ("title") collides with the sibling's accessor.
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Title" },
		});

		const dump = readDump();
		expect(dump.config.name).toBe("Title");
		expect(dump.config.api_accessor).toBe("field_b");
		expect(screen.getByTestId("accessor-error")).toHaveTextContent(
			testLabels.accessorInUse,
		);
	});

	it("empty accessor shows the error and does NOT call onFieldChange", () => {
		const field = makeField("my_field", "My Field");
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<Harness
					initialField={field}
					committedAccessors={new Set()}
					onFieldChangeSpy={onFieldChangeSpy}
				/>
			</EditorWrap>,
		);

		fireEvent.change(screen.getByTestId("panel-accessor-input"), {
			target: { value: "" },
		});

		expect(screen.getByTestId("accessor-error")).toHaveTextContent(
			testLabels.accessorEmpty,
		);
		expect(onFieldChangeSpy).not.toHaveBeenCalled();
		expect(readDump().config.api_accessor).toBe("my_field");
	});

	it("editing a committed field's accessor shows the disconnect warning", () => {
		const field = makeField("existing_field", "Existing Field");
		render(
			<EditorWrap>
				<Harness
					initialField={field}
					committedAccessors={new Set(["existing_field"])}
				/>
			</EditorWrap>,
		);

		fireEvent.change(screen.getByTestId("panel-accessor-input"), {
			target: { value: "renamed_field" },
		});

		expect(screen.getByTestId("accessor-warning")).toHaveTextContent(
			testLabels.committedAccessorWarning,
		);
		expect(readDump().config.api_accessor).toBe("renamed_field");
	});

	it("required checkbox toggles config.required", () => {
		const field = makeField("my_field", "My Field");
		render(
			<EditorWrap>
				<Harness initialField={field} />
			</EditorWrap>,
		);

		expect(readDump().config.required).toBe(false);
		fireEvent.click(screen.getByTestId("panel-required-input"));
		expect(readDump().config.required).toBe(true);
	});

	it("localizable checkbox toggles config.localizable", () => {
		const field = makeField("my_field", "My Field");
		render(
			<EditorWrap>
				<Harness initialField={field} />
			</EditorWrap>,
		);

		fireEvent.click(screen.getByTestId("panel-localizable-input"));
		expect(readDump().config.localizable).toBe(true);
	});

	it("routes ConfigSection and ValidationSection control labels through PanelLabels, not hardcoded English", () => {
		const field = makeField("my_field", "My Field");
		const translated: PanelLabels = {
			...testLabels,
			name: "Nombre",
			accessor: "Identificador",
			required: "Obligatorio",
			instructions: "Instrucciones",
			defaultValue: "Valor por defecto",
			hidden: "Oculto",
			readOnly: "Solo lectura",
			minLength: "Longitud mínima",
			maxLength: "Longitud máxima",
			pattern: "Patrón (regex)",
			patternMessage: "Mensaje de patrón",
			unique: "Único",
		};
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={vi.fn()}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={field.config.api_accessor}
					labels={translated}
				/>
			</EditorWrap>,
		);

		expect(screen.getByText("Nombre")).toBeInTheDocument();
		expect(screen.getByText("Identificador")).toBeInTheDocument();
		expect(screen.getByText("Obligatorio")).toBeInTheDocument();
		expect(screen.getByText("Instrucciones")).toBeInTheDocument();
		expect(screen.getByText("Valor por defecto")).toBeInTheDocument();
		expect(screen.getByText("Oculto")).toBeInTheDocument();
		expect(screen.getByText("Solo lectura")).toBeInTheDocument();

		// Switch to the Validation tab (all bodies are mounted-but-hidden —
		// the click keeps the interaction honest).
		fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		expect(screen.getByText("Longitud mínima")).toBeInTheDocument();
		expect(screen.getByText("Longitud máxima")).toBeInTheDocument();
		expect(screen.getByText("Patrón (regex)")).toBeInTheDocument();
		expect(screen.getByText("Mensaje de patrón")).toBeInTheDocument();
		expect(screen.getByText("Único")).toBeInTheDocument();
	});

	it("autoFocusLabel focuses the name input on its rising edge only — typing elsewhere keeps focus", () => {
		// The rising-edge effect schedules a BOUNDED RETRY-UNTIL-FOCUSABLE
		// loop (see field-config-panel.tsx) — not a fixed frame count — so
		// that in a real browser it can outlast zag-js Popover's single-rAF
		// focus-restore-to-trigger on close (verified live in Storybook via
		// Playwright) regardless of how many frames the race actually takes.
		// That specific race can't be reproduced in jsdom — there's no real
		// frame timing and no live Popover here to restore focus — so this
		// stubs rAF as a macrotask and drains ALL pending timers (the retry
		// loop, however many ticks it takes) with fake timers to
		// deterministically reach the focused end state before asserting.
		vi.useFakeTimers();
		vi.stubGlobal(
			"requestAnimationFrame",
			(cb: FrameRequestCallback) =>
				setTimeout(() => cb(0), 0) as unknown as number,
		);
		vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

		// Final-review fix wave (Fix 2): try/finally around the stubbed
		// section. Without it, an assertion failure between the stub calls
		// above and the restore calls below (e.g. a regression in the focus
		// chain) would leave fake timers AND the stubbed rAF/cAF globals
		// installed — poisoning every later test in this file, since
		// `vi.unstubAllGlobals()` would never run. Behavior on the green path
		// is unchanged.
		try {
			const field = makeField("my_field", "My Field");
			render(
				<EditorWrap>
					<Harness initialField={field} autoFocusLabel />
				</EditorWrap>,
			);

			// Rising edge (mount with autoFocusLabel=true) focuses the name input
			// once both frames drain.
			act(() => {
				vi.runAllTimers();
			});
			expect(screen.getByTestId("panel-name-input")).toHaveFocus();
		} finally {
			vi.useRealTimers();
			vi.unstubAllGlobals();
		}

		// Editing another control must NOT re-trigger the focus effect even
		// though the field object changes identity on every applied edit.
		const instructions = screen.getByTestId("panel-instructions-input");
		instructions.focus();
		fireEvent.change(instructions, { target: { value: "Some help text" } });
		expect(instructions).toHaveFocus();
	});

	// Final-review fix wave (Fix 1): an Edit pulse (autoFocusLabel's rising
	// edge) arriving while the SAME field stays selected — e.g. the toolbar
	// Edit-pencil clicked again, or a rename pulse — used to only schedule the
	// two-rAF focus chain at nameInputRef. If a non-General tab (Validation/
	// Type settings) was active, that input lives inside a `hidden` tabpanel
	// and the focus() call silently no-ops. The tabIdentity reset effect
	// doesn't help here either: it only fires when `chain.length` or the
	// active field's accessor CHANGES, and neither does on a same-field Edit
	// pulse. The fix: the autoFocusLabel rising-edge effect itself must also
	// flip the panel back to General.
	it("Edit pulse (autoFocusLabel rising edge) flips the panel back to the General tab even from Validation", async () => {
		const field = makeField("my_field", "My Field");

		function PulseHarness() {
			const [autoFocusLabel, setAutoFocusLabel] = useState(false);
			return (
				<div>
					<FieldConfigPanel
						field={field}
						plugin={undefined}
						draft={[field]}
						fieldErrors={[]}
						onFieldChange={() => {}}
						onClose={() => {}}
						autoFocusLabel={autoFocusLabel}
						committedAccessors={new Set()}
						baselineAccessor={field.config.api_accessor}
						labels={testLabels}
					/>
					<button
						type="button"
						data-testid="fire-edit-pulse"
						onClick={() => setAutoFocusLabel(true)}
					/>
				</div>
			);
		}

		render(
			<EditorWrap>
				<PulseHarness />
			</EditorWrap>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		});
		expect(screen.getByRole("tab", { name: "Validation" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// Same field stays selected throughout — only autoFocusLabel rises,
		// exactly like the toolbar Edit-pencil on an already-selected field.
		await act(async () => {
			fireEvent.click(screen.getByTestId("fire-edit-pulse"));
		});

		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	it("renders plugin settingsComponent and applies its onChange to field.settings", () => {
		const field = makeField("my_field", "My Field");
		const pluginWithSettings: FieldTypePlugin = {
			id: "text",
			name: "Text",
			description: "Plain text",
			icon: () => null,
			category: "text",
			fieldComponent: () => null,
			toZodType: () => z.string(),
			settingsComponent: ({ settings, onChange }) => (
				<input
					data-testid="settings-placeholder-input"
					value={
						(settings as { placeholder?: string } | null)?.placeholder ?? ""
					}
					onChange={(e) => onChange({ placeholder: e.target.value })}
				/>
			),
		};

		render(
			<EditorWrap>
				<Harness initialField={field} plugin={pluginWithSettings} />
			</EditorWrap>,
		);

		// Switch to the Type settings tab (the body is mounted either way —
		// the click keeps the interaction honest).
		fireEvent.click(screen.getByRole("tab", { name: "Type settings" }));
		fireEvent.change(screen.getByTestId("settings-placeholder-input"), {
			target: { value: "Hello" },
		});

		expect(readDump().settings).toEqual({ placeholder: "Hello" });
	});

	function makeGroupField(): Field {
		return {
			field_type: "group",
			config: {
				name: "Items",
				api_accessor: "items",
				required: false,
				instructions: "",
			},
			settings: null,
			children: [
				{
					field_type: "text",
					config: {
						name: "Item Name",
						api_accessor: "item_name",
						required: false,
						instructions: "",
					},
					settings: null,
					system: false,
				},
			],
			system: false,
		};
	}

	it("group children list drills in and edits a child name", () => {
		render(
			<EditorWrap>
				<Harness initialField={makeGroupField()} />
			</EditorWrap>,
		);

		expect(screen.getByText("Item Name")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("panel-child-edit-item_name"));

		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Item Name");

		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Renamed Item" },
		});

		const dump = readDump();
		expect(dump.field_type).toBe("group");
		expect(dump.children?.[0].config.name).toBe("Renamed Item");
	});

	it("drill-in stays on the child when a name edit auto-slugs its accessor", () => {
		render(
			<EditorWrap>
				<Harness initialField={makeGroupField()} />
			</EditorWrap>,
		);

		fireEvent.click(screen.getByTestId("panel-child-edit-item_name"));

		// The child is new-in-draft, so this name edit auto-slugs its accessor
		// (item_name → renamed_item). The drill path must follow the rename —
		// a stale path would silently fall back to editing the parent group.
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Renamed Item" },
		});

		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Renamed Item");
		expect(screen.getByTestId("panel-accessor-input")).toHaveValue(
			"renamed_item",
		);
		expect(readDump().children?.[0].config.api_accessor).toBe("renamed_item");
	});

	it("rename-follow updates the ACTIVE frame when a deeper frame is broken", () => {
		// Build a drill chain two deep: group -> child_group -> grandchild.
		// The GRANDCHILD is then removed OUT FROM UNDER the open drill-in by an
		// EXTERNAL change (not one routed through the panel) — resolveChain
		// stops early at child_group, so the ACTIVE field becomes child_group,
		// one entry short of drillStack's last (now-broken) frame. Renaming
		// the active field via the accessor input must follow into ITS OWN
		// frame (drillStack[chain.length - 2]) — the same offset the baseline
		// forwarding above already uses — not the stack's last frame.
		const grandchild = makeField("grandchild", "Grandchild");
		const childGroup: Field = {
			field_type: "group",
			config: {
				name: "Child Group",
				api_accessor: "child_group",
				required: false,
				instructions: "",
			},
			settings: null,
			children: [grandchild],
			system: false,
		};
		const topGroup: Field = {
			field_type: "group",
			config: {
				name: "Group",
				api_accessor: "group",
				required: false,
				instructions: "",
			},
			settings: null,
			children: [childGroup],
			system: false,
		};

		function BrokenFrameHarness() {
			const [field, setField] = useState<Field>(topGroup);
			return (
				<div>
					<FieldConfigPanel
						field={field}
						plugin={undefined}
						draft={[field]}
						fieldErrors={[]}
						onFieldChange={setField}
						onClose={() => {}}
						committedAccessors={new Set()}
						baselineAccessor={field.config.api_accessor}
						labels={testLabels}
					/>
					<button
						type="button"
						data-testid="external-delete-grandchild"
						onClick={() =>
							setField((f) => ({
								...f,
								children: (f.children ?? []).map((c) =>
									c.config.api_accessor === "child_group"
										? { ...c, children: [] }
										: c,
								),
							}))
						}
					/>
					<pre data-testid="dump">{JSON.stringify(field)}</pre>
				</div>
			);
		}

		render(
			<EditorWrap>
				<BrokenFrameHarness />
			</EditorWrap>,
		);

		// Drill in two levels: group -> child_group -> grandchild.
		fireEvent.click(screen.getByTestId("panel-child-edit-child_group"));
		fireEvent.click(screen.getByTestId("panel-child-edit-grandchild"));
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Grandchild");

		// Externally delete the grandchild — the DEEPER frame ("grandchild")
		// no longer resolves, but drillStack still holds both frames. The
		// panel must fall back to the deepest RESOLVABLE frame: child_group.
		fireEvent.click(screen.getByTestId("external-delete-grandchild"));
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Child Group");

		// Rename the ACTIVE field (child_group) via the accessor input.
		fireEvent.change(screen.getByTestId("panel-accessor-input"), {
			target: { value: "child_group_renamed" },
		});

		// The panel must keep resolving and displaying the renamed ACTIVE
		// field — not fall back to the top-level group (pre-fix: the rename
		// rewrote the broken LAST frame, so the FIRST frame's stale lookup key
		// stopped matching and resolveChain collapsed to the top-level field).
		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Child Group");
		expect(screen.getByTestId("panel-accessor-input")).toHaveValue(
			"child_group_renamed",
		);
		expect(readDump().children?.[0].config.api_accessor).toBe(
			"child_group_renamed",
		);
	});

	it("does not show the disconnect warning for an untouched committed group child", () => {
		// Both the group ("items") and its child ("item_name") are already
		// committed. SpecEditor only tracks a rename baseline for the
		// TOP-LEVEL selected field, so it always forwards "items" here even
		// once drilled into the child. Comparing the child's own accessor
		// against the PARENT's baseline ("item_name" !== "items") must NOT
		// produce a false-positive warning — the child was never renamed.
		render(
			<EditorWrap>
				<Harness
					initialField={makeGroupField()}
					committedAccessors={new Set(["items", "item_name"])}
					baselineAccessor="items"
				/>
			</EditorWrap>,
		);

		fireEvent.click(screen.getByTestId("panel-child-edit-item_name"));

		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
		expect(screen.queryByTestId("accessor-warning")).not.toBeInTheDocument();
	});

	it("shows the disconnect warning while live-renaming a committed drilled child", () => {
		// Both the group ("items") and its child ("item_name") are already
		// committed. Drilling into the child must freeze the panel's baseline
		// at "item_name" — the child's accessor AT DRILL-IN TIME — so that a
		// LIVE rename to "item_name2" still shows the disconnect warning: the
		// frozen baseline is committed and differs from the live input. The
		// buggy live-accessor fallback instead re-derives the baseline from
		// the field's CURRENT accessor on every keystroke, so
		// committedAccessors.has(baseline) is always false post-rename and the
		// warning never appears — this is RED against that fallback.
		render(
			<EditorWrap>
				<Harness
					initialField={makeGroupField()}
					committedAccessors={new Set(["items", "item_name"])}
					baselineAccessor="items"
				/>
			</EditorWrap>,
		);

		fireEvent.click(screen.getByTestId("panel-child-edit-item_name"));

		fireEvent.change(screen.getByTestId("panel-accessor-input"), {
			target: { value: "item_name2" },
		});

		expect(screen.getByTestId("accessor-warning")).toHaveTextContent(
			testLabels.committedAccessorWarning,
		);
		expect(readDump().children?.[0].config.api_accessor).toBe("item_name2");
	});

	it("keeps the committed-accessor warning after deselect/reselect mid-rename", () => {
		// Simulates the panel remounting after a deselect/reselect while a
		// rename is in progress this session: the field's LIVE accessor is
		// already "title2" (renamed from "title"), but SpecEditor's
		// rename-baseline map still knows it was committed as "title" and
		// passes that through as `baselineAccessor` regardless of the
		// remount — unlike the field's own local state (freshly initialized
		// on every mount), which cannot recover that fact on its own.
		const field = makeField("title2", "Title");
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={vi.fn()}
					onClose={vi.fn()}
					committedAccessors={new Set(["title"])}
					baselineAccessor="title"
					labels={testLabels}
				/>
			</EditorWrap>,
		);

		expect(screen.getByTestId("accessor-warning")).toHaveTextContent(
			testLabels.committedAccessorWarning,
		);
	});

	it("blur with a colliding trimmed accessor never applies the untrimmed value", () => {
		const field = makeField("my_field", "My Field");
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<Harness
					initialField={field}
					otherFields={[makeField("body", "Body")]}
					onFieldChangeSpy={onFieldChangeSpy}
				/>
			</EditorWrap>,
		);

		const accessorInput = screen.getByTestId("panel-accessor-input");
		fireEvent.change(accessorInput, { target: { value: "body " } });
		fireEvent.blur(accessorInput);

		expect(screen.getByTestId("accessor-error")).toHaveTextContent(
			testLabels.accessorInUse,
		);
		expect(onFieldChangeSpy).not.toHaveBeenCalled();
		expect(readDump().config.api_accessor).toBe("my_field");
	});

	it("renders General | Validation | Type settings tabs; switching shows the right body", async () => {
		render(
			<EditorWrap>
				<Harness initialField={makeField("my_field", "My Field")} />
			</EditorWrap>,
		);

		expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
			"General",
			"Validation",
			"Type settings",
		]);
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		// All three bodies stay MOUNTED (ConfigSection's local accessor state
		// and auto-slug latch must survive tab switches) — VISIBILITY is what
		// flips, driven by the inactive tabpanels' `hidden` attribute. The
		// inactive panels start hidden synchronously on mount (their Presence
		// starts in the "unmounted" state directly since they never were
		// present), so this initial check is reliable.
		expect(screen.getByTestId("panel-name-input")).toBeVisible();
		expect(screen.getByTestId("panel-min-length-input")).not.toBeVisible();

		// zag's Tabs machine transitions asynchronously — matches the
		// act-wrapping convention used for every other tab-click assertion in
		// this suite (sections/dnd/cards-canvas/editor-canvas tests). Entering
		// a tab un-hides its content synchronously with the click (Presence's
		// "MOUNT" branch); only asserting the tab being LEFT becomes hidden
		// would additionally depend on Presence's exit-transition completing,
		// which needs a real "animationend"/rAF-driven completion signal jsdom
		// cannot reliably provide across a whole shared test file (verified:
		// this hangs/flakes depending on how many earlier tests in this file
		// already rendered) — so only the entering side is asserted here.
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		});
		expect(screen.getByTestId("panel-min-length-input")).toBeVisible();

		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "Type settings" }));
		});
		expect(screen.getByText(testLabels.panelNoSettings)).toBeVisible();
	});

	it("active tab RESETS to General when a different field is selected (panel stays mounted)", async () => {
		const fieldA = makeField("field_a", "Field A");
		const fieldB = makeField("field_b", "Field B");
		function SwitchHarness() {
			const [selected, setSelected] = useState<Field>(fieldA);
			return (
				<div>
					<FieldConfigPanel
						field={selected}
						plugin={undefined}
						draft={[fieldA, fieldB]}
						fieldErrors={[]}
						onFieldChange={() => {}}
						onClose={() => {}}
						committedAccessors={new Set()}
						baselineAccessor={selected.config.api_accessor}
						labels={testLabels}
					/>
					<button
						type="button"
						data-testid="select-b"
						onClick={() => setSelected(fieldB)}
					/>
				</div>
			);
		}
		render(
			<EditorWrap>
				<SwitchHarness />
			</EditorWrap>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		});
		expect(screen.getByRole("tab", { name: "Validation" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// Select a DIFFERENT field: the panel does NOT remount (same component
		// instance, new `field` prop) — panel-local tab state would survive
		// without the reset effect. This is the discriminating half.
		await act(async () => {
			fireEvent.click(screen.getByTestId("select-b"));
		});
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Field B");
	});

	it("active tab resets to General when a drill frame pops (Back)", async () => {
		render(
			<EditorWrap>
				<Harness initialField={makeGroupField()} />
			</EditorWrap>,
		);

		// Drill into the child (from the General tab, where the list lives).
		fireEvent.click(screen.getByTestId("panel-child-edit-item_name"));
		// The drilled child gets the FULL tab strip (spec Decision 5)…
		expect(screen.getAllByRole("tab")).toHaveLength(3);
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		});
		expect(screen.getByRole("tab", { name: "Validation" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// …and popping the frame is a field change: back to General. (A panel
		// remembering Validation here would silently show the PARENT group's
		// validation — not what the author was looking at.)
		await act(async () => {
			fireEvent.click(screen.getByTestId("panel-back"));
		});
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	it("panel width is FIXED (#40): same width token for custom and system selections, no min-width", () => {
		function panelFor(field: Field) {
			return (
				<EditorWrap>
					<FieldConfigPanel
						field={field}
						plugin={undefined}
						draft={[field]}
						fieldErrors={[]}
						onFieldChange={vi.fn()}
						onClose={vi.fn()}
						committedAccessors={new Set()}
						baselineAccessor={field.config.api_accessor}
						labels={testLabels}
					/>
				</EditorWrap>
			);
		}
		const widthOf = () =>
			window.getComputedStyle(screen.getByTestId("field-config-panel")).width;

		const { rerender } = render(panelFor(makeField("a", "A")));
		// Chakra resolves the `width` token to its CSS var in jsdom; the OLD
		// minWidth-only panel computes width "" here — the discriminating
		// assert (probe-verified against the installed Chakra v3).
		expect(widthOf()).toBe("var(--chakra-sizes-72)");
		expect(
			window.getComputedStyle(screen.getByTestId("field-config-panel"))
				.minWidth,
		).toBe("");

		rerender(panelFor({ ...makeField("name", "Name"), system: true }));
		expect(widthOf()).toBe("var(--chakra-sizes-72)");
	});

	it("duplicate-accessor banner renders ABOVE the tab strip — visible from the Validation tab", () => {
		const field = makeField("dup", "Dup A");
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field, makeField("dup", "Dup B")]}
					fieldErrors={[
						{
							accessor: "dup",
							code: "duplicate_accessor",
							message: 'Duplicate accessor "dup"',
						},
					]}
					onFieldChange={vi.fn()}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={field.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);

		fireEvent.click(screen.getByRole("tab", { name: "Validation" }));

		const banner = screen.getByTestId("panel-duplicate-banner");
		// Visible while a NON-General tab is active: a banner living inside
		// the General body would be `hidden` right now.
		expect(banner).toBeVisible();
		expect(banner.closest("[role='tabpanel']")).toBeNull();
		// And ABOVE the strip in document order (Decision 4).
		const tablist = screen.getByRole("tablist");
		expect(
			banner.compareDocumentPosition(tablist) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("four selection states render the right chrome: tabs / summary / card Name / Back+tabs", () => {
		function panelFor(field: Field) {
			return (
				<EditorWrap>
					<FieldConfigPanel
						field={field}
						plugin={undefined}
						draft={[field]}
						fieldErrors={[]}
						onFieldChange={vi.fn()}
						onClose={vi.fn()}
						committedAccessors={new Set()}
						baselineAccessor={field.config.api_accessor}
						labels={testLabels}
					/>
				</EditorWrap>
			);
		}

		// (1) normal field: the full tab strip, no Back row.
		const normal = render(panelFor(makeField("a", "A")));
		expect(screen.getAllByRole("tab")).toHaveLength(3);
		expect(screen.queryByTestId("panel-back")).toBeNull();
		normal.unmount();

		// (2) system field: the read-only summary REPLACES the tabs entirely.
		const system = render(
			panelFor({ ...makeField("name", "Name"), system: true }),
		);
		expect(screen.getByTestId("panel-system-summary")).toBeInTheDocument();
		expect(screen.queryAllByRole("tab")).toHaveLength(0);
		system.unmount();

		// (3) card marker: single Name body, NO tab strip.
		const card = render(panelFor(makeCard("c1", "Basics")));
		expect(screen.getByTestId("panel-card-name-input")).toBeInTheDocument();
		expect(screen.queryAllByRole("tab")).toHaveLength(0);
		card.unmount();

		// (4) drill-in child: Back row + the full tab strip.
		render(
			<EditorWrap>
				<Harness initialField={makeGroupField()} />
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("panel-child-edit-item_name"));
		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
		expect(screen.getAllByRole("tab")).toHaveLength(3);
	});
});

describe("system fields — panel lock", () => {
	function renderPanel(system: boolean) {
		const field = makeField("name", "Name");
		field.system = system;
		field.config.instructions = "The name of the asset.";
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={onFieldChangeSpy}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={field.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);
		return onFieldChangeSpy;
	}

	it("renders a read-only summary instead of the editable sections", () => {
		renderPanel(true);
		expect(screen.getByTestId("panel-system-summary")).toBeInTheDocument();
		expect(screen.getByTestId("panel-system-notice")).toBeInTheDocument();
		// None of the editable machinery mounts:
		expect(screen.queryByTestId("panel-name-input")).toBeNull();
		expect(screen.queryByTestId("panel-accessor-input")).toBeNull();
		expect(screen.queryByTestId("panel-required-input")).toBeNull();
		// The summary REPLACES the tabs entirely (0.6.0 contract; Decision 5).
		expect(screen.queryAllByRole("tab")).toHaveLength(0);
		// The strongest guarantee: zero form controls in the whole panel.
		expect(screen.queryAllByRole("textbox")).toHaveLength(0);
		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
	});

	it("summary shows accessor, required state, and instructions", () => {
		renderPanel(true);
		const summary = within(screen.getByTestId("panel-system-summary"));
		expect(summary.getByText("name")).toBeInTheDocument(); // mono accessor
		expect(summary.getByText("The name of the asset.")).toBeInTheDocument();
	});

	it("non-system fields keep the editable panel (regression)", () => {
		renderPanel(false);
		expect(screen.queryByTestId("panel-system-summary")).toBeNull();
		expect(screen.getByTestId("panel-name-input")).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Validation" })).toBeInTheDocument();
	});

	// Final-review fix wave (Fix 3): the card branch used to precede the
	// `system` check, so a hand-authored `system: true` card marker (never
	// produced by insertCard, which always emits `system: false` — but a
	// consumer schema is data, not something the editor controls) got the
	// editable Name input instead of the locked read-only summary.
	it("a hand-authored system:true card marker gets the locked summary, not the editable Name input", () => {
		const card = makeCard("c1", "Basics");
		card.system = true;
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={card}
					plugin={undefined}
					draft={[card]}
					fieldErrors={[]}
					onFieldChange={vi.fn()}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={card.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);
		expect(screen.getByTestId("panel-system-summary")).toBeInTheDocument();
		expect(screen.queryByTestId("panel-card-notice")).toBeNull();
		expect(screen.queryByTestId("panel-card-name-input")).toBeNull();
	});

	// Regression guard: insertCard's normal (`system: false`) card markers
	// must keep the editable Name input the reorder must not have flipped
	// this the other way.
	it("a normal (system: false) card marker keeps the editable Name input", () => {
		const card = makeCard("c1", "Basics");
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={card}
					plugin={undefined}
					draft={[card]}
					fieldErrors={[]}
					onFieldChange={vi.fn()}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={card.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);
		expect(screen.queryByTestId("panel-system-summary")).toBeNull();
		expect(screen.getByTestId("panel-card-name-input")).toBeInTheDocument();
	});
});
