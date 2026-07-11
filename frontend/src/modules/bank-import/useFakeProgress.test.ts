/**
 * The progress percentage should climb while active, never reach 100 on its
 * own, and snap to 100 the moment the work reports done.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFakeProgress } from "./useFakeProgress";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useFakeProgress", () => {
  it("starts at 0 and climbs while active", () => {
    const { result } = renderHook(() => useFakeProgress(true, false));
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBeGreaterThan(0);
  });

  it("never reaches 100 on its own", () => {
    const { result } = renderHook(() => useFakeProgress(true, false));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBeLessThan(100);
  });

  it("snaps to 100 when done", () => {
    const { result, rerender } = renderHook(
      ({ done }) => useFakeProgress(true, done),
      { initialProps: { done: false } },
    );
    act(() => vi.advanceTimersByTime(2000));
    rerender({ done: true });
    expect(result.current).toBe(100);
  });

  it("resets to 0 when inactive", () => {
    const { result } = renderHook(() => useFakeProgress(false, false));
    expect(result.current).toBe(0);
  });
});
