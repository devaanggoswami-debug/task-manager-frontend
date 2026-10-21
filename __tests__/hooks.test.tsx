import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { Page, PageParams } from "@/lib/api";
import { usePagedList, usePagedQuery } from "@/lib/hooks";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("usePagedQuery", () => {
  it("ignores a response that arrives after a newer query", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<Page<string>>>>();
    const load = (key: string) => {
      const d = deferred<Page<string>>();
      pending.set(key, d);
      return d.promise;
    };
    let setKey: (key: string) => void = () => {};
    function Probe() {
      const [key, set] = useState("a");
      setKey = set;
      const query = usePagedQuery(key, () => load(key));
      return <p data-testid="out">{`${query.status}:${query.items.join(",")}`}</p>;
    }
    render(<Probe />);

    act(() => setKey("b"));
    await act(async () => pending.get("b")!.resolve({ items: ["new"], total: 1 }));
    await act(async () => pending.get("a")!.resolve({ items: ["old"], total: 1 }));

    expect(screen.getByTestId("out").textContent).toBe("ready:new");
  });

  it("drops rows from a different dataset and after a failed load", async () => {
    let setFilter: (filter: string) => void = () => {};
    let fail = false;
    function Probe() {
      const [filter, set] = useState("x");
      setFilter = set;
      const query = usePagedQuery(
        filter,
        () => (fail ? Promise.reject(new Error("down")) : Promise.resolve({ items: [filter], total: 1 })),
        undefined,
        filter,
      );
      return <p data-testid="out">{`${query.status}:${query.loaded}:${query.items.join(",")}`}</p>;
    }
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("ready:true:x"));

    act(() => setFilter("y"));
    expect(screen.getByTestId("out").textContent).toBe("loading:false:");
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("ready:true:y"));

    fail = true;
    act(() => setFilter("z"));
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("error:false:"));
  });
});

describe("usePagedList", () => {
  it("steps back to the last page when the current page falls past the end", async () => {
    let total = 25;
    const calls: PageParams[] = [];
    let reload: () => void = () => {};
    let goTo: (page: number) => void = () => {};
    function Probe() {
      const [reloadKey, setReloadKey] = useState(0);
      reload = () => setReloadKey((k) => k + 1);
      const list = usePagedList<number>({
        listKey: "probe",
        filterKey: "",
        reloadKey,
        load: (params) => {
          calls.push(params);
          const start = (params.page - 1) * params.pageSize;
          const items = Array.from({ length: Math.max(0, Math.min(params.pageSize, total - start)) }, (_, i) => start + i);
          return Promise.resolve({ items, total });
        },
      });
      goTo = (page) => list.setPaging({ page, pageSize: list.pageSize });
      return <p data-testid="out">{`page ${list.page}: ${list.items.length} items`}</p>;
    }
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("page 1: 20 items"));

    act(() => goTo(2));
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("page 2: 5 items"));

    total = 20;
    act(() => reload());
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("page 1: 20 items"));
    expect(calls.map((c) => c.page)).toEqual([1, 2, 2, 1]);
  });
});
