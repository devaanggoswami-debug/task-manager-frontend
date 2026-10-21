"use client";

import { useEffect, useId, useState } from "react";
import { STATUS_OPTIONS, listSprintsPage, listTasksPage, type Project, type Sprint, type TaskStatus } from "@/lib/api";
import { isRefreshing, usePagedList } from "@/lib/hooks";
import { Skeleton } from "./display";
import { RefreshingNote, countLabel, errorMessage } from "./formHelpers";
import Icon from "./Icon";
import Pagination from "./Pagination";
import { SprintDates } from "./ProjectsView";
import { ScopeStatusCheck } from "./ScopeStatus";
import { STATUS_ICON } from "./TaskStatusBadge";

type Breakdown =
  | { key: string; state: "loading" }
  | { key: string; state: "ready"; counts: Record<TaskStatus, number> }
  | { key: string; state: "error"; message: string };

/** Task counts per status, read from X-Total-Count of one-item pages so no task list is downloaded. */
function useStatusBreakdown(projectId: number, reloadKey: number): Breakdown {
  const key = `${projectId}:${reloadKey}`;
  const [state, setState] = useState<Breakdown>({ key, state: "loading" });
  useEffect(() => {
    let active = true;
    Promise.all(STATUS_OPTIONS.map((o) => listTasksPage({ projectId, status: o.value, page: 1, pageSize: 1 })))
      .then((pages) => {
        if (!active) return;
        const counts = Object.fromEntries(STATUS_OPTIONS.map((o, i) => [o.value, pages[i].total])) as Record<TaskStatus, number>;
        setState({ key, state: "ready", counts });
      })
      .catch((err: unknown) => {
        if (active) setState({ key, state: "error", message: errorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, [key, projectId]);
  return state;
}

export default function ProjectOverview({ project, reloadKey }: { project: Project; reloadKey: number }) {
  const id = useId();
  const breakdown = useStatusBreakdown(project.id, reloadKey);
  const sprints = usePagedList<Sprint>({
    listKey: "overviewSprints",
    filterKey: String(project.id),
    reloadKey,
    load: (params) => listSprintsPage({ projectId: project.id, ...params }),
  });
  const total = breakdown.state === "ready" ? Object.values(breakdown.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="overview">
      <section className="overview-card" aria-labelledby={`${id}-progress`}>
        <h2 id={`${id}-progress`}>Progress</h2>
        {breakdown.state === "loading" && <Skeleton label="Loading task counts…" rows={1} />}
        {breakdown.state === "error" && (
          <p role="alert" className="banner">
            Could not load task counts: {breakdown.message}
          </p>
        )}
        {breakdown.state === "ready" && (
          <>
            <p className="overview-total">
              <span className="big-number">{breakdown.counts.done}</span> of {countLabel(total, "task")} done
            </p>
            <div className="progress-bar" aria-hidden="true">
              {STATUS_OPTIONS.map((o) =>
                breakdown.counts[o.value] > 0 ? (
                  <span
                    key={o.value}
                    className={`progress-segment segment-${o.value}`}
                    style={{ flexGrow: breakdown.counts[o.value] }}
                  />
                ) : null,
              )}
            </div>
            <ul className="legend">
              {STATUS_OPTIONS.map((o) => (
                <li key={o.value} className={`legend-item legend-${o.value}`}>
                  <Icon name={STATUS_ICON[o.value]} size={16} />
                  <span>{o.label}</span>
                  <span className="legend-count">{breakdown.counts[o.value]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="overview-card" aria-labelledby={`${id}-health`}>
        <h2 id={`${id}-health`}>Project health</h2>
        <ScopeStatusCheck kind="project" scopeId={project.id} name={project.name} autoLoad reloadKey={reloadKey} />
      </section>

      <section className="overview-card overview-wide" aria-labelledby={`${id}-sprints`}>
        <h2 id={`${id}-sprints`}>Sprint health</h2>
        {!sprints.loaded && sprints.status === "loading" && <Skeleton label="Loading sprints…" rows={2} />}
        {sprints.status === "error" && (
          <p role="alert" className="banner">
            Could not load sprints: {errorMessage(sprints.error)}
          </p>
        )}
        {sprints.loaded && sprints.total === 0 && <p className="empty-inline">No sprints in this project yet.</p>}
        <RefreshingNote active={isRefreshing(sprints)} />
        {sprints.loaded && sprints.items.length > 0 && (
          <ul className="health-list" aria-label={`Sprint health in ${project.name}`}>
            {sprints.items.map((sprint) => (
              <li key={sprint.id} className="health-row">
                <div>
                  <p className="health-name">{sprint.name}</p>
                  <p className="meta">
                    <SprintDates sprint={sprint} />
                    <span className="meta-item">{countLabel(sprint.taskCount, "task")}</span>
                  </p>
                </div>
                <ScopeStatusCheck kind="sprint" scopeId={sprint.id} name={sprint.name} autoLoad reloadKey={reloadKey} />
              </li>
            ))}
          </ul>
        )}
        {sprints.loaded && sprints.total > 0 && (
          <Pagination
            label="Sprint health pages"
            page={sprints.page}
            pageSize={sprints.pageSize}
            total={sprints.total}
            onChange={sprints.setPaging}
          />
        )}
      </section>
    </div>
  );
}
