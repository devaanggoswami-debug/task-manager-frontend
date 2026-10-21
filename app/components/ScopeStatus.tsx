"use client";

import { useEffect, useRef, useState } from "react";
import {
  SCOPE_HEALTH_LABELS,
  getProjectStatus,
  getSprintStatus,
  type ScopeHealth,
  type ScopeStatus,
} from "@/lib/api";
import { errorMessage } from "./formHelpers";
import Icon, { type IconName } from "./Icon";

const HEALTH_ICON: Record<ScopeHealth, IconName> = {
  on_track: "healthOnTrack",
  at_risk: "healthAtRisk",
  blocked: "healthBlocked",
};

export function ScopeStatusBadge({ status }: { status: ScopeHealth }) {
  return (
    <span className={`scope-badge scope-${status}`}>
      <Icon name={HEALTH_ICON[status]} size={16} />
      {SCOPE_HEALTH_LABELS[status]}
    </span>
  );
}

export type ScopeKind = "sprint" | "project";

export type CheckState =
  | { seq: number; state: "loading" }
  | { seq: number; state: "ready"; result: ScopeStatus }
  | { seq: number; state: "error"; message: string };

function fetchStatus(kind: ScopeKind, scopeId: number): Promise<ScopeStatus> {
  return kind === "sprint" ? getSprintStatus(scopeId) : getProjectStatus(scopeId);
}

export interface ScopeStatusQuery {
  check: CheckState | null;
  /** Fetches the status now and announces the result. */
  run: () => void;
  /** Text for a polite live region; only requested checks are announced. */
  announcement: string;
}

/** A sprint's or project's health, fetched on demand with `run` or automatically with `autoLoad`. */
export function useScopeStatus(kind: ScopeKind, scopeId: number, name: string, autoLoad = false, reloadKey = 0): ScopeStatusQuery {
  const [check, setCheck] = useState<CheckState | null>(autoLoad ? { seq: 0, state: "loading" } : null);
  const [announcement, setAnnouncement] = useState("");
  const seq = useRef(0);

  // Automatic loads update the badge silently; only a requested check is announced.
  useEffect(() => {
    if (!autoLoad) return;
    const current = ++seq.current;
    fetchStatus(kind, scopeId)
      .then((result) => {
        if (seq.current === current) setCheck({ seq: current, state: "ready", result });
      })
      .catch((err: unknown) => {
        if (seq.current === current) setCheck({ seq: current, state: "error", message: errorMessage(err) });
      });
  }, [autoLoad, kind, scopeId, reloadKey]);

  async function runCheck() {
    const current = ++seq.current;
    setCheck({ seq: current, state: "loading" });
    setAnnouncement("");
    // Only the most recent check may write its result.
    const settle = (next: CheckState) => setCheck((prev) => (prev?.seq === current ? next : prev));
    const scope = kind === "sprint" ? "Sprint" : "Project";
    try {
      const result = await fetchStatus(kind, scopeId);
      settle({ seq: current, state: "ready", result });
      if (seq.current === current) {
        setAnnouncement(`${scope} ${name}: ${SCOPE_HEALTH_LABELS[result.status]}. ${result.reason}`);
      }
    } catch (err) {
      const message = errorMessage(err);
      settle({ seq: current, state: "error", message });
      if (seq.current === current) setAnnouncement(`Could not check status of ${kind} ${name}: ${message}`);
    }
  }

  return { check, run: () => void runCheck(), announcement };
}

/**
 * The badge and reason of a check. With `truncate`, the reason stays on one line and its full text is
 * kept in the DOM (read by screen readers) and in a tooltip.
 */
export function ScopeStatusResult({
  check,
  truncate = false,
  badgeOnly = false,
}: {
  check: CheckState | null;
  truncate?: boolean;
  /** Show only the badge; the reason is a tooltip and is still read by screen readers. */
  badgeOnly?: boolean;
}) {
  if (check?.state === "ready" && badgeOnly) {
    return (
      <p className="scope-result" title={check.result.reason}>
        <ScopeStatusBadge status={check.result.status} />
        <span className="visually-hidden"> {check.result.reason}</span>
      </p>
    );
  }
  if (check?.state === "ready") {
    return (
      <p className={truncate ? "scope-result truncate" : "scope-result"}>
        <ScopeStatusBadge status={check.result.status} />{" "}
        <span className="scope-reason" title={truncate ? check.result.reason : undefined}>
          {check.result.reason}
        </span>
      </p>
    );
  }
  if (check?.state === "loading") return <span className="hint scope-pending">Checking…</span>;
  if (check?.state === "error") return <p className="field-error">Could not check status: {check.message}</p>;
  return null;
}

export function ScopeStatusAnnouncer({ text }: { text: string }) {
  return (
    <p role="status" className="visually-hidden">
      {text}
    </p>
  );
}

interface ScopeStatusCheckProps {
  kind: ScopeKind;
  scopeId: number;
  name: string;
  /** Show the badge without a click, refreshing whenever `reloadKey` changes. */
  autoLoad?: boolean;
  reloadKey?: number;
  /** Keep the reason on one line, e.g. in a header bar. */
  truncate?: boolean;
}

/** Status badge with its reason, fetched on demand via "Check status" or automatically with `autoLoad`. */
export function ScopeStatusCheck({ kind, scopeId, name, autoLoad = false, reloadKey = 0, truncate = false }: ScopeStatusCheckProps) {
  const { check, run, announcement } = useScopeStatus(kind, scopeId, name, autoLoad, reloadKey);
  return (
    <div className={truncate ? "scope-check truncate" : "scope-check"}>
      <ScopeStatusResult check={check} truncate={truncate} />
      <button type="button" className="ghost small" onClick={run} disabled={check?.state === "loading"}>
        <Icon name={autoLoad ? "refresh" : "info"} size={16} />
        {autoLoad ? "Refresh status" : "Check status"}
        <span className="visually-hidden"> of {kind} {name}</span>
      </button>
      <ScopeStatusAnnouncer text={announcement} />
    </div>
  );
}
