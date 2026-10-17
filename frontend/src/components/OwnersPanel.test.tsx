import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api, type Catalog } from "../api/client";
import type { AsyncState } from "../state/useAsync";
import { catalog, ownerAfterReassign, ownerJuly, ownerNow, reassigned } from "../test/fixtures";
import { OwnersPanel } from "./OwnersPanel";

vi.mock("../api/client", () => ({ api: { owner: vi.fn(), reassign: vi.fn() } }));
const m = vi.mocked(api);

function setup(over: Partial<AsyncState<Catalog>> = {}) {
  const reload = vi.fn();
  const onNotify = vi.fn();
  const state: AsyncState<Catalog> = { data: catalog, error: null, loading: false, reload, ...over };
  render(<OwnersPanel catalog={state} refreshToken={0} onNotify={onNotify} />);
  return { reload, onNotify };
}

beforeEach(() => {
  vi.resetAllMocks();
  m.owner.mockResolvedValue(ownerNow);
});

describe("OwnersPanel lookup", () => {
  it("defaults to the first catalog service and shows the backend's owner for today", async () => {
    setup();
    expect(await screen.findByText("Asha Menon", { selector: "strong" })).toBeInTheDocument();
    expect(m.owner).toHaveBeenCalledExactlyOnceWith("payments-api", undefined);
    expect(screen.getByText("payments-api on 2026-10-17")).toBeInTheDocument(); // date as returned, not computed locally
  });

  it("sends the chosen historical date unchanged and shows the owner the API returns for it", async () => {
    setup();
    await screen.findByText("Asha Menon", { selector: "strong" });
    m.owner.mockResolvedValue({ ...ownerJuly, owner: "Dev Patel" }); // whatever the backend says, not a hardcoded name

    fireEvent.change(screen.getByLabelText("As of date"), { target: { value: "2026-07-15" } });

    expect(await screen.findByText("Dev Patel", { selector: "strong" })).toBeInTheDocument();
    expect(m.owner).toHaveBeenLastCalledWith("payments-api", "2026-07-15");
    expect(screen.getByText("payments-api on 2026-07-15")).toBeInTheDocument();
  });

  it("says so, and shows no owner, when the backend has no record for the date", async () => {
    m.owner.mockResolvedValue({ ...ownerNow, date: "2020-01-01", owner: null, valid_from: null, valid_to: null });
    setup();
    expect(await screen.findByText(/No ownership record for payments-api on 2020-01-01/)).toBeInTheDocument();
    expect(screen.queryByText("Asha Menon", { selector: "strong" })).not.toBeInTheDocument();
  });

  it("renders the returned history chronologically with current / superseded / selected-date markers", async () => {
    m.owner.mockResolvedValue(ownerJuly);
    setup();
    const hist = within(await screen.findByRole("region", { name: "Ownership history" }));
    const items = hist.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Asha Menon");
    expect(items[0]).toContain("Superseded");
    expect(items[0]).toContain("Owner on selected date");
    expect(items[0]).toContain("2025-11-01 → 2026-10-16");
    expect(items[1]).toContain("Ravi Iyer");
    expect(items[1]).toContain("Current");
    expect(items[1]).not.toContain("Owner on selected date");
  });

  it("shows an error with retry, never a substitute owner", async () => {
    const user = userEvent.setup();
    m.owner.mockRejectedValueOnce(new Error("404 /owner: unknown service 'payments-api'"));
    setup();
    expect(await screen.findByText(/Couldn't look up the owner: 404/)).toBeInTheDocument();
    expect(screen.queryByText("Asha Menon", { selector: "strong" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Asha Menon", { selector: "strong" })).toBeInTheDocument();
  });

  it("handles an empty catalog and a catalog error without inventing services", () => {
    setup({ data: { ...catalog, services: [] } });
    expect(screen.getByText("The catalog returned no services.")).toBeInTheDocument();
    expect(m.owner).not.toHaveBeenCalled();
  });

  it("shows the catalog error with retry", async () => {
    const user = userEvent.setup();
    const { reload } = setup({ data: undefined, error: "500 /catalog: boom" });
    expect(screen.getByText(/Couldn't load the service catalog: 500 \/catalog: boom/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalled();
    expect(m.owner).not.toHaveBeenCalled();
  });
});

describe("OwnersPanel reassignment", () => {
  async function chooseRavi(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("Asha Menon", { selector: "strong" });
    await user.selectOptions(screen.getByLabelText("New owner"), "ravi-iyer");
    await user.click(screen.getByRole("button", { name: "Reassign…" }));
  }

  it("needs a chosen engineer, then asks for confirmation before calling the API", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("Asha Menon", { selector: "strong" });
    expect(screen.getByRole("button", { name: "Reassign…" })).toBeDisabled();

    await chooseRavi(user);
    const dialog = screen.getByRole("dialog", { name: "Reassign ownership?" });
    expect(dialog).toHaveTextContent("Ravi Iyer");
    expect(m.reassign).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(m.reassign).not.toHaveBeenCalled();
  });

  it("submits the real request, reports success only after it, and refreshes ownership and the catalog", async () => {
    const user = userEvent.setup();
    m.reassign.mockResolvedValue(reassigned);
    const { onNotify, reload } = setup();
    await chooseRavi(user);
    m.owner.mockResolvedValue(ownerAfterReassign);

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reassign" }));

    expect(m.reassign).toHaveBeenCalledExactlyOnceWith("payments-api", "ravi-iyer", undefined);
    expect(onNotify).toHaveBeenCalledExactlyOnceWith("success", "Reassigned payments-api to Ravi Iyer.");
    expect(await screen.findByText("Ravi Iyer", { selector: "strong.owner-name" })).toBeInTheDocument(); // owner re-queried
    expect(m.owner).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalled();
    // The backend's own superseded record is shown, not an assumed one.
    expect(screen.getByText(/Superseded record: Asha Menon, 2025-11-01 → 2026-10-16/)).toBeInTheDocument();
    expect(screen.getByLabelText("New owner")).toHaveValue("");
  });

  it("passes an explicit effective date through", async () => {
    const user = userEvent.setup();
    m.reassign.mockResolvedValue(reassigned);
    setup();
    await screen.findByText("Asha Menon", { selector: "strong" });
    await user.selectOptions(screen.getByLabelText("New owner"), "ravi-iyer");
    fireEvent.change(screen.getByLabelText("Effective date (optional)"), { target: { value: "2026-11-01" } });
    await user.click(screen.getByRole("button", { name: "Reassign…" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reassign" }));

    expect(m.reassign).toHaveBeenCalledExactlyOnceWith("payments-api", "ravi-iyer", "2026-11-01");
  });

  it("shows the API error, no success, and keeps the form on failure", async () => {
    const user = userEvent.setup();
    m.reassign.mockRejectedValue(new Error("400 /owner: Ravi Iyer already owns payments-api"));
    const { onNotify, reload } = setup();
    await chooseRavi(user);

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reassign" }));

    expect(await screen.findByText(/Couldn't reassign: 400 \/owner: Ravi Iyer already owns/)).toBeInTheDocument();
    expect(onNotify).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(m.owner).toHaveBeenCalledTimes(1); // nothing refreshed: nothing changed
    expect(screen.queryByText(/Backend confirmed/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("New owner")).toHaveValue("ravi-iyer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
