// src/renderer/fields/__tests__/use-spring-loaded-branch.test.ts
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SPRING_DWELL_MS,
	useSpringLoadedBranch,
} from "../use-spring-loaded-branch";

describe("useSpringLoadedBranch", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("fires onSpring(key) after the dwell", () => {
		const onSpring = vi.fn();
		renderHook(() =>
			useSpringLoadedBranch({ pendingKey: "1.0", enabled: true, onSpring }),
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS - 1);
		expect(onSpring).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSpring).toHaveBeenCalledExactlyOnceWith("1.0");
	});

	it("cancels when the drag leaves the row before the dwell (crossing it)", () => {
		const onSpring = vi.fn();
		const { rerender } = renderHook(
			({ pending }: { pending: string | null }) =>
				useSpringLoadedBranch({ pendingKey: pending, enabled: true, onSpring }),
			{ initialProps: { pending: "0" as string | null } },
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS - 100);
		rerender({ pending: null });
		vi.advanceTimersByTime(SPRING_DWELL_MS * 2);
		expect(onSpring).not.toHaveBeenCalled();
	});

	it("re-arms per row, so springs chain within one drag", () => {
		const onSpring = vi.fn();
		const { rerender } = renderHook(
			({ pending }: { pending: string | null }) =>
				useSpringLoadedBranch({ pendingKey: pending, enabled: true, onSpring }),
			{ initialProps: { pending: "0" as string | null } },
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(onSpring).toHaveBeenCalledExactlyOnceWith("0");
		rerender({ pending: "2" });
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(onSpring).toHaveBeenCalledTimes(2);
		expect(onSpring).toHaveBeenLastCalledWith("2");
	});

	it("does nothing while disabled — a keyboard drag has no dwell", () => {
		const onSpring = vi.fn();
		renderHook(() =>
			useSpringLoadedBranch({ pendingKey: "0", enabled: false, onSpring }),
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS * 2);
		expect(onSpring).not.toHaveBeenCalled();
	});

	it("calls the LATEST onSpring (call-latest ref, no stale closure)", () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = renderHook(
			({ cb }: { cb: (key: string) => void }) =>
				useSpringLoadedBranch({ pendingKey: "0", enabled: true, onSpring: cb }),
			{ initialProps: { cb: first } },
		);
		rerender({ cb: second });
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledExactlyOnceWith("0");
	});
});
