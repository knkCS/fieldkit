import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ListSettings } from "../../schema/field-types/list";
import { ListSettingsEditor } from "../field-settings/list-settings";

function renderEditor(settings: ListSettings | null = {}) {
	const onChange = vi.fn();
	render(
		<ChakraProvider value={defaultSystem}>
			<ListSettingsEditor
				settings={settings as ListSettings}
				onChange={onChange}
			/>
		</ChakraProvider>,
	);
	return { onChange, input: screen.getByLabelText(/Entries per page/) };
}

describe("ListSettingsEditor", () => {
	it("sets the entries-per-page the Author types", async () => {
		const user = userEvent.setup();
		const { onChange, input } = renderEditor();

		await user.type(input, "5");

		expect(onChange).toHaveBeenLastCalledWith({ max_items_per_page: 5 });
	});

	it("shows the Author's stored page size", () => {
		const { input } = renderEditor({ max_items_per_page: 20 });
		expect(input).toHaveValue(20);
	});

	it("treats a cleared input as no pagination", async () => {
		const user = userEvent.setup();
		const { onChange, input } = renderEditor({ max_items_per_page: 5 });

		await user.clear(input);

		expect(onChange).toHaveBeenLastCalledWith({ max_items_per_page: 0 });
	});

	it("keeps settings it does not own", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<ListSettingsEditor
					settings={{ legacy_key: "kept" } as ListSettings}
					onChange={onChange}
				/>
			</ChakraProvider>,
		);

		await user.type(screen.getByLabelText(/Entries per page/), "3");

		expect(onChange).toHaveBeenLastCalledWith({
			legacy_key: "kept",
			max_items_per_page: 3,
		});
	});

	it("tolerates absent settings", () => {
		const { input } = renderEditor(null);
		expect(input).toHaveValue(null);
	});

	it("has displayName", () => {
		expect(ListSettingsEditor.displayName).toBe("ListSettingsEditor");
	});
});
