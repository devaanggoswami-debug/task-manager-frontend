import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "../../components/display";
import PageHeader from "../../components/PageHeader";
import ProjectView from "../../components/ProjectView";

export const metadata: Metadata = { title: "Project · Task Manager" };

function ProjectFallback() {
  return (
    <>
      <PageHeader title="Project" />
      <div className="page">
        <Skeleton label="Loading project…" rows={4} variant="card" />
      </div>
    </>
  );
}

export default function ProjectPage() {
  // The project id is only known at request time.
  return (
    <Suspense fallback={<ProjectFallback />}>
      <ProjectView />
    </Suspense>
  );
}
