import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../index";

/** The scalar and choice types and the markers (#207): each declares a strict
 * settingsSchema, so each is in the Catalogue. */
const SCALAR_CHOICE_AND_MARKER_TYPES = [
	"textarea",
	"number",
	"date",
	"time",
	"boolean",
	"select",
	"radio",
	"checkboxes",
	"email",
	"url",
	"slug",
	"color",
	"code",
	"markdown",
	"list",
	"array",
	"lookup",
	"media",
	"section",
	"card",
];

describe("settings schemas", () => {
	it.each(SCALAR_CHOICE_AND_MARKER_TYPES)("%s declares one", (id) => {
		const plugin = builtInFieldTypes.find((p) => p.id === id);
		expect(plugin?.settingsSchema, id).toBeDefined();
		expect(plugin?.catalogue, id).toBeDefined();
	});
});
