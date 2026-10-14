// src/editor/__tests__/blueprint-picker.test.tsx
//
// Every setting that names a Blueprint or a Text Type Release, driven through
// SpecEditor with the real plugins and fake Adapters (ADR-0027): it searches
// and pages through the Adapter with the purpose of the setting asking, names
// what is stored (archived marked), shows a failure with a retry rather than
// an input, says so where there is no source, and stays locked throughout.
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field, LockedSetting, Schema } from "../../schema/types";
import {
	createFakePickerSource,
	type FakeChoice,
	fakeBlueprintAdapter,
	fakeTextTypeAdapter,
} from "../../test/fake-picker-adapters";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";

const L = DEFAULT_EDITOR_LABELS;
const plugins = builtInFieldTypes;

const CHOICES: FakeChoice[] = [
	{ id: "c_alpha", name: "Alpha" },
	{ id: "c_beta", name: "Beta" },
	{ id: "c_gamma", name: "Gamma" },
	{ id: "c_old", name: "Old one", archived: true },
];

function config(
	name: string,
	api_accessor: string,
	locked?: LockedSetting[],
): Field["config"] {
	return {
		name,
		api_accessor,
		required: false,
		instructions: "",
		...(locked ? { locked_settings: locked } : {}),
	};
}

/** One setting under test: the Field holding it, how to read it back off a
 * saved Spec, and how the picker is found. */
interface PickerCase {
	title: string;
	/** The settings key `locked_settings` freezes. */
	settingsKey: string;
	/** The Field with `stored` in the setting under test. */
	field: (stored: string[], locked?: LockedSetting[]) => Field;
	/** The ids the setting holds in a saved Field. */
	read: (field: Field) => string[];
	label: string | RegExp;
	testId: string;
	/** The purpose the Blueprint Adapter is asked with; absent for a Text
	 * Type, whose Adapter takes none. */
	purpose?: string;
	adapter: "blueprint" | "textType";
}

type Settings = Record<string, unknown>;
const settingsOf = (field: Field) => (field.settings ?? {}) as Settings;
const referenceEntries = (field: Field) =>
	(settingsOf(field).blueprints ?? []) as {
		blueprint: string;
		spec_blueprint?: string;
	}[];

const CASES: PickerCase[] = [
	{
		title: "a Fieldset's Blueprint",
		settingsKey: "blueprint",
		field: (stored, locked) => ({
			field_type: "fieldset",
			config: config("Address", "address", locked),
			settings: { collapsible: false, blueprint: stored[0] },
			system: false,
		}),
		read: (field) => {
			const id = settingsOf(field).blueprint;
			return typeof id === "string" ? [id] : [];
		},
		label: "Blueprint",
		testId: "fieldset-blueprint",
		purpose: "fieldset",
		adapter: "blueprint",
	},
	{
		title: "a Reference's target Blueprints",
		settingsKey: "blueprints",
		field: (stored, locked) => ({
			field_type: "reference",
			config: config("Related", "related", locked),
			settings: {
				blueprints: stored.map((blueprint) => ({ blueprint })),
				pin_mode: "none",
			},
			children: null,
			system: false,
		}),
		read: (field) => referenceEntries(field).map((entry) => entry.blueprint),
		label: "Blueprints",
		testId: "reference-blueprints",
		purpose: "reference_target",
		adapter: "blueprint",
	},
	{
		title: "a Reference's linked Reference Spec",
		settingsKey: "blueprints",
		field: (stored, locked) => ({
			field_type: "reference",
			config: config("Related", "related", locked),
			settings: {
				blueprints: [
					stored[0]
						? { blueprint: "article", spec_blueprint: stored[0] }
						: { blueprint: "article" },
				],
				pin_mode: "none",
			},
			children: null,
			system: false,
		}),
		read: (field) =>
			referenceEntries(field).flatMap((entry) =>
				entry.spec_blueprint ? [entry.spec_blueprint] : [],
			),
		label: "Reference Spec for article",
		testId: "reference-blueprints-spec-article",
		purpose: "fieldset",
		adapter: "blueprint",
	},
	{
		title: "a Single Reference's target Blueprints",
		settingsKey: "blueprints",
		field: (stored, locked) => ({
			field_type: "single_reference",
			config: config("Author", "author", locked),
			settings: {
				blueprints: stored.map((blueprint) => ({ blueprint })),
				pin_mode: "none",
			},
			children: null,
			system: false,
		}),
		read: (field) => referenceEntries(field).map((entry) => entry.blueprint),
		label: "Blueprints",
		testId: "single-reference-blueprints",
		purpose: "reference_target",
		adapter: "blueprint",
	},
	{
		title: "a linked Virtual Table's Row Spec",
		settingsKey: "blueprint",
		// Always linked: a Virtual Table shows the Row Spec picker only once it
		// links one, so the cases store a placeholder where nothing is stored.
		field: (stored, locked) => ({
			field_type: "virtual_table",
			config: config("Lines", "lines", locked),
			settings: { blueprint: stored[0] ?? "c_placeholder" },
			children: null,
			system: false,
		}),
		read: (field) => {
			const id = settingsOf(field).blueprint;
			return typeof id === "string" && id !== "c_placeholder" ? [id] : [];
		},
		label: "Row blueprint",
		testId: "virtual-table-blueprint",
		purpose: "row_spec",
		adapter: "blueprint",
	},
	{
		title: "a rich_text Field's Text Type",
		settingsKey: "text_type",
		field: (stored, locked) => ({
			field_type: "rich_text",
			config: config("Body", "body", locked),
			settings: { text_type: stored[0] },
			system: false,
		}),
		read: (field) => {
			const id = settingsOf(field).text_type;
			return typeof id === "string" ? [id] : [];
		},
		label: "Text Type",
		testId: "rich-text-text-type",
		adapter: "textType",
	},
];

