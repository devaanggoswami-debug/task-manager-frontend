import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskManager from "@/app/components/TaskManager";
import type { Task } from "@/lib/api";

const base: Task = {
  id: 1,
  assignee: "Alice",
  date: "2026-10-31",
  description: "Write docs",
  status: "not_started",
  createdAt: "2026-10-20T13:00:00Z",
  updatedAt: "2026-10-20T13:00:00Z",
};

const tasks: Task[] = [
  base,
  { ...base, id: 2, assignee: "Bob", status: "in_progress" },
  { ...base, id: 3, assignee: "Cara", status: "blocked" },
  { ...base, id: 4, assignee: "Dan", status: "done" },
];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TaskManager", () => {
  it("shows a text status label for each task", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, tasks)));
    render(<TaskManager />);

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Status" })).toBeTruthy();
    const [, ...rows] = within(table).getAllByRole("row") as HTMLTableRowElement[];
    expect(rows.map((row) => row.cells[3].textContent)).toEqual([
      "○ Not started",
      "◐ In progress",
      "✕ Blocked",
      "✓ Done",
    ]);
    expect(rows[3].className).toContain("done");
  });

  it("shows the status and updates in the details view", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/api/tasks")) return Promise.resolve(jsonResponse(200, [tasks[2]]));
      if (url.endsWith("/api/tasks/3")) return Promise.resolve(jsonResponse(200, tasks[2]));
      if (url.endsWith("/api/tasks/3/comments")) return Promise.resolve(jsonResponse(200, []));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TaskManager />);

    await user.click(await screen.findByRole("button", { name: /View/ }));
    const details = await screen.findByRole("region", { name: "Task details" });
    expect(details.textContent).toContain("Blocked");
    expect(within(details).getByRole("heading", { name: "Updates" })).toBeTruthy();
    await waitFor(() => expect(within(details).getByText("No updates yet.")).toBeTruthy());
  });
});
