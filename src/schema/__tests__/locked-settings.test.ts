// src/schema/__tests__/locked-settings.test.ts
import { describe, expect, it } from "vitest";
import { lockedSetting, restoreLockedSettings } from "../locked-settings";
import type { LockedSetting } from "../types";

const FROZEN_PIN: LockedSetting[] = [
	{ key: "pin_mode", reason: "12 contents already pin through this field" },
];

describe("lockedSetting", () => {
	it("finds the entry freezing a key", () => {
		expect(lockedSetting(FROZEN_PIN, "pin_mode")).toEqual(FROZEN_PIN[0]);
	});

	it("finds nothing for a key nobody froze", () => {
		expect(lockedSetting(FROZEN_PIN, "blueprints")).toBeUndefined();
	});

	it("reads an absent list as nothing frozen", () => {
		expect(lockedSetting(undefined, "pin_mode")).toBeUndefined();
	});

	it("ignores an entry that is not a locked setting at all", () => {
		// A Spec arrives as JSON from a Consumer and nothing validates this list
		// — one stray entry must cost that entry, never the lookup.
		const list = [null, "pin_mode", { reason: "no key" }, ...FROZEN_PIN];
		expect(lockedSetting(list as LockedSetting[], "pin_mode")).toEqual(
			FROZEN_PIN[0],
		);
	});

	it("freezes a setting whose entry carries no reason", () => {
		// The reason is what the Author reads; the lock is what the Consumer
		// meant. A missing reason must not quietly unfreeze the setting.
		const entry = lockedSetting(
			[{ key: "pin_mode" }] as unknown as LockedSetting[],
			"pin_mode",
		);
		expect(entry).toBeDefined();
	});
});

describe("restoreLockedSettings", () => {
	it("hands back an unlocked write untouched", () => {
		const next = { pin_mode: "release" };
		expect(restoreLockedSettings(undefined, { pin_mode: "none" }, next)).toBe(
			next,
		);
	});

	it("puts a frozen key back to the value it already had", () => {
		expect(
			restoreLockedSettings(
				FROZEN_PIN,
				{ pin_mode: "version", blueprints: ["article"] },
				{ pin_mode: "none", blueprints: ["article"] },
			),
		).toEqual({ pin_mode: "version", blueprints: ["article"] });
	});

	it("leaves every other setting of the same write alone", () => {
		expect(
			restoreLockedSettings(
				FROZEN_PIN,
				{ pin_mode: "version", max_items: 3 },
				{ pin_mode: "none", max_items: 8 },
			),
		).toEqual({ pin_mode: "version", max_items: 8 });
	});

	it("drops a frozen key the Field never had, rather than inventing one", () => {
		// "Unset" and "set to something" are different settings everywhere in
		// this package — writing the key back as `undefined` would conflate them
		// the moment the Spec is serialised.
		const restored = restoreLockedSettings(
			FROZEN_PIN,
			{ max_items: 3 },
			{ max_items: 3, pin_mode: "release" },
		);
		expect(restored).not.toHaveProperty("pin_mode");
		expect(restored).toEqual({ max_items: 3 });
	});

	it("refuses a wholesale replacement that could not carry the frozen key", () => {
		expect(
			restoreLockedSettings(FROZEN_PIN, { pin_mode: "version" }, null),
		).toEqual({ pin_mode: "version" });
	});

	it("honours every entry in the list, not just the first", () => {
		expect(
			restoreLockedSettings(
				[
					{ key: "pin_mode", reason: "pins exist" },
					{ key: "blueprints", reason: "contents exist" },
				],
				{ pin_mode: "version", blueprints: ["article"], max_items: 3 },
				{ pin_mode: "none", blueprints: [], max_items: 9 },
			),
		).toEqual({ pin_mode: "version", blueprints: ["article"], max_items: 9 });
	});
});
