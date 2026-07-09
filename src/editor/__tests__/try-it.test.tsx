// src/editor/__tests__/try-it.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { toaster } from "@knkcs/anker/primitives";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FieldKitProvider } from "../../renderer/provider";
import { booleanPlugin } from "../../schema/field-types";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { SpecEditor } from "../spec-editor";
import { TryItView } from "../try-it-view";

// Mock only the `toaster` export — SpecForm imports `Tabs` from the same
// module, so the rest must pass through untouched via importOriginal.
vi.mock("@knkcs/anker/primitives", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@knkcs/anker/primitives")>();
	return { ...actual, toaster: { create: vi.fn() } };
});

function makeField(accessor: string, name: string, required = false): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required, instructions: "" },
		settings: null,
		system: false,
	};
}

function makeSection(accessor: string, name: string): Field {
	return {
		field_type: "section",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		system: false,
	};
}

function makeBooleanField(
	accessor: string,
	name: string,
	required = false,
): Field {
	return {
		field_type: "boolean",
		config: { name, api_accessor: accessor, required, instructions: "" },
		settings: null,
		system: false,
	};
}

// A registered input (unlike editor-helpers' TestField) so fireEvent.change
// actually drives react-hook-form state, and a toZodType that honors
// `config.required` (unlike editor-helpers' plain `z.string()`) so a
// required-empty submit actually fails validation.
function TestField({ field }: FieldProps) {
	const { register } = useFormContext();
	return (
		<input
			data-testid={`field-${field.config.api_accessor}`}
			aria-label={field.config.name}
			{...register(field.config.api_accessor)}
		/>
	);
}
TestField.displayName = "TestField";

const plugins: FieldTypePlugin[] = [
	{
		id: "text",
		name: "Text",
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: TestField,
		toZodType: (field) =>
			field.config.required ? z.string().min(1) : z.string(),
	},
	{
		id: "section",
		name: "Section",
		description: "",
		icon: () => null,
		category: "structural",
		fieldComponent: () => null,
		toZodType: () => z.never(),
	},
];

const LABELS = {
	testSubmit: "Test submit",
	testSubmitSuccess: "Form submitted successfully",
};

function Wrap({
	children,
	plugins: pluginsProp = plugins,
}: {
	children: ReactNode;
	/** Defaults to the module-level `plugins` fixture used by the other tests. */
	plugins?: FieldTypePlugin[];
}) {
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={pluginsProp}>{children}</FieldKitProvider>
		</ChakraProvider>
	);
}