function adaptersFor(
	pickerCase: PickerCase,
	source: ReturnType<typeof createFakePickerSource> | null,
): FieldKitAdapters {
	if (pickerCase.adapter === "textType") {
		return {
			textType: source ? fakeTextTypeAdapter(source) : { get: vi.fn() },
		};
	}
	return {
		blueprint: source
			? fakeBlueprintAdapter(source)
			: { getSchema: vi.fn().mockResolvedValue([]), getData: vi.fn() },
	};
}

async function renderSetting(
	pickerCase: PickerCase,
	{
		stored = [],
		source = createFakePickerSource({ choices: CHOICES }),
		locked,
	}: {
		stored?: string[];
		source?: ReturnType<typeof createFakePickerSource> | null;
		locked?: LockedSetting[];
	} = {},
) {
	const user = userEvent.setup();
	const onCommit = vi.fn();
	const onError = vi.fn();
	const field = pickerCase.field(stored, locked);
	render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider
				plugins={plugins}
				adapters={adaptersFor(pickerCase, source)}
				onError={onError}
			>
				<SpecEditor schema={[field]} onCommit={onCommit} plugins={plugins} />
			</FieldKitProvider>
		</ChakraProvider>,
	);
	await user.click(screen.getByTestId(`shell-${field.config.api_accessor}`));
	await user.click(screen.getByText(L.panelTabType));

	return {
		user,
		onCommit,
		onError,
		accessor: field.config.api_accessor,
		picker: () => screen.getByLabelText(pickerCase.label),
		save: async () => {
			await user.click(screen.getByText(L.save));
			await waitFor(() => expect(onCommit).toHaveBeenCalled());
			return pickerCase.read((onCommit.mock.calls[0][0] as Schema)[0]);
		},
	};
}

/** jsdom reports every box as 0×0; state the geometry the scroll implies. */
function scrollToBottom(el: HTMLElement) {
	for (const [key, value] of Object.entries({
		scrollTop: 300,
		scrollHeight: 400,
		clientHeight: 100,
	})) {
		Object.defineProperty(el, key, { value, configurable: true });
	}
	fireEvent.scroll(el);
}

