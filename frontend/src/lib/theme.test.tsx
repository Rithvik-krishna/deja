import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopBar } from "../components/TopBar";
import { useTheme } from "./theme";

function mockSystem(light: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: light,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", () => mq);
  return {
    change(nextLight: boolean) {
      mq.matches = nextLight;
      listeners.forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useTheme", () => {
  it("reads the theme the boot script already set (so there is no flash)", () => {
    mockSystem(false);
    document.documentElement.dataset.theme = "light";
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("falls back to the OS preference, and to dark when it cannot tell", () => {
    mockSystem(true);
    expect(renderHook(() => useTheme()).result.current.theme).toBe("light");
    vi.stubGlobal("matchMedia", () => {
      throw new Error("unsupported");
    });
    delete document.documentElement.dataset.theme;
    expect(renderHook(() => useTheme()).result.current.theme).toBe("dark");
  });

  it("toggle switches the attribute, persists the choice, and survives blocked storage", () => {
    mockSystem(false);
    document.documentElement.dataset.theme = "dark";
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("deja-theme")).toBe("light");
    expect(result.current.theme).toBe("light");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    act(() => result.current.toggle());
    expect(document.documentElement.dataset.theme).toBe("dark"); // still applies for the session
  });

  it("follows the OS only until the user has chosen explicitly", () => {
    const sys = mockSystem(false);
    document.documentElement.dataset.theme = "dark";
    const { result } = renderHook(() => useTheme());

    act(() => sys.change(true));
    expect(result.current.theme).toBe("light");

    act(() => result.current.toggle()); // explicit choice: dark
    act(() => sys.change(true));
    expect(result.current.theme).toBe("dark");
  });
});

describe("theme toggle in the top bar", () => {
  it("is a labelled button that flips the theme", async () => {
    mockSystem(false);
    document.documentElement.dataset.theme = "dark";
    const user = userEvent.setup();
    render(
      <TopBar health={{ data: { status: "ok", mode: "mock", neo4j: false }, error: null, loading: false }} onRecheckHealth={vi.fn()} sessionId="abcdef123456" busy={null} onWipeSession={vi.fn()} onResetDemo={vi.fn()} demoActive={false} onRunDemo={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });
});
