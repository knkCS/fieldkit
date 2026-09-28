import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { FieldRenderer } from "../../renderer/field-renderer";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import { copyRows, mintMissingIds } from "../../schema/row-ids";
import type { Field } from "../../schema/types";
import { validateValue } from "../../schema/validate-value";
import {
	MANIPULATION_INTENTS,
	manipulationTreePlugin,
	publishingFieldTypes,
} from "..";

function tree(settings: Record<string, unknown> = {}): Field {
	return {
		field_type: "manipulation_tree",
		config: {
			name: "Title",
			api_accessor: "title",
			required: false,
			instructions: "",
		},
		settings,
		system: false,
	} as Field;
}

const plugins = [...builtInFieldTypes, ...publishingFieldTypes];

function codes(errors: { path: string; code: string }[]) {
	return errors.map(({ path, code }) => ({ path, code }));
}

function Wrapper({
	children,
	list,
	values,
}: {
	children: ReactNode;
	list: FieldTypePlugin[];
	values: Record<string, unknown>;
}) {
	const methods = useForm({ defaultValues: values });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={list}>{children}</FieldKitProvider>
			</FormProvider>
		</ChakraProvider>
	);
}

describe("manipulation_tree", () => {
	it("is a publishing type, unknown without the package", () => {
		expect(publishingFieldTypes).toContain(manipulationTreePlugin);
		expect(builtInFieldTypes.map((p) => p.id)).not.toContain(
			"manipulation_tree",
		);
		const data = { title: [{ _id: "n1", id: "c1" }] };
		expect(validateValue([tree()], data, builtInFieldTypes)).toEqual([]);
		expect(codes(validateValue([tree()], data, plugins))).toEqual([
			{ path: "/title/n1/intent", code: "required" },
		]);
	});

	it("names the four intents", () => {
		expect(MANIPULATION_INTENTS).toEqual([
			"include",
			"exclude",
			"replace",
			"annotate",
		]);
	});

	it("validates annotate values against the node-level Reference Spec only", () => {
		const settings = {
			spec: [
				{
					field_type: "text",
					config: {
						name: "Note",
						api_accessor: "note",
						required: true,
						instructions: "",
					},
					system: false,
				},
			],
			annotation_spec: [
				{
					field_type: "number",
					config: {
						name: "Order",
						api_accessor: "order",
						required: false,
						instructions: "",
					},
					system: false,
				},
			],
		};
		const data = {
			title: [
				{ _id: "a1", id: "c1", intent: "annotate", values: { order: "x" } },
				{ _id: "a2", id: "c2", intent: "annotate", values: { order: 2 } },
			],
		};
		// The include's required note is not asked of an annotate.
		expect(codes(validateValue([tree(settings)], data, plugins))).toEqual([
			{ path: "/title/a1/values/order", code: "invalid_type" },
		]);
	});

	it("mints an _id on every node at every level, and keeps a loaded tree whole", () => {
		const loaded = {
			title: [
				{
					id: "c1",
					intent: "include",
					children: [{ _id: "k", id: "c2", intent: "exclude" }],
				},
			],
		};
		const minted = mintMissingIds([tree()], loaded, plugins);
		const [root] = minted.title as {
			_id: string;
			children: { _id: string }[];
		}[];
		expect(typeof root._id).toBe("string");
		expect(root.children[0]._id).toBe("k");
		expect(root).toMatchObject({ intent: "include", id: "c1" });

		const whole = {
			title: [{ _id: "n1", id: "c1", intent: "exclude" }],
		};
		expect(mintMissingIds([tree()], whole, plugins)).toBe(whole);
	});

	it("gives a copy new _ids and keeps its intents and with", () => {
		const rows = [
			{
				_id: "r1",
				id: "c1",
				intent: "replace",
				with: { id: "na1" },
				children: [{ _id: "r2", id: "c2", intent: "include" }],
			},
		];
		const [copy] = copyRows(tree(), rows, plugins) as {
			_id: string;
			with: unknown;
			children: { _id: string }[];
		}[];
		expect(copy._id).not.toBe("r1");
		expect(copy.children[0]._id).not.toBe("r2");
		expect(copy.with).toEqual({ id: "na1" });
	});

	it("renders its value read-only until its UI is ported", () => {
		const value = [{ _id: "n1", id: "c1", intent: "include" }];
		render(
			<Wrapper list={plugins} values={{ title: value }}>
				<FieldRenderer schema={[tree()]} />
			</Wrapper>,
		);
		const box = screen.getByRole("textbox") as HTMLTextAreaElement;
		expect(box.readOnly).toBe(true);
		expect(JSON.parse(box.value)).toEqual(value);
	});

	it("renders a Consumer's own field component attached to the plugin", () => {
		function ConsumerTree({ field }: FieldProps) {
			return <div data-testid="consumer-tree">{field.config.name}</div>;
		}
		const list = plugins.map((plugin) =>
			plugin.id === manipulationTreePlugin.id
				? { ...manipulationTreePlugin, fieldComponent: ConsumerTree }
				: plugin,
		);
		render(
			<Wrapper list={list} values={{ title: [] }}>
				<FieldRenderer schema={[tree()]} />
			</Wrapper>,
		);
		expect(screen.getByTestId("consumer-tree").textContent).toBe("Title");
		expect(screen.queryByRole("textbox")).toBeNull();
	});
});
