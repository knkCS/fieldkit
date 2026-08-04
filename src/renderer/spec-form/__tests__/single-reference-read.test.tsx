import { Provider } from "@knkcs/anker/primitives";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import {
	createFakeReferenceAdapter,
	type FakeReferenceAdapter,
} from "../../../test/fake-reference-adapter";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const field: Field = {
	field_type: "single_reference",
	config: {
		name: "Primary article",
		api_accessor: "primary_article",
		required: false,
		instructions: "",
	},
	settings: { blueprints: ["article"] },
	children: null,
	system: false,
};

function renderRead(
	values: Record<string, unknown>,
	adapter: FakeReferenceAdapter = createFakeReferenceAdapter(),
) {
	// No FormProvider on purpose: read mode must not require a form.
	return render(
		<Provider>
			<FieldKitProvider
				plugins={builtInFieldTypes}
				adapters={{ reference: adapter }}
			>
				<SpecForm schema={[field]} mode="read" values={values} />
			</FieldKitProvider>
		</Provider>,
	);
}

describe("SpecForm — read mode, single_reference", () => {
	it("shows the referenced Content's current name", async () => {
		renderRead({ primary_article: { id: "article-1" } });

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
	});

	it("shows the name a Content was renamed to elsewhere", async () => {
		const adapter = createFakeReferenceAdapter();
		adapter.rename("article-1", "Cats of the whole world");

		renderRead({ primary_article: { id: "article-1" } }, adapter);

		expect(
			await screen.findByText("Cats of the whole world"),
		).toBeInTheDocument();
	});

	it("shows the id of a Content it cannot resolve", async () => {
		renderRead({ primary_article: { id: "deleted-42" } });

		expect(await screen.findByText("deleted-42")).toBeInTheDocument();
	});

	it("renders an em dash when there is no Reference", () => {
		renderRead({ primary_article: null });

		expect(screen.getByText("—")).toBeInTheDocument();
	});
});