describe.each(CASES)("the picker for $title", (pickerCase) => {
	const asked = (source: ReturnType<typeof createFakePickerSource>) =>
		source.search.mock.calls.map(([query]) => query);

	it("searches with the setting's purpose and stores the pick", async () => {
		const source = createFakePickerSource({ choices: CHOICES });
		const { user, picker, save } = await renderSetting(pickerCase, { source });

		await user.click(picker());
		await user.click(await screen.findByText("Beta"));

		expect(asked(source)[0]?.purpose).toBe(pickerCase.purpose);
		expect(await save()).toEqual(["c_beta"]);
	});

	it("narrows by what the Author types", async () => {
		const source = createFakePickerSource({ choices: CHOICES });
		const { user, picker } = await renderSetting(pickerCase, { source });

		await user.click(picker());
		await user.type(picker(), "gam");

		await waitFor(() =>
			expect(asked(source).at(-1)).toMatchObject({ query: "gam" }),
		);
		expect(await screen.findByText("Gamma")).toBeInTheDocument();
		expect(asked(source).at(-1)?.purpose).toBe(pickerCase.purpose);
	});

	it("pages through the Adapter as the menu scrolls", async () => {
		const source = createFakePickerSource({ choices: CHOICES, pageSize: 2 });
		const { user, picker } = await renderSetting(pickerCase, { source });

		await user.click(picker());
		expect(await screen.findByText("Beta")).toBeInTheDocument();
		expect(screen.queryByText("Gamma")).toBeNull();

		scrollToBottom(screen.getByRole("listbox"));

		expect(await screen.findByText("Gamma")).toBeInTheDocument();
		expect(asked(source).at(-1)?.cursor).toBe("2");
		expect(asked(source).at(-1)?.purpose).toBe(pickerCase.purpose);
	});

	it("names a stored choice, marking an archived one", async () => {
		const source = createFakePickerSource({ choices: CHOICES });
		await renderSetting(pickerCase, { stored: ["c_old"], source });

		expect(await screen.findByText("Old one (archived)")).toBeInTheDocument();
		expect(source.resolve).toHaveBeenCalledWith(
			expect.objectContaining({ ids: expect.arrayContaining(["c_old"]) }),
		);
	});

	it("shows a failed search with a retry, never an input", async () => {
		const failure = new Error("blueprint service unavailable");
		const failing = { current: failure as Error | null };
		const source = createFakePickerSource({ choices: CHOICES, failing });
		const { user, picker, onError, accessor } = await renderSetting(
			pickerCase,
			{ source },
		);

		await user.click(picker());

		expect(
			await screen.findByTestId(`${pickerCase.testId}-failed`),
		).toBeInTheDocument();
		expect(onError).toHaveBeenCalledWith(failure, accessor);
		expect(
			within(screen.getByTestId(pickerCase.testId)).queryAllByRole("textbox"),
		).toHaveLength(0);

		failing.current = null;
		await user.click(screen.getByTestId(`${pickerCase.testId}-retry`));

		expect(await screen.findByText("Alpha")).toBeInTheDocument();
		expect(screen.queryByTestId(`${pickerCase.testId}-failed`)).toBeNull();
	});

	it("says there is no source, without an input, when the Adapter cannot search", async () => {
		await renderSetting(pickerCase, { stored: ["c_alpha"], source: null });

		const note = screen.getByTestId(`${pickerCase.testId}-unavailable`);
		expect(note).toHaveTextContent(/has no source for/);
		// What is stored stays readable.
		expect(note).toHaveTextContent("c_alpha");
		expect(screen.queryByTestId(pickerCase.testId)).toBeNull();
		expect(screen.queryByLabelText(pickerCase.label)).toBeNull();
	});

	describe("locked", () => {
		const lock = (): LockedSetting[] => [
			{ key: pickerCase.settingsKey, reason: "Contents depend on it" },
		];

		it("stays disabled when the Adapter can search", async () => {
			await renderSetting(pickerCase, { stored: ["c_alpha"], locked: lock() });

			expect(await screen.findByText("Alpha")).toBeInTheDocument();
			expect(screen.getByLabelText(pickerCase.label)).toBeDisabled();
			// Every control writing the key shows the reason; a Reference's
			// pickers all write `blueprints`, a Virtual Table's mode does too.
			for (const reason of screen.getAllByTestId(
				`setting-locked-${pickerCase.settingsKey}`,
			)) {
				expect(reason).toHaveTextContent("Contents depend on it");
			}
		});

		it("stays disabled when naming the stored choice failed", async () => {
			const source = createFakePickerSource({
				choices: CHOICES,
				resolveFailing: { current: new Error("down") },
			});
			const { onError } = await renderSetting(pickerCase, {
				stored: ["c_alpha"],
				source,
				locked: lock(),
			});

			await waitFor(() => expect(onError).toHaveBeenCalled());
			// The raw id, still frozen.
			expect(screen.getByText("c_alpha")).toBeInTheDocument();
			expect(screen.getByLabelText(pickerCase.label)).toBeDisabled();
		});

		it("offers no input when there is no source", async () => {
			await renderSetting(pickerCase, {
				stored: ["c_alpha"],
				source: null,
				locked: lock(),
			});

			expect(
				screen.getByTestId(`${pickerCase.testId}-unavailable`),
			).toBeInTheDocument();
			expect(screen.queryByLabelText(pickerCase.label)).toBeNull();
			// Every control writing the key shows the reason; a Reference's
			// pickers all write `blueprints`, a Virtual Table's mode does too.
			for (const reason of screen.getAllByTestId(
				`setting-locked-${pickerCase.settingsKey}`,
			)) {
				expect(reason).toHaveTextContent("Contents depend on it");
			}
		});
	});
});

describe("a Reference's two pickers", () => {
	it("ask the one Adapter with different purposes", async () => {
		const source = createFakePickerSource({ choices: CHOICES });
		const { user } = await renderSetting(CASES[1], {
			stored: ["c_alpha"],
			source,
		});

		await user.click(screen.getByLabelText("Blueprints"));
		await screen.findByText("Beta");
		await user.click(screen.getByLabelText("Reference Spec for c_alpha"));
		await screen.findAllByText("Beta");

		expect(source.search.mock.calls.map(([q]) => q.purpose)).toEqual([
			"reference_target",
			"fieldset",
		]);
	});
});
