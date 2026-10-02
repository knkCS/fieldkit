import { describe, expect, it } from "vitest";
import { ACCESSOR_MAX_LENGTH, accessorFromName } from "../accessor";

describe("accessorFromName", () => {
	it("transliterates German letters instead of dropping them", () => {
		expect(accessorFromName("Änderungsinfo")).toBe("aenderungsinfo");
		expect(accessorFromName("Straßenname")).toBe("strassenname");
		expect(accessorFromName("Öl über Füße")).toBe("oel_ueber_fuesse");
		expect(accessorFromName("ÄÖÜ äöü ẞ")).toBe("aeoeue_aeoeue_ss");
	});

	it("strips other accents through NFKD", () => {
		expect(accessorFromName("Café crème")).toBe("cafe_creme");
		expect(accessorFromName("Ålesund Ñandú")).toBe("alesund_nandu");
		// Compatibility forms decompose too.
		expect(accessorFromName("ﬁle")).toBe("file");
	});

	it("lowercases and turns whitespace and - into _", () => {
		expect(accessorFromName("My Field")).toBe("my_field");
		expect(accessorFromName("e-mail Address")).toBe("e_mail_address");
		expect(accessorFromName("tab\tand\nnewline")).toBe("tab_and_newline");
	});

	it("drops other invalid characters", () => {
		expect(accessorFromName("My Field!")).toBe("my_field");
		expect(accessorFromName("€ Price")).toBe("price");
		expect(accessorFromName("snake_case")).toBe("snake_case");
	});

	it("collapses repeated _ and trims _ at both ends", () => {
		expect(accessorFromName("a  -  b")).toBe("a_b");
		expect(accessorFromName("a__b")).toBe("a_b");
		expect(accessorFromName("# of items")).toBe("of_items");
		expect(accessorFromName(" Title ")).toBe("title");
		expect(accessorFromName("_private_")).toBe("private");
	});

	it("cuts to the maximum accessor length, without a trailing _", () => {
		expect(ACCESSOR_MAX_LENGTH).toBe(64);
		const long = "a".repeat(100);
		expect(accessorFromName(long)).toBe("a".repeat(64));
		// The cut lands on a separator: it must not leave a trailing `_`.
		const atSeparator = `${"a".repeat(63)} b`;
		expect(accessorFromName(atSeparator)).toBe("a".repeat(63));
	});

	it("returns '' when the result would be empty or start with a digit", () => {
		expect(accessorFromName("")).toBe("");
		expect(accessorFromName("   ")).toBe("");
		expect(accessorFromName("!!!")).toBe("");
		expect(accessorFromName("日本語")).toBe("");
		expect(accessorFromName("1. Intro")).toBe("");
		expect(accessorFromName("2024 report")).toBe("");
		// A digit later on is fine.
		expect(accessorFromName("Report 2024")).toBe("report_2024");
	});
});
