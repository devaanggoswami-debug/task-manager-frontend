import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskForm from "@/app/components/TaskForm";

afterEach(() => {
  cleanup();
});

describe("TaskForm", () => {
  it("ties labels to inputs with client-side constraints", () => {
    render(<TaskForm heading="New task" submitLabel="Create task" onSubmit={vi.fn()} />);

    const assignee = screen.getByLabelText("Assignee");
    const date = screen.getByLabelText("Due date");
    const description = screen.getByLabelText("Description");

    expect(assignee.getAttribute("maxlength")).toBe("100");
    expect(assignee.hasAttribute("required")).toBe(true);
    expect(date.getAttribute("type")).toBe("date");
    expect(description.tagName).toBe("TEXTAREA");
    expect(description.getAttribute("maxlength")).toBe("1000");
  });

  it("shows backend field errors next to their inputs", () => {
    render(
      <TaskForm
        heading="New task"
        submitLabel="Create task"
        fieldErrors={{ assignee: "is required", date: "must be YYYY-MM-DD" }}
        onSubmit={vi.fn()}
      />,
    );

    const assignee = screen.getByLabelText("Assignee");
    expect(assignee.getAttribute("aria-invalid")).toBe("true");
    const errorId = assignee.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)?.textContent).toBe("is required");

    expect(screen.getByLabelText("Due date").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("must be YYYY-MM-DD")).toBeTruthy();

    const description = screen.getByLabelText("Description");
    expect(description.hasAttribute("aria-invalid")).toBe(false);
  });

  it("submits the entered values", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<TaskForm heading="New task" submitLabel="Create task" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Assignee"), "Alice");
    await user.type(screen.getByLabelText("Due date"), "2026-10-31");
    await user.type(screen.getByLabelText("Description"), "Write docs");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(onSubmit).toHaveBeenCalledWith({
      assignee: "Alice",
      date: "2026-10-31",
      description: "Write docs",
      status: "not_started",
    });
  });

  it("offers a labelled status select defaulting to Not started", () => {
    render(<TaskForm heading="New task" submitLabel="Create task" onSubmit={vi.fn()} />);

    const status = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(status.tagName).toBe("SELECT");
    expect(status.value).toBe("not_started");
    expect(Array.from(status.options).map((o) => [o.value, o.textContent])).toEqual([
      ["not_started", "Not started"],
      ["in_progress", "In progress"],
      ["blocked", "Blocked"],
      ["done", "Done"],
    ]);
  });

  it("submits the selected status", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskForm
        heading="Edit task"
        submitLabel="Save changes"
        initialValues={{ assignee: "Bob", date: "2026-11-01", description: "Review", status: "not_started" }}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Status"), "Blocked");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSubmit).toHaveBeenCalledWith({
      assignee: "Bob",
      date: "2026-11-01",
      description: "Review",
      status: "blocked",
    });
  });

  it("shows a status field error inline", () => {
    render(
      <TaskForm
        heading="New task"
        submitLabel="Create task"
        fieldErrors={{ status: "must be one of not_started, in_progress, blocked, done" }}
        onSubmit={vi.fn()}
      />,
    );

    const status = screen.getByLabelText("Status");
    expect(status.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(status.getAttribute("aria-describedby")!)?.textContent).toBe(
      "must be one of not_started, in_progress, blocked, done",
    );
  });

  it("prefills values when editing", () => {
    render(
      <TaskForm
        heading="Edit task"
        submitLabel="Save changes"
        initialValues={{ assignee: "Bob", date: "2026-11-01", description: "Review", status: "in_progress" }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect((screen.getByLabelText("Assignee") as HTMLInputElement).value).toBe("Bob");
    expect((screen.getByLabelText("Due date") as HTMLInputElement).value).toBe("2026-11-01");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Review");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("in_progress");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});
