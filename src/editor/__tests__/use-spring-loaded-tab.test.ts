// src/editor/__tests__/use-spring-loaded-tab.test.ts
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPRING_DWELL_MS, useSpringLoadedTab } from "../use-spring-loaded-tab";

describe("useSpringLoadedTab", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("fires onSpring(tabIndex) after the dwell", () => {
		const onSpring = vi.fn();
		renderHook(() =>
			useSpringLoadedTab({ pendingTabIndex: 2, enabled: true, onSpring }),
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS - 1);
		expect(onSpring).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSpring).toHaveBeenCalledExactlyOnceWith(2);
	});

	it("cancels when the pending tab clears before the dwell (pass-through)", () => {
		const onSpring = vi.fn();
		const { rerender } = renderHook(
			({ pending }: { pending: number | null }) =>
				useSpringLoadedTab({
					pendingTabIndex: pending,
					enabled: true,
					onSpring,
				}),
			{ initialProps: { pending: 1 as number | null } },
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS - 100);
		rerender({ pending: null });
		vi.advanceTimersByTime(SPRING_DWELL_MS * 2);
		expect(onSpring).not.toHaveBeenCalled();
	});

	it("re-arms per tab: hovering another trigger restarts the dwell (chained springs)", () => {
		const onSpring = vi.fn();
		const { rerender } = renderHook(
			({ pending }: { pending: number | null }) =>
				useSpringLoadedTab({
					pendingTabIndex: pending,
					enabled: true,
					onSpring,
				}),
			{ initialProps: { pending: 1 as number | null } },
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(onSpring).toHaveBeenCalledExactlyOnceWith(1);
		rerender({ pending: 2 });
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(onSpring).toHaveBeenCalledTimes(2);
		expect(onSpring).toHaveBeenLastCalledWith(2);
	});

	it("does nothing while disabled (keyboard drags bypass the dwell)", () => {
		const onSpring = vi.fn();
		renderHook(() =>
			useSpringLoadedTab({ pendingTabIndex: 1, enabled: false, onSpring }),
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS * 2);
		expect(onSpring).not.toHaveBeenCalled();
	});

	it("calls the LATEST onSpring (call-latest ref, no stale closure)", () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = renderHook(
			({ cb }: { cb: (i: number) => void }) =>
				useSpringLoadedTab({ pendingTabIndex: 1, enabled: true, onSpring: cb }),
			{ initialProps: { cb: first } },
		);
		rerender({ cb: second });
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledExactlyOnceWith(1);
	});
});
