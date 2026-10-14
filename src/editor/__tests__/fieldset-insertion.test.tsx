import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../schema/field-types";
import { fieldsetPlugin } from "../../schema/field-types/fieldset";
import { createField } from "../draft-ops";
import { TypePicker } from "../type-picker";
import { EditorWrap } from "./editor-helpers";

/**
 * #50's first acceptance criterion — "Fieldset appears in the type picker and
 * can be inserted into a Spec". Both halves are generic machinery, so this
 * asserts the built-in registry actually reaches them rather than re-testing
 * TypePicker or createField.
 */
describe("inserting a Fieldset", () => {
	it("offers Fieldset in the type picker of a Consumer that can search Blueprints", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(
			<EditorWrap
				plugins={builtInFieldTypes}
				adapters={{
					blueprint: {
						getSchema: vi.fn().mockResolvedValue([]),
						getData: vi.fn(),
						search: vi.fn().mockResolvedValue({ items: [] }),
					},
				}}
			>
				<TypePicker plugins={builtInFieldTypes} onSelect={onSelect} />
			</EditorWrap>,
		);

		const option = screen.getByTestId("type-option-fieldset");
		expect(option).toHaveTextContent("Fieldset");

		await user.click(option);
		expect(onSelect).toHaveBeenCalledWith("fieldset");
	});

	it("stays available in a spec that already has one — fieldsets are not capped", () => {
		expect(fieldsetPlugin.maxPerSpec).toBeUndefined();
	});

	it("inserts as an unconfigured, non-collapsible fieldset", () => {
		const field = createField(fieldsetPlugin, []);

		expect(field.field_type).toBe("fieldset");
		expect(field.config.api_accessor).toBeTruthy();
		expect(field.settings).toEqual({ collapsible: false });
		// No blueprint yet — the Author picks one next, and until they do the
		// renderer says "No blueprint selected".
		expect(
			(field.settings as { blueprint?: string }).blueprint,
		).toBeUndefined();
	});
});
