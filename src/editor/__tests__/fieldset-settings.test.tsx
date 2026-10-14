import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import type { Field } from "../../schema/types";
import {
	createFakePickerSource,
	fakeBlueprintAdapter,
} from "../../test/fake-picker-adapters";
import { FieldsetSettingsEditor } from "../field-settings/fieldset-settings";

/** A Consumer whose `blueprint` Adapter searches (ADR-0027). */
function searchingAdapter(
	options: Partial<Parameters<typeof createFakePickerSource>[0]> = {},
): FieldKitAdapters {
	return {
		blueprint: fakeBlueprintAdapter(
			createFakePickerSource({
				choices: [
					{ id: "address_bp", name: "Address" },
					{ id: "contributor_bp", name: "Contributor" },
				],
				...options,
			}),
		),
	};
}

/** The Fieldset being configured, as the config panel hands it over. */
const FIELDSET: Field<FieldsetSettings> = {
	field_type: "fieldset",
	config: {
		name: "Address",
		api_accessor: "address",
		required: false,
		instructions: "",
	},
	settings: {},
	system: false,
};

function renderEditor({
	initial = {},
	adapters = {},
	onError,
}: {
	initial?: FieldsetSettings | null;
	adapters?: FieldKitAdapters;
	onError?: (error: Error, fieldId: string) => void;
} = {}) {
	const onChange = vi.fn();

	// Stateful, as the config panel applies each change straight back to the
	// draft.
	function Harness() {
		const [settings, setSettings] = useState(initial);
		return (
			<FieldsetSettingsEditor
				settings={settings as FieldsetSettings}
				field={FIELDSET}
				onChange={(next) => {
					onChange(next);
					setSettings(next);
				}}
			/>
		);
	}

	render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[]} adapters={adapters} onError={onError}>
				<Harness />
			</FieldKitProvider>
		</ChakraProvider>,
	);

	return {
		onChange,
		collapsible: () => screen.getByLabelText(/Collapsible/),
	};
}

// The picker itself — search, paging, purpose, names, failure, lock — is
// covered for every setting in blueprint-picker.test.tsx; these are the
// Fieldset's own settings around it.
describe("FieldsetSettingsEditor", () => {
	it("marks the fieldset collapsible without dropping the blueprint", async () => {
		const user = userEvent.setup();
		const { onChange, collapsible } = renderEditor({
			initial: { blueprint: "address_bp" },
		});

		await user.click(collapsible());

		expect(onChange).toHaveBeenLastCalledWith({
			blueprint: "address_bp",
			collapsible: true,
		});
	});

	it("shows the Author's stored collapsible flag", () => {
		const { collapsible } = renderEditor({
			initial: { blueprint: "address_bp", collapsible: true },
		});
		expect(collapsible()).toBeChecked();
	});

	it("leaves the fieldset without a blueprint when the Author clears it", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({
			initial: { blueprint: "address_bp", collapsible: true },
			adapters: searchingAdapter(),
		});

		await user.click(await screen.findByLabelText(/Blueprint/));
		await user.keyboard("{Backspace}");

		expect(onChange).toHaveBeenLastCalledWith({
			blueprint: undefined,
			collapsible: true,
		});
	});

	it("says so when there are no blueprints to embed", async () => {
		const user = userEvent.setup();
		renderEditor({ adapters: searchingAdapter({ choices: [] }) });

		await user.click(await screen.findByLabelText(/Blueprint/));

		expect(await screen.findByText("No blueprint matches")).toBeInTheDocument();
	});

	it("reports a failed search to the console when no error channel is configured", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const user = userEvent.setup();
		const failure = new Error("Network error");
		renderEditor({
			adapters: searchingAdapter({ failing: { current: failure } }),
		});

		await user.click(await screen.findByLabelText(/Blueprint/));
		await screen.findByTestId("fieldset-blueprint-failed");

		expect(consoleError).toHaveBeenCalledWith(
			"Blueprint search failed:",
			failure,
		);
	});

	it("has displayName", () => {
		expect(FieldsetSettingsEditor.displayName).toBe("FieldsetSettingsEditor");
	});
});
