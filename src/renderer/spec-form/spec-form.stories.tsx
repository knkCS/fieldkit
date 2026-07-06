import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@knkcs/anker/atoms";
import { DrawerRoot } from "@knkcs/anker/components";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { boolean, number, section, select, text } from "../../schema/builders";
import { defineSpec } from "../../schema/define-spec";
import { builtInFieldTypes } from "../../schema/field-types";
import type { SectionSettings } from "../../schema/field-types/section";
import type { Field } from "../../schema/types";
import { specToZodSchema } from "../../schema/zod-builder";
import { FieldKitProvider } from "../provider";
import { SpecForm } from "./spec-form";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Not covered by the `section()` builder (it never sets `settings`), so the
// Vertical story constructs the section field directly — this is exactly
// what a spec editor produces when a user picks "vertical" in the section's
// settings panel.
function verticalSection(
	name: string,
	accessor: string,
): Field<SectionSettings> {
	return {
		field_type: "section",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: { orientation: "vertical" },
		children: null,
		system: false,
	};
}

// No `date()` builder exists yet (see docs/react-hook-form-reference.md
// builders list), so the read-mode story constructs the field directly.
function dateField(accessor: string, name: string): Field {
	return {
		field_type: "date",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		children: null,
		system: false,
	};
}

/* ------------------------------------------------------------------ */
/*  Specs                                                              */
/* ------------------------------------------------------------------ */

const horizontalSpec = defineSpec([
	text("title", {
		name: "Title",
		required: true,
		instructions: "Enter a title",
	}),
	boolean("published", { name: "Published" }),
	section("SEO", [
		text("meta_title", { name: "Meta Title" }),
		text("meta_description", { name: "Meta Description" }),
	]),
	section("Advanced", [
		number("priority", { name: "Priority", min: 0, max: 10 }),
		select("visibility", {
			name: "Visibility",
			options: { public: "Public", private: "Private", unlisted: "Unlisted" },
		}),
	]),
]);

const verticalSpec = defineSpec([
	text("name", { name: "Name", required: true }),
	[
		verticalSection("Profile", "section_profile"),
		text("bio", { name: "Bio", instructions: "A short biography" }),
		boolean("newsletter", { name: "Subscribe to newsletter" }),
	],
	section("Preferences", [
		select("theme", {
			name: "Theme",
			options: { light: "Light", dark: "Dark", system: "System" },
		}),
	]),
]);

const sectionlessSpec = defineSpec([
	text("name", { name: "Name", required: true }),
	number("quantity", { name: "Quantity", min: 0 }),
	boolean("inStock", { name: "In Stock" }),
]);

const readSpec = defineSpec([
	text("title", { name: "Title" }),
	text("subtitle", { name: "Subtitle" }),
	boolean("published", { name: "Published" }),
	dateField("publish_date", "Publish Date"),
]);

const readValues: Record<string, unknown> = {
	title: "Launch Announcement",
	// "subtitle" intentionally omitted — demonstrates the em-dash fallback
	// for empty values.
	published: true,
	publish_date: "2026-01-15",
};

/* ------------------------------------------------------------------ */
/*  Wrappers                                                           */
/* ------------------------------------------------------------------ */

function EditWrapper({
	spec,
	defaultValues,
	loading,
}: {
	spec: ReturnType<typeof defineSpec>;
	defaultValues?: Record<string, unknown>;
	loading?: boolean;
}) {
	const schema = specToZodSchema(spec.fields, builtInFieldTypes);
	const methods = useForm({
		resolver: zodResolver(schema),
		defaultValues: defaultValues ?? spec.defaultValues,
		mode: "onBlur",
	});

	return (
		<FieldKitProvider plugins={builtInFieldTypes}>
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit((data) => {
						console.log("Form submitted:", data);
					})}
				>
					<SpecForm schema={spec.fields} loading={loading} />
					{!loading && (
						<button type="submit" style={{ marginTop: 16 }}>
							Submit
						</button>
					)}
				</form>
			</FormProvider>
		</FieldKitProvider>
	);
}

// Demonstrates FieldSearch's Escape containment inside a real anker
// DrawerRoot (not the bare-div stand-in used by the unit tests): with the
// search dropdown open, Escape clears/closes the dropdown only; a second
// Escape (dropdown already closed) closes the drawer via anker's own
// dismissable-layer handling. See drawer-escape.test.tsx for the assertions.
function DrawerWrapper({ spec }: { spec: ReturnType<typeof defineSpec> }) {
	const [open, setOpen] = useState(true);
	const schema = specToZodSchema(spec.fields, builtInFieldTypes);
	const methods = useForm({
		resolver: zodResolver(schema),
		defaultValues: spec.defaultValues,
		mode: "onBlur",
	});

	return (
		<FieldKitProvider plugins={builtInFieldTypes}>
			<FormProvider {...methods}>
				<Button onClick={() => setOpen(true)}>Open drawer</Button>
				<DrawerRoot
					open={open}
					onClose={() => setOpen(false)}
					title="Edit entry"
				>
					<SpecForm schema={spec.fields} />
				</DrawerRoot>
			</FormProvider>
		</FieldKitProvider>
	);
}

// Read mode never touches react-hook-form — no FormProvider in the tree.
function ReadWrapper({
	spec,
	values,
}: {
	spec: ReturnType<typeof defineSpec>;
	values: Record<string, unknown>;
}) {
	return (
		<FieldKitProvider plugins={builtInFieldTypes}>
			<SpecForm schema={spec.fields} mode="read" values={values} />
		</FieldKitProvider>
	);
}

/* ------------------------------------------------------------------ */
/*  Meta                                                               */
/* ------------------------------------------------------------------ */

const meta = {
	title: "Renderer/SpecForm",
	component: SpecForm,
	parameters: { layout: "padded" },
} satisfies Meta<typeof SpecForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

export const Horizontal: Story = {
	render: () => <EditWrapper spec={horizontalSpec} />,
};

export const Vertical: Story = {
	render: () => <EditWrapper spec={verticalSpec} />,
};

export const Sectionless: Story = {
	render: () => (
		<EditWrapper
			spec={sectionlessSpec}
			defaultValues={{ name: "Widget", quantity: 3, inStock: true }}
		/>
	),
};

export const ReadMode: Story = {
	render: () => <ReadWrapper spec={readSpec} values={readValues} />,
};

// Read mode over a SECTIONED spec: the surface this branch shipped ("/" and
// cross-tab jump in read mode) had no permanent story of its own — the
// runtime pass that verified it had to improvise one. This reuses
// `horizontalSpec` (implicit "General" tab + "SEO" + "Advanced") so the
// tab strip, per-tab search, and cross-tab jump/flash are all exercisable:
// try "/" to focus search, then search "meta" and jump to a field in SEO.
const readSectionedValues: Record<string, unknown> = {
	title: "Launch Announcement",
	published: true,
	meta_title: "Launch Announcement — SEO Title",
	meta_description: "Everything you need to know about the launch.",
	priority: 5,
	visibility: "public",
};

export const ReadModeSectioned: Story = {
	render: () => (
		<ReadWrapper spec={horizontalSpec} values={readSectionedValues} />
	),
};

export const Loading: Story = {
	render: () => <EditWrapper spec={horizontalSpec} loading />,
};

export const InDrawerWithSections: Story = {
	render: () => <DrawerWrapper spec={horizontalSpec} />,
};
