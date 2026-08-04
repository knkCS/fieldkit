// src/editor/__tests__/try-it-resolve.test.tsx
//
// Preview resolves the draft through `resolveSpec` before it builds a form
// from it (#54). The fields a Fieldset embeds already *appeared* in Preview
// before this — `FieldsetField` self-resolves for display — so the tests that
// discriminate are the ones about the generated Schema: a required embedded
// Field only blocks the test submit when resolution ran BEFORE
// `specToZodSchema`.
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { toaster } from "@knkcs/anker/primitives";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import { fieldsetPlugin } from "../../schema/field-types";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { SpecEditor } from "../spec-editor";
import { TryItView } from "../try-it-view";

// Mock only the `toaster` export — SpecForm/SpecEditor import `Tabs` and
// `Toaster` from the same module, so the rest must pass through untouched.
vi.mock("@knkcs/anker/primitives", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@knkcs/anker/primitives")>();
	return { ...actual, toaster: { create: vi.fn() } };
});

function textField(accessor: string, name: string, required = false): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required, instructions: "" },
		settings: null,
		system: false,
	};
}

/** A text Field carrying a value-level default, which only reaches the form
 * through `getDefaultValues` at mount. */
function seededField(accessor: string, name: string, value: string): Field {
	return {
		field_type: "text",
		config: {
			name,
			api_accessor: accessor,
			required: false,
			instructions: "",
			default_value: value,
		},
		settings: null,
		system: false,
	};
}

/** An authored Fieldset: a blueprint id and no `children` — resolution is
 * exactly what has to supply them. */
function fieldsetField(accessor: string, blueprint: string): Field {
	return {
		field_type: "fieldset",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: { blueprint },
		system: false,
	};
}

function blueprintAdapter(
	blueprints: Record<string, Field[]>,
): NonNullable<FieldKitAdapters["blueprint"]> {
	return {
		getSchema: vi.fn(async (id: string) => blueprints[id] ?? []),
		getData: vi.fn(async () => ({
			items: [],
			total: 0,
			page: 1,
			page_size: 25,
		})),
	};
}

function failingBlueprintAdapter(): NonNullable<FieldKitAdapters["blueprint"]> {
	return {
		getSchema: vi.fn(async () => {
			throw new Error("blueprint service unavailable");
		}),
		getData: vi.fn(async () => ({
			items: [],
			total: 0,
			page: 1,
			page_size: 25,
		})),
	};
}

// A registered input so `fireEvent.change` drives react-hook-form state, and a
// `toZodType` honoring `config.required` so a required-empty submit really
// fails — the same fixture rationale as try-it.test.tsx.
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
	fieldsetPlugin as FieldTypePlugin,
];

const LABELS = {
	testSubmit: "Test submit",
	testSubmitSuccess: "Form submitted successfully",
	previewResolveFailed: "Embedded fields could not be loaded",
};

function Wrap({
	children,
	adapters,
	onError,
}: {
	children: ReactNode;
	adapters?: FieldKitAdapters;
	onError?: (error: Error, fieldId: string) => void;
}) {
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={plugins} adapters={adapters} onError={onError}>
				{children}
			</FieldKitProvider>
		</ChakraProvider>
	);
}

beforeEach(() => {
	vi.mocked(toaster.create).mockClear();
});

