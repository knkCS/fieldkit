import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import { FieldsetSettingsEditor } from "../field-settings/fieldset-settings";

function renderEditor(initial: FieldsetSettings | null = {}) {
	const onChange = vi.fn();

	// Stateful so a multi-character blueprint id types the way an Author's
	// does — the config panel applies each change straight back to the draft.
	function Harness() {
		const [settings, setSettings] = useState(initial);
		return (
			<FieldsetSettingsEditor
				settings={settings as FieldsetSettings}
				onChange={(next) => {
					onChange(next);
					setSettings(next);
				}}
			/>
		);
	}

	render(
		<ChakraProvider value={defaultSystem}>
			<Harness />
		</ChakraProvider>,
	);

	return {
		onChange,
		blueprint: screen.getByLabelText(/Blueprint/),
		collapsible: screen.getByLabelText(/Collapsible/),
	};
}

describe("FieldsetSettingsEditor", () => {
	it("sets the blueprint id the Author types", async () => {
		const user = userEvent.setup();
		const { onChange, blueprint } = renderEditor();

		await user.type(blueprint, "address_bp");

		expect(onChange).toHaveBeenLastCalledWith({ blueprint: "address_bp" });
	});

	it("shows the Author's stored blueprint", () => {
		const { blueprint } = renderEditor({ blueprint: "address_bp" });
		expect(blueprint).toHaveValue("address_bp");
	});

	it("treats a cleared input as no blueprint selected", async () => {
		const user = userEvent.setup();
		const { onChange, blueprint } = renderEditor({ blueprint: "address_bp" });

		await user.clear(blueprint);

		expect(onChange).toHaveBeenLastCalledWith({ blueprint: undefined });
	});

	it("marks the fieldset collapsible without dropping the blueprint", async () => {
		const user = userEvent.setup();
		const { onChange, collapsible } = renderEditor({
			blueprint: "address_bp",
		});

		await user.click(collapsible);

		expect(onChange).toHaveBeenLastCalledWith({
			blueprint: "address_bp",
			collapsible: true,
		});
	});

	it("shows the Author's stored collapsible flag", () => {
		const { collapsible } = renderEditor({
			blueprint: "address_bp",
			collapsible: true,
		});
		expect(collapsible).toBeChecked();
	});

	it("has displayName", () => {
		expect(FieldsetSettingsEditor.displayName).toBe("FieldsetSettingsEditor");
	});
});
