// src/editor/__tests__/field-config-panel.test.tsx

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import type { SpecFieldError } from "../../schema/validate-spec";
import { FieldConfigPanel, type PanelLabels } from "../field-config-panel";
import { EditorWrap, makeField } from "./editor-helpers";

const testLabels: PanelLabels = {
	panelGeneral: "General",
	panelValidation: "Validation",
	panelTypeSettings: "Type Settings",
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

		// Validation section starts collapsed — open it.
		fireEvent.click(screen.getByTestId("panel-toggle-validation"));
		expect(screen.getByText("Longitud mínima")).toBeInTheDocument();
		expect(screen.getByText("Longitud máxima")).toBeInTheDocument();
		expect(screen.getByText("Patrón (regex)")).toBeInTheDocument();
		expect(screen.getByText("Mensaje de patrón")).toBeInTheDocument();
		expect(screen.getByText("Único")).toBeInTheDocument();
	});

	it("autoFocusLabel focuses the name input on its rising edge only — typing elsewhere keeps focus", () => {
		// The rising-edge effect now waits two animation frames before
		// focusing (see field-config-panel.tsx) so that, in a real browser,
		// it outlasts zag-js Popover's single-rAF focus-restore-to-trigger on
		// close (verified live in Storybook via Playwright). That specific
		// race can't be reproduced in jsdom — there's no real frame timing
		// and no live Popover here to restore focus — so this stubs rAF as a
		// macrotask and drains it with fake timers to deterministically
		// flush both scheduled frames before asserting.
		vi.useFakeTimers();
		vi.stubGlobal(
			"requestAnimationFrame",
			(cb: FrameRequestCallback) =>
				setTimeout(() => cb(0), 0) as unknown as number,
		);
		vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

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

		vi.useRealTimers();
		vi.unstubAllGlobals();

		// Editing another control must NOT re-trigger the focus effect even
		// though the field object changes identity on every applied edit.
		const instructions = screen.getByTestId("panel-instructions-input");
		instructions.focus();
		fireEvent.change(instructions, { target: { value: "Some help text" } });
		expect(instructions).toHaveFocus();
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

		// Type Settings is collapsed by default (only General starts open).
		fireEvent.click(screen.getByTestId("panel-toggle-type-settings"));
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
});
