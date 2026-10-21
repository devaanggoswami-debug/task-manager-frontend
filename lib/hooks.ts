"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { DATA_CHANGED_EVENT, type Page, type PageParams } from "./api";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export function isPageSize(value: number): boolean {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value);
}

/** Number of pages for a total, never less than 1 so "Page 1 of 1" shows for empty lists. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

const PAGE_SIZE_EVENT = "tm:page-size";
// Used only when localStorage is unavailable (e.g. blocked by privacy settings).
const memoryPageSizes = new Map<string, number>();

function storageKey(listKey: string): string {
  return `tm.pageSize.${listKey}`;
}

function readPageSize(listKey: string, fallback: number): number {
  let stored: number | undefined;
  try {
    const raw = window.localStorage.getItem(storageKey(listKey));
    stored = raw === null ? undefined : Number(raw);
  } catch {
    stored = memoryPageSizes.get(listKey);
  }
  return stored !== undefined && isPageSize(stored) ? stored : fallback;
}

function subscribePageSize(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(PAGE_SIZE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PAGE_SIZE_EVENT, onChange);
  };
}

/** Page size for a list, remembered in localStorage under `tm.pageSize.<listKey>`. Renders the default on the server. */
export function usePageSize(listKey: string, defaultSize: number = DEFAULT_PAGE_SIZE): [number, (size: number) => void] {
  const size = useSyncExternalStore(
    subscribePageSize,
    () => readPageSize(listKey, defaultSize),
    () => defaultSize,
  );
  const setSize = useCallback(
    (next: number) => {
      try {
        window.localStorage.setItem(storageKey(listKey), String(next));
      } catch {
        memoryPageSizes.set(listKey, next);
      }
      window.dispatchEvent(new Event(PAGE_SIZE_EVENT));
    },
    [listKey],
  );
  return [size, setSize];
}

/** A key that changes whenever `reload` is called or the Assistant reports changed data. */
export function useReloadKey(): [number, () => void] {
  const [key, setKey] = useState(0);
  const reload = useCallback(() => setKey((k) => k + 1), []);
  useEffect(() => {
    window.addEventListener(DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload);
  }, [reload]);
  return [key, reload];
}

/** Moves focus after the next render, once the target element exists. */
export function useFocusRequest(): (target: () => HTMLElement | null | undefined) => void {
  const target = useRef<(() => HTMLElement | null | undefined) | null>(null);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (request === 0) return;
    target.current?.()?.focus();
    target.current = null;
  }, [request]);
  return useCallback((next) => {
    target.current = next;
    setRequest((n) => n + 1);
  }, []);
}

export interface PagedQuery<T> {
  status: "loading" | "ready" | "error";
  /** The most recently loaded page; kept while a newer page of the same list loads so it doesn't flash. */
  items: T[];
  total: number;
  /** True once a page of the current list has loaded and the last request did not fail. */
  loaded: boolean;
  error: unknown;
}

/** True while a newer page replaces rows that are still on screen. */
export function isRefreshing(query: Pick<PagedQuery<unknown>, "loaded" | "status">): boolean {
  return query.loaded && query.status === "loading";
}

interface PagedState<T> extends PagedQuery<T> {
  key: string;
  dataset: string;
}

/**
 * Loads a page whenever `queryKey` changes. Responses for an outdated key are ignored.
 * The previous page stays visible while the next loads, unless `datasetKey` changed (a different list).
 * `load` and `onLoaded` always see the latest render's values.
 */
export function usePagedQuery<T>(
  queryKey: string,
  load: () => Promise<Page<T>>,
  onLoaded?: (page: Page<T>) => void,
  datasetKey: string = "",
): PagedQuery<T> {
  const [state, setState] = useState<PagedState<T>>({
    key: queryKey,
    dataset: datasetKey,
    status: "loading",
    items: [],
    total: 0,
    loaded: false,
    error: null,
  });
  if (state.key !== queryKey) {
    const kept = state.dataset === datasetKey ? state : { ...state, items: [], total: 0, loaded: false };
    setState({ ...kept, key: queryKey, dataset: datasetKey, status: "loading", error: null });
  }

  const runLoad = useEffectEvent(load);
  const notifyLoaded = useEffectEvent((page: Page<T>) => onLoaded?.(page));

  useEffect(() => {
    let active = true;
    runLoad()
      .then((page) => {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          key: queryKey,
          status: "ready",
          items: page.items,
          total: page.total,
          loaded: true,
          error: null,
        }));
        notifyLoaded(page);
      })
      .catch((error: unknown) => {
        // Drop the previous rows so they are never shown as if they matched the failed query.
        if (active) setState((prev) => ({ ...prev, key: queryKey, status: "error", items: [], total: 0, loaded: false, error }));
      });
    return () => {
      active = false;
    };
  }, [queryKey]);

  const { status, items, total, loaded, error } = state;
  return { status, items, total, loaded, error };
}

export interface PagedList<T> extends PagedQuery<T>, PageParams {
  setPaging: (next: PageParams) => void;
}

interface PagedListOptions<T> {
  /** Page-size storage key, e.g. "projects". */
  listKey: string;
  /** Changing it (e.g. new filters or a different parent) returns to page 1. */
  filterKey: string;
  /** Changing it refetches the current page. */
  reloadKey: number;
  load: (params: PageParams) => Promise<Page<T>>;
}

/** A paginated list with its own page state and a remembered page size. */
export function usePagedList<T>({ listKey, filterKey, reloadKey, load }: PagedListOptions<T>): PagedList<T> {
  const [pageSize, setPageSize] = usePageSize(listKey);
  const [paging, setPagingState] = useState({ filterKey, page: 1 });
  let page = paging.page;
  if (paging.filterKey !== filterKey) {
    setPagingState({ filterKey, page: 1 });
    page = 1;
  }

  const query = usePagedQuery(
    JSON.stringify([filterKey, reloadKey, page, pageSize]),
    () => load({ page, pageSize }),
    (result) => {
      // The current page can fall past the end after items are removed; step back to the last page.
      const last = pageCount(result.total, pageSize);
      if (result.items.length === 0 && page > last) setPagingState({ filterKey, page: last });
    },
    filterKey,
  );

  function setPaging(next: PageParams) {
    if (next.pageSize !== pageSize) setPageSize(next.pageSize);
    setPagingState({ filterKey, page: next.page });
  }

  return { ...query, page, pageSize, setPaging };
}

const FLAG_EVENT = "tm:flag";
const memoryFlags = new Map<string, boolean>();

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return memoryFlags.get(key) ?? fallback;
  }
}

function subscribeFlag(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(FLAG_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(FLAG_EVENT, onChange);
  };
}

/** A boolean UI preference remembered in localStorage under `key`. Renders `fallback` on the server. */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribeFlag, () => readFlag(key, fallback), () => fallback);
  const setValue = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        memoryFlags.set(key, next);
      }
      window.dispatchEvent(new Event(FLAG_EVENT));
    },
    [key],
  );
  return [value, setValue];
}
