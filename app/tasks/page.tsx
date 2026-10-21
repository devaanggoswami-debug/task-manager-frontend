import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "../components/display";
import PageHeader from "../components/PageHeader";
import TaskManager from "../components/TaskManager";

export const metadata: Metadata = { title: "All tasks · Task Manager" };

function TasksFallback() {
  return (
    <>
      <PageHeader title="All tasks" hideSearch />
      <div className="page">
        <Skeleton label="Loading tasks…" rows={6} />
      </div>
    </>
  );
}

export default function TasksPage() {
  // Filters live in the URL query, which is only known in the browser.
  return (
    <Suspense fallback={<TasksFallback />}>
      <TaskManager />
    </Suspense>
  );
}
