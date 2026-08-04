import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
	BlueprintSummary,
	FieldKitAdapters,
} from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import { FieldsetSettingsEditor } from "../field-settings/fieldset-settings";

const BLUEPRINTS: BlueprintSummary[] = [
	{ id: "address_bp", name: "Address" },
	{ id: "contributor_bp", name: "Contributor" },
];

/** What a consumer on #50's adapter has: one blueprint's fields, one
 * blueprint's data, and no way to enumerate them. */
function schemaOnlyAdapter(): FieldKitAdapters {
	return {
		blueprint: {
			getSchema: vi.fn().mockResolvedValue([]),
			getData: vi.fn(),
		},
	};
}

function listingAdapter(
	list: () => Promise<BlueprintSummary[]> = () => Promise.resolve(BLUEPRINTS),
): FieldKitAdapters {
	return {
		blueprint: {
			getSchema: vi.fn().mockResolvedValue([]),
			getData: vi.fn(),
			list,
		},
	};
}

function renderEditor({
	initial = {},
	adapters = {},
}: {
	initial?: FieldsetSettings | null;
	adapters?: FieldKitAdapters;
} = {}) {
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

	const tree = (current: FieldKitAdapters) => (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[]} adapters={current}>
				<Harness />
			</FieldKitProvider>
		</ChakraProvider>
	);

	const { rerender } = render(tree(adapters));

	return {
		onChange,
		blueprint: () => screen.getByLabelText(/Blueprint/),
		collapsible: () => screen.getByLabelText(/Collapsible/),
		/** What a consumer that builds its adapters object inline does on every
		 * render of the component above `FieldKitProvider`. */
		rerenderWithNewAdapters: (next: FieldKitAdapters) => rerender(tree(next)),
	};
}

describe("FieldsetSettingsEditor", () => {
	describe("with no way to list blueprints", () => {
		it("sets the blueprint id the Author types", async () => {
			const user = userEvent.setup();
			const { onChange, blueprint } = renderEditor();

			await user.type(blueprint(), "address_bp");

			expect(onChange).toHaveBeenLastCalledWith({ blueprint: "address_bp" });
		});

		it("shows the Author's stored blueprint", () => {
			const { blueprint } = renderEditor({
				initial: { blueprint: "address_bp" },
			});
			expect(blueprint()).toHaveValue("address_bp");
		});

		it("treats a cleared input as no blueprint selected", async () => {
			const user = userEvent.setup();
			const { onChange, blueprint } = renderEditor({
				initial: { blueprint: "address_bp" },
			});

			await user.clear(blueprint());

			expect(onChange).toHaveBeenLastCalledWith({ blueprint: undefined });
		});

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
	});

	describe("with a blueprint list", () => {
		it("offers the blueprints the adapter lists", async () => {
			const user = userEvent.setup();
			renderEditor({ adapters: listingAdapter() });

			await user.click(await screen.findByLabelText(/Blueprint/));

			expect(await screen.findByText("Address")).toBeInTheDocument();
			expect(screen.getByText("Contributor")).toBeInTheDocument();
		});

		it("stores the id of the blueprint the Author picks", async () => {
			const user = userEvent.setup();
			const { onChange } = renderEditor({ adapters: listingAdapter() });

			await user.click(await screen.findByLabelText(/Blueprint/));
			await user.click(await screen.findByText("Contributor"));

			expect(onChange).toHaveBeenLastCalledWith({
				blueprint: "contributor_bp",
			});
		});

		it("shows the stored blueprint by name, not by id", async () => {
			renderEditor({
				initial: { blueprint: "address_bp" },
				adapters: listingAdapter(),
			});

			expect(await screen.findByText("Address")).toBeInTheDocument();
		});

		it("keeps a stored blueprint the list does not offer", async () => {
			const { onChange } = renderEditor({
				initial: { blueprint: "retired_bp" },
				adapters: listingAdapter(),
			});

			// Shown under its raw id — the Author can see what the fieldset
			// points at — and never silently rewritten just by opening the panel.
			expect(await screen.findByText("retired_bp")).toBeInTheDocument();
			expect(onChange).not.toHaveBeenCalled();
		});

		it("leaves the fieldset without a blueprint when the Author clears it", async () => {
			const user = userEvent.setup();
			const { onChange } = renderEditor({
				initial: { blueprint: "address_bp", collapsible: true },
				adapters: listingAdapter(),
			});

			await user.click(await screen.findByLabelText(/Blueprint/));
			await user.keyboard("{Backspace}");

			expect(onChange).toHaveBeenLastCalledWith({
				blueprint: undefined,
				collapsible: true,
			});
		});

		it("says so when the Author has no blueprints to embed", async () => {
			const user = userEvent.setup();
			renderEditor({ adapters: listingAdapter(() => Promise.resolve([])) });

			await user.click(await screen.findByLabelText(/Blueprint/));

			expect(
				await screen.findByText("No blueprints available"),
			).toBeInTheDocument();
		});

		it("distinguishes a search that matched nothing from having none", async () => {
			const user = userEvent.setup();
			renderEditor({ adapters: listingAdapter() });

			await user.type(await screen.findByLabelText(/Blueprint/), "zzz");

			expect(
				await screen.findByText("No blueprint matches"),
			).toBeInTheDocument();
		});

		it("does not re-list when the consumer re-renders its adapters", async () => {
			const user = userEvent.setup();
			const list = vi.fn().mockResolvedValue(BLUEPRINTS);
			const { rerenderWithNewAdapters } = renderEditor({
				adapters: listingAdapter(list),
			});

			// The picker is open on the Author's screen when the consumer above
			// the provider re-renders with a freshly built adapters object.
			await user.click(await screen.findByLabelText(/Blueprint/));
			expect(await screen.findByText("Address")).toBeInTheDocument();

			rerenderWithNewAdapters(listingAdapter(list));

			expect(list).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Address")).toBeInTheDocument();
		});
	});

	describe("degrading to id entry", () => {
		it("falls back for an adapter that cannot list blueprints", async () => {
			const user = userEvent.setup();
			const { onChange, blueprint } = renderEditor({
				adapters: schemaOnlyAdapter(),
			});

			await user.type(blueprint(), "address_bp");

			expect(onChange).toHaveBeenLastCalledWith({ blueprint: "address_bp" });
		});

		it("falls back when listing fails, keeping the stored id editable", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			const user = userEvent.setup();
			const { onChange, blueprint } = renderEditor({
				initial: { blueprint: "address_bp" },
				adapters: listingAdapter(() =>
					Promise.reject(new Error("Network error")),
				),
			});

			const input = await screen.findByTestId("fieldset-blueprint-input");
			expect(input).toHaveValue("address_bp");

			await user.clear(blueprint());
			await user.type(blueprint(), "other_bp");

			expect(onChange).toHaveBeenLastCalledWith({ blueprint: "other_bp" });
		});
	});

	it("has displayName", () => {
		expect(FieldsetSettingsEditor.displayName).toBe("FieldsetSettingsEditor");
	});
});