describe("Preview resolves Fieldsets", () => {
	it("shows a Fieldset's embedded Fields when a blueprint adapter is configured", async () => {
		const blueprint = blueprintAdapter({
			address_bp: [textField("street", "Street")],
		});
		const schema: Schema = [
			textField("title", "Title"),
			fieldsetField("address", "address_bp"),
		];

		render(
			<Wrap adapters={{ blueprint }}>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		// Nested under the Fieldset's own accessor (ADR-0003) — the path a form
		// user's value is submitted at.
		expect(await screen.findByTestId("field-address.street")).toBeVisible();
	});

	// The discriminating one: without resolution the Fieldset is an opaque
	// `z.record(z.unknown())` and this submit succeeds, embedded required Field
	// or not.
	it("validates the embedded Fields — a required one blocks the test submit", async () => {
		const blueprint = blueprintAdapter({
			address_bp: [textField("street", "Street", true)],
		});
		const schema: Schema = [
			textField("title", "Title"),
			fieldsetField("address", "address_bp"),
		];

		render(
			<Wrap adapters={{ blueprint }}>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);
		await screen.findByTestId("field-address.street");

		fireEvent.submit(screen.getByTestId("try-it-form"));

		// Nothing to wait for on the failure path, so give the submit a real
		// chance to produce a toast before concluding it never will.
		await waitFor(() => {
			expect(screen.getByTestId("field-title")).toBeInTheDocument();
		});
		expect(toaster.create).not.toHaveBeenCalled();

		// …and the same form submits clean once the embedded field is filled —
		// so the block above is the child's own rule, not a Schema that rejects
		// every Fieldset.
		fireEvent.change(screen.getByTestId("field-address.street"), {
			target: { value: "Hauptstraße 1" },
		});
		fireEvent.submit(screen.getByTestId("try-it-form"));

		await waitFor(() => {
			expect(toaster.create).toHaveBeenCalledWith({
				title: LABELS.testSubmitSuccess,
				type: "success",
			});
		});
	});

	it("still renders, falling back to the stub, when no adapter is configured", async () => {
		const schema: Schema = [
			textField("title", "Title"),
			fieldsetField("address", "address_bp"),
		];

		render(
			<Wrap>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		// No skeleton gate: nothing can be fetched, so Preview renders at once.
		expect(screen.getByTestId("field-title")).toBeInTheDocument();
		expect(screen.getByText("Blueprint adapter not configured")).toBeVisible();

		fireEvent.submit(screen.getByTestId("try-it-form"));

		await waitFor(() => {
			expect(toaster.create).toHaveBeenCalledWith({
				title: LABELS.testSubmitSuccess,
				type: "success",
			});
		});
	});

	// A draft that changes while Preview is open — SpecEditor's remount nonce
	// only covers ENTRY into Preview, so the Schema has to follow the draft on
	// its own. Rendering the new Blueprint's Fields is the weak half (the
	// renderer self-resolves those anyway); VALIDATING against them is the
	// half that only passes if the new draft was resolved before its Schema
	// was built.
	it("re-resolves when the draft changes under it", async () => {
		const blueprint = blueprintAdapter({
			address_bp: [textField("street", "Street")],
			contact_bp: [textField("email", "Email", true)],
		});
		const first: Schema = [fieldsetField("details", "address_bp")];
		const second: Schema = [fieldsetField("details", "contact_bp")];

		const { rerender } = render(
			<Wrap adapters={{ blueprint }}>
				<TryItView schema={first} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);
		await screen.findByTestId("field-details.street");

		rerender(
			<Wrap adapters={{ blueprint }}>
				<TryItView schema={second} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		expect(await screen.findByTestId("field-details.email")).toBeVisible();
		expect(
			screen.queryByTestId("field-details.street"),
		).not.toBeInTheDocument();

		// Empty and required in the NEW Blueprint — an unresolved (or stale)
		// second draft would validate `details` as an opaque record and submit.
		fireEvent.submit(screen.getByTestId("try-it-form"));
		await waitFor(() => {
			expect(screen.getByTestId("field-details.email")).toBeInTheDocument();
		});
		expect(toaster.create).not.toHaveBeenCalled();

		fireEvent.change(screen.getByTestId("field-details.email"), {
			target: { value: "a@example.com" },
		});
		fireEvent.submit(screen.getByTestId("try-it-form"));
		await waitFor(() => {
			expect(toaster.create).toHaveBeenCalledWith({
				title: LABELS.testSubmitSuccess,
				type: "success",
			});
		});
	});

	// The other half of following the draft: `useForm` seeds its defaults once
	// per mount, so a changed draft has to arrive at a FRESH scratch form.
	//
	// Deliberately a draft with nothing to resolve — where a Fieldset has to be
	// fetched the skeleton unmounts the form anyway, so only this path can tell
	// whether the swap itself remounts it. A field carrying
	// `config.default_value` discriminates: that default reaches the form only
	// through `getDefaultValues` at mount, so a form kept from the previous
	// draft never receives it.
	it("re-seeds the scratch form's defaults from the draft it changed to", () => {
		const first: Schema = [textField("title", "Title")];
		const second: Schema = [
			textField("title", "Title"),
			seededField("email", "Email", "a@example.com"),
		];

		const { rerender } = render(
			<Wrap>
				<TryItView schema={first} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		rerender(
			<Wrap>
				<TryItView schema={second} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		expect(screen.getByTestId("field-email")).toHaveValue("a@example.com");
	});
});

describe("Preview resolution failures", () => {
	let consoleError: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Both the failed resolve and FieldsetField's own fallback fetch report
		// to the console by design; keep the suite output readable.
		consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleError.mockRestore();
	});

	it("surfaces the failure and still renders the rest of the draft", async () => {
		const blueprint = failingBlueprintAdapter();
		const schema: Schema = [
			textField("title", "Title"),
			fieldsetField("address", "address_bp"),
		];

		render(
			<Wrap adapters={{ blueprint }}>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		expect(await screen.findByText(LABELS.previewResolveFailed)).toBeVisible();
		// Degraded, not dead: the unresolved draft still renders and submits,
		// with the Fieldset back to the opaque record it is unresolved.
		expect(screen.getByTestId("field-title")).toBeInTheDocument();

		fireEvent.submit(screen.getByTestId("try-it-form"));
		await waitFor(() => {
			expect(toaster.create).toHaveBeenCalledWith({
				title: LABELS.testSubmitSuccess,
				type: "success",
			});
		});
	});

	// The Consumer's channel, as the blueprint picker does it (#52) — a
	// Blueprint that won't load is theirs to log, alert on, or report.
	it("reports the rejection through the provider's onError", async () => {
		const blueprint = failingBlueprintAdapter();
		const onError = vi.fn();
		const schema: Schema = [fieldsetField("address", "address_bp")];

		render(
			<Wrap adapters={{ blueprint }} onError={onError}>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		await screen.findByText(LABELS.previewResolveFailed);
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "preview");
		// Reported once, not also dumped to the console — a configured Consumer
		// owns the surfacing. (FieldsetField's own fallback fetch still logs;
		// that is its documented degrade, not this one.)
		expect(consoleError).not.toHaveBeenCalledWith(
			"Preview spec resolution failed:",
			expect.anything(),
		);
	});

	it("leaves the editor usable — Build mode comes back", async () => {
		const blueprint = failingBlueprintAdapter();
		const schema: Schema = [
			textField("title", "Title"),
			fieldsetField("address", "address_bp"),
		];

		render(
			<Wrap adapters={{ blueprint }}>
				<SpecEditor
					schema={schema}
					onCommit={vi.fn()}
					plugins={plugins}
					labels={{ previewResolveFailed: LABELS.previewResolveFailed }}
				/>
			</Wrap>,
		);

		// The SegmentedControl's zag radio-group machine settles asynchronously
		// (same rationale as the other mode-switch tests in this suite).
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
		});
		expect(await screen.findByText(LABELS.previewResolveFailed)).toBeVisible();

		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: "Build" }));
		});
		expect(screen.getByTestId("spec-editor")).toBeInTheDocument();
		expect(
			screen.queryByText(LABELS.previewResolveFailed),
		).not.toBeInTheDocument();
	}, 15000);
});

describe("Preview renders the draft", () => {
	it("shows a section added since the last save, not the committed Spec", async () => {
		const schema: Schema = [textField("title", "Title")];

		render(
			<Wrap>
				<SpecEditor schema={schema} onCommit={vi.fn()} plugins={plugins} />
			</Wrap>,
		);

		fireEvent.click(screen.getByRole("button", { name: "+ Section" }));
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
		});

		expect(
			await screen.findByRole("tab", { name: /New section/ }),
		).toBeInTheDocument();
	}, 15000);
});
