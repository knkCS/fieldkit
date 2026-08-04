import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { SingleReferenceSettings } from "../../../schema/field-types/single-reference";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeReferenceAdapter,
	type FakeReferenceAdapter,
} from "../../../test/fake-reference-adapter";
import type { FieldKitAdapters } from "../../adapters";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";

const ACCESSOR = "primary_article";
const LABEL = "Primary article";

function makeField(
	overrides: {
		required?: boolean;
		settings?: SingleReferenceSettings | null;
	} = {},
): Field<SingleReferenceSettings> {
	return {
		field_type: "single_reference",
		config: {
			name: LABEL,
			api_accessor: ACCESSOR,
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: overrides.settings ?? { blueprints: ["article"] },
		children: null,
		system: false,
	};
}

/** Reads the stored value straight from the form, so an assertion about what
 * was stored never goes through the same DOM the control renders. */
function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderField({
	field = makeField(),
	value = null,
	adapter,
	adapters,
	readOnly = false,
	onError,
}: {
	field?: Field<SingleReferenceSettings>;
	value?: unknown;
	adapter?: FakeReferenceAdapter;
	adapters?: FieldKitAdapters;
	readOnly?: boolean;
	onError?: (error: Error, fieldId: string) => void;
} = {}) {
	const submitted = vi.fn();
	const resolved =
		adapters ??
		({ reference: adapter ?? createFakeReferenceAdapter() } as const);

	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([field], builtInFieldTypes)),
			defaultValues: { [ACCESSOR]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider
					plugins={builtInFieldTypes}
					adapters={resolved}
					onError={onError}
				>
					<FormProvider {...methods}>
						{/* `noValidate`, as every Consumer's form must be: field
						    components render the native `required` attribute, and
						    the browser would otherwise block the submit before
						    React Hook Form saw it (docs/react-hook-form-reference.md). */}
						<form
							noValidate
							onSubmit={methods.handleSubmit((data) => submitted(data))}
						>
							<FieldComponent field={field} readOnly={readOnly} />
							<StoredValue />
							<button type="submit">Save</button>
						</form>
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}

	const view = render(<Harness />);
	// A regex, not the exact string: anker appends a required marker to the
	// label, so an exact match would find nothing on a required Field.
	return {
		...view,
		submitted,
		control: () => screen.getByLabelText(new RegExp(LABEL)),
	};
}

