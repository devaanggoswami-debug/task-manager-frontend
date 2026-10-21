import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Assistant from "@/app/components/Assistant";
import type { ChatResponse } from "@/lib/api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function reply(overrides: Partial<ChatResponse>): ChatResponse {
  return { reply: "ok", task: null, status: null, changed: false, ...overrides };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Assistant", () => {
  it("has a polite log, a labelled limited input and two example prompts", () => {
    render(<Assistant onChanged={vi.fn()} />);

    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByLabelText("Message").getAttribute("maxlength")).toBe("500");
    expect(
      screen.getByText('Create task "Fix login bug" for Alice due tomorrow in sprint Sprint 1 project Auth'),
    ).toBeTruthy();
    expect(screen.getByText("What is the status of sprint Sprint 1?")).toBeTruthy();
  });

  it("sends on Enter, disables sending meanwhile, and reloads only when changed", async () => {
    let resolveFirst: (res: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse(200, reply({ reply: "Help text" }))));
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<Assistant onChanged={onChanged} />);

    await user.type(screen.getByLabelText("Message"), "  create task Ship it for Bob due today{Enter}");
    expect(screen.getByRole("button", { name: "Sending…" })).toHaveProperty("disabled", true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/chat$/);
    expect(JSON.parse(String(init.body))).toEqual({ message: "create task Ship it for Bob due today" });
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("");

    resolveFirst(jsonResponse(200, reply({ reply: 'Created task #12 "Ship it" for Bob', changed: true })));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("log").textContent).toContain('Created task #12 "Ship it" for Bob');

    await user.type(screen.getByLabelText("Message"), "hello{Enter}");
    await waitFor(() => expect(screen.getByRole("log").textContent).toContain("Help text"));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("renders replies as literal plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(200, reply({ reply: "<b>bold</b>\nnext line" })))),
    );
    const user = userEvent.setup();
    render(<Assistant onChanged={vi.fn()} />);

    await user.type(screen.getByLabelText("Message"), "show{Enter}");
    const log = screen.getByRole("log");
    await waitFor(() => expect(log.querySelector(".chat-assistant .chat-text")).not.toBeNull());
    expect(log.querySelector(".chat-assistant .chat-text")?.textContent).toBe("<b>bold</b>\nnext line");
    expect(log.querySelector("b")).toBeNull();
  });

  it("renders a status badge above the reply when a status is returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            200,
            reply({
              reply: 'Sprint "Sprint 1" is BLOCKED: 1 blocked task.',
              status: { status: "blocked", reason: "1 blocked task", total: 2, done: 0, blocked: 1, overdue: 0 },
            }),
          ),
        ),
      ),
    );
    const user = userEvent.setup();
    render(<Assistant onChanged={vi.fn()} />);

    await user.type(screen.getByLabelText("Message"), "What is the status of sprint Sprint 1?{Enter}");
    const log = screen.getByRole("log");
    await waitFor(() => expect(log.querySelector(".scope-badge")?.textContent).toBe("Blocked"));
    const entry = log.querySelector(".chat-assistant")!;
    const badge = entry.querySelector(".scope-badge")!;
    const text = entry.querySelector(".chat-text")!;
    expect(badge.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows errors in the log", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse(400, { error: "validation failed", fields: { message: "is too long" } })),
      ),
    );
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<Assistant onChanged={onChanged} />);

    await user.type(screen.getByLabelText("Message"), "hi{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("log").textContent).toContain("Could not send message: validation failed"),
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", false);
  });

  it("dispatches tm:data-changed when a reply changed data, even without onChanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => Promise.resolve(jsonResponse(200, reply({ reply: "Created", changed: true }))))
        .mockImplementationOnce(() => Promise.resolve(jsonResponse(200, reply({ reply: "Help" })))),
    );
    const listener = vi.fn();
    window.addEventListener("tm:data-changed", listener);
    const user = userEvent.setup();
    try {
      render(<Assistant />);

      await user.type(screen.getByLabelText("Message"), "create task x{Enter}");
      await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
      expect(listener.mock.calls[0][0]).toBeInstanceOf(Event);

      await user.type(screen.getByLabelText("Message"), "hello{Enter}");
      await waitFor(() => expect(screen.getByRole("log").textContent).toContain("Help"));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("tm:data-changed", listener);
    }
  });
});
