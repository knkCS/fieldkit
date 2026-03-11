import { describe, expect, it } from "vitest";
import type { Field } from "../../types";
import { timePlugin } from "../time";

describe("timePlugin", () => {
	it("should have correct metadata", () => {
		expect(timePlugin.id).toBe("time");
		expect(timePlugin.category).toBe("date");
	});

	it("should generate required string Zod type", () => {
		const field: Field = {
			field_type: "time",
			config: {
				name: "Start Time",
				api_accessor: "start_time",
				required: true,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = timePlugin.toZodType(field);
		expect(zodType.safeParse("14:30").success).toBe(true);
		expect(zodType.safeParse("").success).toBe(false);
	});

	it("should generate optional string Zod type", () => {
		const field: Field = {
			field_type: "time",
			config: {
				name: "End Time",
				api_accessor: "end_time",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};
		const zodType = timePlugin.toZodType(field);
		expect(zodType.safeParse("").success).toBe(true);
		expect(zodType.safeParse("09:00").success).toBe(true);
	});
});