describe("SingleReferenceField", () => {
	it("stores only the picked Content's id — never its name", async () => {
		const user = userEvent.setup();
		const { control } = renderField();

		await user.click(control());
		await user.click(await screen.findByText("Cats of the world"));

		expect(stored()).toEqual({ id: "article-1" });
	});

	it("offers only Contents matching the Field's Blueprints", async () => {
		const user = userEvent.setup();
		const { control } = renderField();

		await user.click(control());

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
	});

	it("narrows the offered Contents to what the person searched for", async () => {
		const user = userEvent.setup();
		const { control } = renderField();

		await user.type(control(), "cat");

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Catalogues explained")).toBeInTheDocument();
		expect(screen.queryByText("Dogs of the world")).not.toBeInTheDocument();
	});

	it("shows the stored Content's current name, resolved on load", async () => {
		renderField({ value: { id: "article-2" } });

		expect(await screen.findByText("Dogs of the world")).toBeInTheDocument();
	});

	it("shows a Content renamed elsewhere under its new name", async () => {
		const adapter = createFakeReferenceAdapter();
		adapter.rename("article-2", "Dogs of the whole world");

		renderField({ value: { id: "article-2" }, adapter });

		expect(
			await screen.findByText("Dogs of the whole world"),
		).toBeInTheDocument();
	});

	it("still renders a Content it cannot resolve, showing its id", async () => {
		renderField({ value: { id: "deleted-42" } });

		expect(await screen.findByText("deleted-42")).toBeInTheDocument();
		// And the value is left exactly as it was — an unresolvable Content is
		// not silently dropped from the form data.
		expect(stored()).toEqual({ id: "deleted-42" });
	});

	it("still renders the stored Content when resolution fails", async () => {
		const onError = vi.fn();
		const adapter = createFakeReferenceAdapter({
			failFetch: new Error("gateway down"),
		});

		renderField({ value: { id: "article-2" }, adapter, onError });

		expect(await screen.findByText("article-2")).toBeInTheDocument();
		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
		);
	});

	it("clears back to no Reference", async () => {
		const user = userEvent.setup();
		const { control } = renderField({ value: { id: "article-1" } });

		await screen.findByText("Cats of the world");
		await user.click(control());
		await user.keyboard("{Backspace}");

		expect(stored()).toBeNull();
	});

	it("replaces the stored Reference when another Content is picked", async () => {
		const user = userEvent.setup();
		const { control } = renderField({ value: { id: "article-1" } });

		await user.click(control());
		await user.click(await screen.findByText("Dogs of the world"));

		// One Reference or none — never an array.
		expect(stored()).toEqual({ id: "article-2" });
	});

	describe("the Content it already holds", () => {
		/** The options the menu is offering, read off react-select's listbox so
		 * the Content shown *in* the control is never mistaken for one. */
		function offered(): string[] {
			return screen
				.getAllByRole("option")
				.map((option) => option.textContent ?? "");
		}

		it("is not offered as a change", async () => {
			const user = userEvent.setup();
			const { control } = renderField({ value: { id: "article-1" } });

			await screen.findByText("Cats of the world");
			await user.click(control());

			await waitFor(() =>
				expect(offered()).toEqual([
					"Dogs of the world",
					"Catalogues explained",
				]),
			);
		});

		it("is still shown in the control, though it is not on offer", async () => {
			const user = userEvent.setup();
			const { control } = renderField({ value: { id: "article-1" } });

			await user.click(control());

			// Excluding it from the search must not blank the control: the name
			// comes from `fetch`, never from whatever the menu happens to hold.
			expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		});

		it("tells the Adapter which Content it already references", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter();
			const { control } = renderField({ value: { id: "article-1" }, adapter });

			await user.click(control());

			await waitFor(() =>
				expect(adapter.searches.at(-1)?.excludeIds).toEqual(["article-1"]),
			);
		});

		it("excludes nothing while it holds no Reference", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter();
			const { control } = renderField({ adapter });

			await user.click(control());

			await waitFor(() => expect(adapter.searches).toHaveLength(1));
			expect(adapter.searches[0].excludeIds).toEqual([]);
		});

		it("stays out of the menu even when the Adapter ignores the field", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter({ ignoreExcludeIds: true });
			const { control } = renderField({ value: { id: "article-1" }, adapter });

			await screen.findByText("Cats of the world");
			await user.click(control());

			await waitFor(() =>
				expect(offered()).toEqual([
					"Dogs of the world",
					"Catalogues explained",
				]),
			);
		});

		it("is offered again once the Reference is cleared", async () => {
			const user = userEvent.setup();
			const { control } = renderField({ value: { id: "article-1" } });

			await screen.findByText("Cats of the world");
			await user.click(control());
			await user.keyboard("{Backspace}");

			await waitFor(() => expect(offered()).toContain("Cats of the world"));
		});
	});

	it("blocks submit and reports at its own path when required and empty", async () => {
		const user = userEvent.setup();
		const { submitted } = renderField({ field: makeField({ required: true }) });

		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(await screen.findByText(`${LABEL} is required`)).toBeInTheDocument();
		expect(submitted).not.toHaveBeenCalled();
	});

	it("submits once a required Field has a Reference", async () => {
		const user = userEvent.setup();
		const { submitted, control } = renderField({
			field: makeField({ required: true }),
		});

		await user.click(control());
		await user.click(await screen.findByText("Cats of the world"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(submitted).toHaveBeenCalledWith({
				[ACCESSOR]: { id: "article-1" },
			}),
		);
	});

	it("says so when no reference adapter is configured", () => {
		renderField({ adapters: {} });

		expect(
			screen.getByText("Reference adapter not configured"),
		).toBeInTheDocument();
	});

	it("reports a failed search without losing the control", async () => {
		const user = userEvent.setup();
		const onError = vi.fn();
		const adapter = createFakeReferenceAdapter({
			failSearch: new Error("search exploded"),
		});
		const { control } = renderField({ adapter, onError });

		await user.type(control(), "cat");

		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
		);
		expect(control()).toBeInTheDocument();
	});

	it("cannot be changed in read-only mode", async () => {
		const { control } = renderField({
			value: { id: "article-1" },
			readOnly: true,
		});

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(control()).toBeDisabled();
	});

	describe("pinning", () => {
		function pinningField(pinMode: "release" | "version" = "release") {
			return makeField({
				settings: { blueprints: ["article"], pin_mode: pinMode },
			});
		}

		/** The second select — the one beside the Content select. */
		function pinControl(name: RegExp = /Release/) {
			return screen.getByLabelText(name);
		}

		it("renders no second select when the Field does not pin", () => {
			renderField({
				field: makeField({
					settings: { blueprints: ["article"], pin_mode: "none" },
				}),
			});

			expect(screen.queryByLabelText(/Release/)).not.toBeInTheDocument();
			expect(screen.queryByLabelText(/Version/)).not.toBeInTheDocument();
		});

		it("treats a Spec written before pinning existed as not pinning", () => {
			renderField({ field: makeField({ settings: { blueprints: [] } }) });

			expect(screen.queryByLabelText(/Release/)).not.toBeInTheDocument();
		});

		it("renders a second select beside the Content select when it pins", async () => {
			renderField({ field: pinningField(), value: { id: "article-1" } });

			// Both on screen at once: one Content and its Release chosen without
			// a drawer in sight.
			expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
			expect(pinControl()).toBeInTheDocument();
		});

		it("offers the kind of target the Field's setting names", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter();
			renderField({
				field: pinningField("version"),
				value: { id: "article-1" },
				adapter,
			});

			await user.click(pinControl(/Version/));

			expect(await screen.findByText("Version 3")).toBeInTheDocument();
			expect(screen.queryByText("Spring release")).not.toBeInTheDocument();
			await waitFor(() =>
				expect(adapter.pinTargetQueries).toContainEqual({
					contentId: "article-1",
					mode: "version",
				}),
			);
		});

		it("stores only the target id", async () => {
			const user = userEvent.setup();
			renderField({ field: pinningField(), value: { id: "article-1" } });

			await user.click(pinControl());
			await user.click(await screen.findByText("Spring release"));

			// Which kind of target it is is never written down — the Field's
			// `pin_mode` is the only thing that says (ADR-0008).
			expect(stored()).toEqual({ id: "article-1", pin: "article-1-r2" });
		});

		it("stores no Pin at all until one is chosen", async () => {
			renderField({ field: pinningField(), value: { id: "article-1" } });

			// A Reference with no Pin resolves to the newest Version, and the
			// control says so where a chosen target would otherwise read.
			expect(stored()).toEqual({ id: "article-1" });
			expect(await screen.findByText("Newest version")).toBeInTheDocument();
		});

		it("clears back to the newest Version", async () => {
			const user = userEvent.setup();
			renderField({
				field: pinningField(),
				value: { id: "article-1", pin: "article-1-r2" },
			});

			await screen.findByText("Spring release");
			await user.click(pinControl());
			await user.keyboard("{Backspace}");

			expect(stored()).toEqual({ id: "article-1" });
		});

		it("shows a stored Pin under its current label", async () => {
			renderField({
				field: pinningField(),
				value: { id: "article-1", pin: "article-1-r1" },
			});

			expect(await screen.findByText("Launch")).toBeInTheDocument();
		});

		it("still shows a Pin it cannot resolve, under its id", async () => {
			renderField({
				field: pinningField(),
				// What a `pin_mode` change leaves behind: an id that no longer
				// names anything this Field offers.
				value: { id: "article-1", pin: "article-1-v2" },
			});

			expect(await screen.findByText("article-1-v2")).toBeInTheDocument();
			// And the stored value is left exactly as it was — nulling a stranded
			// Pin is the Consumer's upgrade to do, not this control's.
			expect(stored()).toEqual({ id: "article-1", pin: "article-1-v2" });
		});

		it("clears the Pin when the Content changes", async () => {
			const user = userEvent.setup();
			const { control } = renderField({
				field: pinningField(),
				value: { id: "article-1", pin: "article-1-r2" },
			});

			await screen.findByText("Spring release");
			await user.click(control());
			await user.click(await screen.findByText("Dogs of the world"));

			// A Pin can never point at a Release of a different Content.
			expect(stored()).toEqual({ id: "article-2" });
		});

		it("never offers the previous Content's targets after a change", async () => {
			const user = userEvent.setup();
			const adapter = createFakeReferenceAdapter({
				contents: [
					{
						id: "article-1",
						display_name: "Cats of the world",
						blueprint_id: "article",
						pin_targets: { release: [{ id: "r-cats", label: "Cats launch" }] },
					},
					{
						id: "article-2",
						display_name: "Dogs of the world",
						blueprint_id: "article",
						pin_targets: { release: [{ id: "r-dogs", label: "Dogs launch" }] },
					},
				],
			});
			const { control } = renderField({
				field: pinningField(),
				value: { id: "article-1", pin: "r-cats" },
				adapter,
			});

			await screen.findByText("Cats launch");
			await user.click(control());
			await user.click(await screen.findByText("Dogs of the world"));
			await user.click(pinControl());

			// The old Content's Release must be gone the instant the Content
			// changes — not merely once the new targets arrive. Offering it for
			// even the width of a round trip would let a Pin be written that
			// points at another Content's Release.
			expect(screen.queryByText("Cats launch")).not.toBeInTheDocument();
			expect(await screen.findByText("Dogs launch")).toBeInTheDocument();
		});

		it("clears the Pin when the Content is cleared", async () => {
			const user = userEvent.setup();
			const { control } = renderField({
				field: pinningField(),
				value: { id: "article-1", pin: "article-1-r2" },
			});

			await screen.findByText("Cats of the world");
			await user.click(control());
			await user.keyboard("{Backspace}");

			expect(stored()).toBeNull();
		});

		it("has nothing to pin to until a Content is chosen", () => {
			renderField({ field: pinningField() });

			expect(pinControl()).toBeDisabled();
		});

		it("reports a failed target lookup without losing the control", async () => {
			const onError = vi.fn();
			const adapter = createFakeReferenceAdapter({
				failPinTargets: new Error("pin lookup exploded"),
			});
			renderField({
				field: pinningField(),
				value: { id: "article-1" },
				adapter,
				onError,
			});

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
			);
			expect(pinControl()).toBeInTheDocument();
			expect(stored()).toEqual({ id: "article-1" });
		});

		it("cannot be changed in read-only mode", async () => {
			renderField({
				field: pinningField(),
				value: { id: "article-1", pin: "article-1-r2" },
				readOnly: true,
			});

			expect(await screen.findByText("Spring release")).toBeInTheDocument();
			expect(pinControl()).toBeDisabled();
		});

		it("offers the newest Version alone when the Adapter omits listPinTargets", async () => {
			const onError = vi.fn();
			// Stripped rather than failed: this is a Consumer that never
			// implemented pinning, which is a configuration and not an error.
			const { listPinTargets, ...adapter } = createFakeReferenceAdapter();
			renderField({
				field: pinningField(),
				value: { id: "article-1" },
				adapter,
				onError,
			});

			await screen.findByText("Cats of the world");
			expect(await screen.findByText("Newest version")).toBeInTheDocument();
			expect(pinControl()).toBeInTheDocument();
			expect(stored()).toEqual({ id: "article-1" });
		});

		it("does not report the omission through onError", async () => {
			const onError = vi.fn();
			const { listPinTargets, ...adapter } = createFakeReferenceAdapter();
			renderField({
				field: pinningField(),
				value: { id: "article-1" },
				adapter,
				onError,
			});

			await screen.findByText("Cats of the world");
			expect(onError).not.toHaveBeenCalled();
		});
	});
});
