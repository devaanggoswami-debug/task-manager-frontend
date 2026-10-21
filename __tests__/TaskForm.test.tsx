import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskForm from "@/app/components/TaskForm";
import type { Project, Sprint } from "@/lib/api";

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
      category: "auto",
      sprintIds: [],
      projectIds: [],
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
      sprintIds: [],
      projectIds: [],
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

  describe("category, sprints and projects", () => {
    const sprints: Sprint[] = [
      { id: 1, name: "Sprint 1", startDate: "2026-10-19", endDate: "2026-10-30", taskCount: 0, projectId: 5, createdAt: "x" },
      { id: 2, name: "Sprint 2", startDate: "2026-11-02", endDate: "2026-11-13", taskCount: 0, projectId: null, createdAt: "x" },
    ];
    const projects: Project[] = [
      { id: 5, name: "Auth", taskCount: 0, sprintCount: 1, createdAt: "x" },
      { id: 6, name: "Billing", taskCount: 0, sprintCount: 0, createdAt: "x" },
    ];
    const editValues = {
      assignee: "Bob",
      date: "2026-11-01",
      description: "Review",
      status: "in_progress" as const,
      sprintIds: [1],
      projectIds: [5, 6],
    };

    function optionsOf(select: HTMLElement) {
      return Array.from((select as HTMLSelectElement).options).map((o) => [o.value, o.textContent]);
    }

    const CATEGORIES = [
      ["engineering", "Engineering"],
      ["marketing", "Marketing"],
      ["finance", "Finance"],
      ["sales", "Sales"],
      ["compliance", "Compliance"],
    ];

    it("defaults to Auto-classify on create and submits a chosen category", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<TaskForm heading="New task" submitLabel="Create task" onSubmit={onSubmit} />);

      const category = screen.getByLabelText("Category") as HTMLSelectElement;
      expect(category.value).toBe("auto");
      expect(optionsOf(category)).toEqual([["auto", "Auto-classify"], ...CATEGORIES]);

      await user.type(screen.getByLabelText("Assignee"), "Alice");
      await user.type(screen.getByLabelText("Due date"), "2026-10-31");
      await user.type(screen.getByLabelText("Description"), "Pay invoice");
      await user.selectOptions(category, "Finance");
      await user.click(screen.getByRole("button", { name: "Create task" }));

      expect(onSubmit.mock.calls[0][0]).toMatchObject({ category: "finance" });
    });

    it("shows Unclassified on edit for a null category and omits category when kept", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(
        <TaskForm heading="Edit task" submitLabel="Save changes" initialValues={editValues} onSubmit={onSubmit} />,
      );

      const category = screen.getByLabelText("Category") as HTMLSelectElement;
      expect(category.value).toBe("");
      expect(optionsOf(category)).toEqual([["", "Unclassified"], ...CATEGORIES]);

      await user.click(screen.getByRole("button", { name: "Save changes" }));
      expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("category");
    });

    it("shows the current category on edit without Auto-classify or Unclassified", () => {
      render(
        <TaskForm
          heading="Edit task"
          submitLabel="Save changes"
          initialValues={{ ...editValues, category: "sales" }}
          onSubmit={vi.fn()}
        />,
      );

      const category = screen.getByLabelText("Category") as HTMLSelectElement;
      expect(category.value).toBe("sales");
      expect(optionsOf(category)).toEqual(CATEGORIES);
    });

    it("renders labelled checkbox fieldsets prefilled on edit", () => {
      render(
        <TaskForm
          heading="Edit task"
          submitLabel="Save changes"
          initialValues={editValues}
          sprints={sprints}
          projects={projects}
          onSubmit={vi.fn()}
        />,
      );

      const sprintGroup = screen.getByRole("group", { name: "Sprints" });
      const projectGroup = screen.getByRole("group", { name: "Projects" });
      expect(sprintGroup.tagName).toBe("FIELDSET");
      expect((within(sprintGroup).getByLabelText("Sprint 1 (Auth)") as HTMLInputElement).checked).toBe(true);
      expect((within(sprintGroup).getByLabelText("Sprint 2 (unassigned)") as HTMLInputElement).checked).toBe(false);
      expect((within(projectGroup).getByLabelText("Auth") as HTMLInputElement).checked).toBe(true);
      expect((within(projectGroup).getByLabelText("Billing") as HTMLInputElement).checked).toBe(true);
    });

    it("always sends the full membership sets on edit", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(
        <TaskForm
          heading="Edit task"
          submitLabel="Save changes"
          initialValues={editValues}
          sprints={sprints}
          projects={projects}
          onSubmit={onSubmit}
        />,
      );

      await user.click(screen.getByLabelText("Sprint 1 (Auth)"));
      await user.click(screen.getByLabelText("Sprint 2 (unassigned)"));
      await user.click(screen.getByLabelText("Auth"));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(onSubmit).toHaveBeenCalledWith({
        assignee: "Bob",
        date: "2026-11-01",
        description: "Review",
        status: "in_progress",
        sprintIds: [2],
        projectIds: [6],
      });
    });

    it("prefills memberships for a new task created from a sprint", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(
        <TaskForm
          heading="New task in Sprint 1"
          headingLevel={4}
          submitLabel="Create task"
          sprints={sprints}
          projects={projects}
          defaultMemberships={{ sprintIds: [1], projectIds: [5] }}
          onSubmit={onSubmit}
        />,
      );

      expect(screen.getByRole("heading", { level: 4, name: "New task in Sprint 1" })).toBeTruthy();
      expect((screen.getByLabelText("Sprint 1 (Auth)") as HTMLInputElement).checked).toBe(true);
      expect((screen.getByLabelText("Auth") as HTMLInputElement).checked).toBe(true);
      expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("auto");

      await user.type(screen.getByLabelText("Assignee"), "Alice");
      await user.type(screen.getByLabelText("Due date"), "2026-10-31");
      await user.type(screen.getByLabelText("Description"), "Ship it");
      await user.click(screen.getByRole("button", { name: "Create task" }));
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ sprintIds: [1], projectIds: [5] });
    });

    it("explains when there are no sprints or projects yet", () => {
      render(<TaskForm heading="New task" submitLabel="Create task" onSubmit={vi.fn()} />);

      expect(within(screen.getByRole("group", { name: "Sprints" })).getByText(/No sprints yet/)).toBeTruthy();
      expect(within(screen.getByRole("group", { name: "Projects" })).getByText(/No projects yet/)).toBeTruthy();
    });

    it("shows membership field errors inline", () => {
      render(
        <TaskForm
          heading="New task"
          submitLabel="Create task"
          sprints={sprints}
          fieldErrors={{ sprintIds: "unknown id(s): 7" }}
          onSubmit={vi.fn()}
        />,
      );

      const group = screen.getByRole("group", { name: "Sprints" });
      expect(document.getElementById(group.getAttribute("aria-describedby")!)?.textContent).toBe(
        "unknown id(s): 7",
      );
    });
  });
});
