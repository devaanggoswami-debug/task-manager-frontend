import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "@/app/components/Pagination";
import { usePageSize } from "@/lib/hooks";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Pagination", () => {
  it("is a labelled navigation with a page summary and a labelled page-size select", () => {
    render(<Pagination label="Task pages" page={2} pageSize={20} total={45} onChange={vi.fn()} />);

    const nav = screen.getByRole("navigation", { name: "Task pages" });
    expect(within(nav).getByText("Page 2 of 3 (45 items)")).toBeTruthy();
    const size = within(nav).getByLabelText("Page size") as HTMLSelectElement;
    expect(Array.from(size.options).map((o) => o.value)).toEqual(["10", "20", "50", "100"]);
    expect(size.value).toBe("20");
    expect(within(nav).getByRole("button", { name: /^Previous\s*page$/ })).toHaveProperty("disabled", false);
    expect(within(nav).getByRole("button", { name: /^Next\s*page$/ })).toHaveProperty("disabled", false);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { rerender } = render(<Pagination label="Pages" page={1} pageSize={10} total={15} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Previous\s*page$/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /^Next\s*page$/ })).toHaveProperty("disabled", false);

    rerender(<Pagination label="Pages" page={2} pageSize={10} total={15} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Previous\s*page$/ })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: /^Next\s*page$/ })).toHaveProperty("disabled", true);

  });

  it("hides Previous and Next for a single page but keeps the page-size select", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Pagination label="Pages" page={1} pageSize={10} total={0} onChange={onChange} />);
    expect(screen.getByText("Page 1 of 1 (0 items)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Previous/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();

    rerender(<Pagination label="Pages" page={1} pageSize={10} total={8} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Page size"), "50");
    expect(onChange).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it("reports a separate item count when pages are counted over another total", () => {
    render(<Pagination label="Board pages" page={1} pageSize={10} total={15} itemCount={42} onChange={vi.fn()} />);
    expect(screen.getByText("Page 1 of 2 (42 items)")).toBeTruthy();
  });

  it("moves pages and resets to page 1 when the page size changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination label="Pages" page={2} pageSize={10} total={95} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /^Next\s*page$/ }));
    await user.click(screen.getByRole("button", { name: /^Previous\s*page$/ }));
    await user.selectOptions(screen.getByLabelText("Page size"), "50");

    expect(onChange.mock.calls.map(([next]) => next)).toEqual([
      { page: 3, pageSize: 10 },
      { page: 1, pageSize: 10 },
      { page: 1, pageSize: 50 },
    ]);
  });

  it("says 1 item for a single result", () => {
    render(<Pagination label="Pages" page={1} pageSize={10} total={1} onChange={vi.fn()} />);
    expect(screen.getByText("Page 1 of 1 (1 item)")).toBeTruthy();
  });
});

function SizeProbe({ listKey }: { listKey: string }) {
  const [size, setSize] = usePageSize(listKey);
  return <Pagination label={`${listKey} pages`} page={1} pageSize={size} total={200} onChange={(next) => setSize(next.pageSize)} />;
}

describe("usePageSize", () => {
  it("defaults to 20 and remembers the choice per list in localStorage", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SizeProbe listKey="projects" />);
    const select = screen.getByLabelText("Page size") as HTMLSelectElement;
    expect(select.value).toBe("20");

    await user.selectOptions(select, "50");
    expect(localStorage.getItem("tm.pageSize.projects")).toBe("50");
    expect((screen.getByLabelText("Page size") as HTMLSelectElement).value).toBe("50");
    unmount();

    render(<SizeProbe listKey="projects" />);
    render(<SizeProbe listKey="tasks" />);
    const projects = screen.getByRole("navigation", { name: "projects pages" });
    const tasks = screen.getByRole("navigation", { name: "tasks pages" });
    expect((within(projects).getByLabelText("Page size") as HTMLSelectElement).value).toBe("50");
    expect((within(tasks).getByLabelText("Page size") as HTMLSelectElement).value).toBe("20");
  });

  it("ignores stored values that are not a page-size option", () => {
    localStorage.setItem("tm.pageSize.projects", "7");
    render(<SizeProbe listKey="projects" />);
    expect((screen.getByLabelText("Page size") as HTMLSelectElement).value).toBe("20");
  });
});
