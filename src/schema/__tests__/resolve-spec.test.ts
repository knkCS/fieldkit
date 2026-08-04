// src/schema/__tests__/resolve-spec.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolveSpec } from "../resolve-spec";
import type { Field, Schema } from "../types";

function textField(name: string, accessor: string): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		children: null,
		system: false,
	};
}

function fieldset(
	accessor: string,
	blueprint?: string,
	children: Field[] | null = null,
): Field {
	return {
		field_type: "fieldset",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: blueprint ? { blueprint } : {},
		children,
		system: false,
	};
}

function group(accessor: string, children: Field[]): Field {
	return {
		field_type: "group",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		children,
		system: false,
	};
}

/** A blueprint adapter over a fixed id → fields table. Only `getSchema` is
 * exercised; `getData` is present because the real adapter has it. */
function blueprintAdapter(blueprints: Record<string, Field[]>) {
	return {
		getSchema: vi.fn(async (id: string) => {
			const fields = blueprints[id];
			if (!fields) throw new Error(`No such blueprint: ${id}`);
			return fields;
		}),
		getData: vi.fn(async () => ({
			items: [],
			total: 0,
			page: 1,
			page_size: 25,
		})),
	};
}

describe("resolveSpec", () => {
	it("attaches a Blueprint's Fields as the Fieldset's children", async () => {
		const blueprint = blueprintAdapter({
			address_bp: [textField("Street", "street"), textField("City", "city")],
		});
		const spec: Schema = [
			textField("Title", "title"),
			fieldset("address", "address_bp"),
		];

		const resolved = await resolveSpec(spec, { blueprint });

		expect(blueprint.getSchema).toHaveBeenCalledWith("address_bp");
		expect(resolved[1].children).toEqual([
			textField("Street", "street"),
			textField("City", "city"),
		]);
		// Everything else survives the walk untouched.
		expect(resolved[0]).toEqual(spec[0]);
		expect(resolved[1].config).toEqual(spec[1].config);
	});

	it("resolves a Fieldset nested inside another Fieldset's Blueprint", async () => {
		const blueprint = blueprintAdapter({
			person_bp: [textField("Name", "name"), fieldset("address", "address_bp")],
			address_bp: [textField("Street", "street")],
		});

		const resolved = await resolveSpec([fieldset("author", "person_bp")], {
			blueprint,
		});

		const nested = resolved[0].children?.[1];
		expect(nested?.field_type).toBe("fieldset");
		expect(nested?.children).toEqual([textField("Street", "street")]);
	});

	it("resolves a Fieldset nested in another Field's children", async () => {
		const blueprint = blueprintAdapter({
			address_bp: [textField("Street", "street")],
		});
		const spec: Schema = [
			group("authors", [fieldset("address", "address_bp")]),
		];

		const resolved = await resolveSpec(spec, { blueprint });

		expect(resolved[0].children?.[0].children).toEqual([
			textField("Street", "street"),
		]);
	});

	it("fetches a Blueprint named twice in one call only once", async () => {
		const blueprint = blueprintAdapter({
			address_bp: [textField("Street", "street")],
		});
		const spec: Schema = [
			fieldset("billing", "address_bp"),
			fieldset("delivery", "address_bp"),
		];

		const resolved = await resolveSpec(spec, { blueprint });

		expect(blueprint.getSchema).toHaveBeenCalledTimes(1);
		expect(resolved[0].children).toEqual([textField("Street", "street")]);
		expect(resolved[1].children).toEqual([textField("Street", "street")]);
	});

	it("throws naming the chain when a Blueprint embeds itself", async () => {
		const blueprint = blueprintAdapter({
			node_bp: [textField("Label", "label"), fieldset("child", "node_bp")],
		});

		await expect(
			resolveSpec([fieldset("root", "node_bp")], { blueprint }),
		).rejects.toThrow("node_bp → node_bp");
	});

	it("throws naming the whole chain when the cycle runs through another Blueprint", async () => {
		const blueprint = blueprintAdapter({
			person_bp: [fieldset("address", "address_bp")],
			address_bp: [fieldset("resident", "person_bp")],
		});

		await expect(
			resolveSpec([fieldset("author", "person_bp")], { blueprint }),
		).rejects.toThrow("person_bp → address_bp → person_bp");
	});

	it("propagates an adapter rejection rather than resolving to empty children", async () => {
		const blueprint = {
			getSchema: vi.fn().mockRejectedValue(new Error("Network error")),
			getData: vi.fn(),
		};

		await expect(
			resolveSpec([fieldset("address", "address_bp")], { blueprint }),
		).rejects.toThrow("Network error");
	});

	it("returns the same Spec when there is nothing to resolve", async () => {
		const blueprint = blueprintAdapter({});
		const spec: Schema = [
			textField("Title", "title"),
			group("authors", [textField("Name", "name")]),
		];

		const resolved = await resolveSpec(spec, { blueprint });

		expect(resolved).toBe(spec);
		expect(blueprint.getSchema).not.toHaveBeenCalled();
	});

	it("leaves a Fieldset with no Blueprint chosen alone", async () => {
		const blueprint = blueprintAdapter({});
		const spec: Schema = [fieldset("address")];

		const resolved = await resolveSpec(spec, { blueprint });

		expect(resolved).toEqual(spec);
		expect(blueprint.getSchema).not.toHaveBeenCalled();
	});

	it("returns an equivalent Spec when no blueprint adapter is configured", async () => {
		const spec: Schema = [fieldset("address", "address_bp")];

		const resolved = await resolveSpec(spec, {});

		expect(resolved).toEqual(spec);
	});

	it("does not mutate the Spec it was given", async () => {
		const blueprint = blueprintAdapter({
			address_bp: [textField("Street", "street")],
		});
		const spec: Schema = [fieldset("address", "address_bp")];
		const before = structuredClone(spec);

		await resolveSpec(spec, { blueprint });

		expect(spec).toEqual(before);
	});

	it("leaves a Fieldset that already has children alone", async () => {
		const blueprint = blueprintAdapter({
			address_bp: [textField("Street", "street")],
		});
		const spec: Schema = [
			fieldset("address", "address_bp", [textField("Postcode", "postcode")]),
		];

		const resolved = await resolveSpec(spec, { blueprint });

		expect(resolved).toBe(spec);
		expect(blueprint.getSchema).not.toHaveBeenCalled();
	});

	it("is a no-op on a Spec it already resolved", async () => {
		const blueprint = blueprintAdapter({
			person_bp: [fieldset("address", "address_bp")],
			address_bp: [textField("Street", "street")],
		});
		const once = await resolveSpec([fieldset("author", "person_bp")], {
			blueprint,
		});

		const twice = await resolveSpec(once, { blueprint });

		// Same array, same Fields — a Consumer resolving from an effect keyed
		// on the Spec settles instead of looping.
		expect(twice).toBe(once);
		expect(blueprint.getSchema).toHaveBeenCalledTimes(2);
	});

	it("resolves a Blueprint with no Fields to empty children, not to nothing", async () => {
		const blueprint = blueprintAdapter({ empty_bp: [] });

		const resolved = await resolveSpec([fieldset("extras", "empty_bp")], {
			blueprint,
		});

		// null would read as "not resolved" and send the renderer back to the
		// adapter for a Blueprint that has nothing to give.
		expect(resolved[0].children).toEqual([]);
	});
});