describe("TryItView", () => {
	it("renders the real SpecForm fields interactively, not an inert preview", () => {
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("title", "Title"),
		];
		render(
			<Wrap>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		const input = screen.getByTestId("field-title");
		// EditorCanvas's FieldShell wraps previews in `inert` — Try-it must NOT
		// reuse that path; it renders the real, interactive SpecForm.
		expect(input.closest("[inert]")).toBeNull();

		fireEvent.change(input, { target: { value: "Hello" } });
		expect(input).toHaveValue("Hello");
	});

	it("shows the tab error badge when a required field is submitted empty", async () => {
		// Two tabs (like SpecForm's own submit-jump tests) so the failed
		// submit's jump-to-error-tab effect actually switches tabs, rather
		// than a same-tab no-op jump on a single-tab partition.
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("name", "Name"),
			makeSection("s2", "Details"),
			makeField("title", "Title", true),
		];
		render(
			<Wrap>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		fireEvent.click(screen.getByRole("button", { name: LABELS.testSubmit }));

		await waitFor(() => {
			expect(screen.getByTestId("tab-errors-1")).toBeInTheDocument();
		});
		expect(toaster.create).not.toHaveBeenCalled();
	});

	// Finding 1 (review): SpecEditor computes `mergedLabels.tabErrors` but
	// never forwarded it into TryItView's `labels` prop, so a consumer
	// translating `EditorLabels.tabErrors` got English Try-it badges. Render
	// the real SpecEditor (not TryItView directly, like the tests above) to
	// prove the full chain: SpecEditor -> TryItView -> SpecForm -> badge.
	it("passes a labels.tabErrors override through SpecEditor into the try-it badge's aria-label", async () => {
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("name", "Name"),
			makeSection("s2", "Details"),
			makeField("title", "Title", true),
		];
		render(
			<Wrap>
				<SpecEditor
					schema={schema}
					onCommit={vi.fn()}
					plugins={plugins}
					labels={{
						tabErrors: "{count} ungültige Felder",
						tabErrorsOne: "1 ungültiges Feld",
					}}
				/>
			</Wrap>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Try it" }));
		fireEvent.click(screen.getByRole("button", { name: LABELS.testSubmit }));

		await waitFor(() => {
			expect(screen.getByTestId("tab-errors-1")).toHaveAttribute(
				"aria-label",
				"1 ungültiges Feld",
			);
		});
	});

	it("calls toaster.create with the success message on a valid submit", async () => {
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("name", "Name"),
			makeSection("s2", "Details"),
			makeField("title", "Title", true),
		];
		render(
			<Wrap>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		// "title" lives on the inactive "Details" tab; SpecForm keeps every
		// panel mounted (just hidden), so it's still reachable and typable
		// without first switching tabs.
		fireEvent.change(screen.getByTestId("field-title"), {
			target: { value: "Hello" },
		});
		fireEvent.click(screen.getByRole("button", { name: LABELS.testSubmit }));

		await waitFor(() => {
			expect(toaster.create).toHaveBeenCalledWith({
				title: LABELS.testSubmitSuccess,
				type: "success",
			});
		});
		expect(screen.queryByTestId(/tab-errors-/)).not.toBeInTheDocument();
	});

	// Finding 1 (review, #38): nothing in this suite renders a real
	// value-producing plugin through TryItView, so a regression that drops
	// the `plugins` argument from `getDefaultValues(schema, plugins)` in
	// try-it-view.tsx would still pass every other test here. A plain
	// checked/unchecked assertion on the switch can't catch that regression:
	// anker's `SwitchField` renders `checked={field.value || false}`, so an
	// unseeded `undefined` and a seeded `false` both paint as "off" — the DOM
	// looks identical either way. What *does* differ is what RHF hands to
	// zod on submit: a required `z.boolean()` field rejects `undefined` but
	// accepts `false`. So an untouched submit of a required boolean only
	// succeeds when `getDefaultValues` actually seeded `false` — that's the
	// discriminating half missing from the checked-attribute alone.
	it("try-it seeds plugin value defaults — required boolean submits clean from seeded false (#38)", async () => {
		vi.mocked(toaster.create).mockClear();
		const schema: Schema = [
			makeSection("s1", "General"),
			makeBooleanField("flag", "Flag", true),
		];
		const pluginsWithBoolean: FieldTypePlugin[] = [...plugins, booleanPlugin];

		render(
			<Wrap plugins={pluginsWithBoolean}>
				<TryItView
					schema={schema}
					plugins={pluginsWithBoolean}
					labels={LABELS}
				/>
			</Wrap>,
		);

		const input = screen.getByRole("checkbox", {
			name: "Flag",
		}) as HTMLInputElement;
		expect(input.checked).toBe(false);

		// Submit without ever touching the switch — this is the part that
		// discriminates: it only passes zod validation if `flag` was already
		// seeded to `false` by getDefaultValues(schema, plugins). Dispatch the
		// submit event directly on the form (rather than clicking the submit
		// button) so jsdom's native HTML5 constraint validation — which
		// treats a `required` *checkbox* as needing `checked=true`, an
		// unrelated quirk of the native input type — doesn't block the event
		// before RHF's zod-backed handler ever runs.
		fireEvent.submit(screen.getByTestId("try-it-form"));

		await waitFor(() => {
			expect(toaster.create).toHaveBeenCalledWith({
				title: LABELS.testSubmitSuccess,
				type: "success",
			});
		});
		expect(screen.queryByTestId(/tab-errors-/)).not.toBeInTheDocument();
	});
});
