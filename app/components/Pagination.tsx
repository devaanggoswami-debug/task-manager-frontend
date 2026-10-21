"use client";

import { useId } from "react";
import type { PageParams } from "@/lib/api";
import { PAGE_SIZE_OPTIONS, pageCount } from "@/lib/hooks";
import Icon from "./Icon";

interface PaginationProps {
  /** Accessible name of the navigation landmark, e.g. "Projects pages". */
  label: string;
  page: number;
  pageSize: number;
  /** Number of rows that pages are counted over. */
  total: number;
  /** Number of items to report when it differs from `total`, e.g. all cards across board columns. */
  itemCount?: number;
  onChange: (next: PageParams) => void;
  disabled?: boolean;
}

function itemLabel(total: number): string {
  return `${total} item${total === 1 ? "" : "s"}`;
}

/** Page summary, page-size select and, when there is more than one page, Previous and Next. */
export default function Pagination({ label, page, pageSize, total, itemCount = total, onChange, disabled = false }: PaginationProps) {
  const id = useId();
  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(page, 1), pages);
  const sizeId = `${id}-size`;

  return (
    <nav className="pagination" aria-label={label}>
      <p className="pagination-summary" aria-live="polite">
        Page {current} of {pages} ({itemLabel(itemCount)})
      </p>
      <div className="pagination-controls">
        <div className="pagination-size">
          <label htmlFor={sizeId}>Page size</label>
          <select
            id={sizeId}
            value={pageSize}
            onChange={(e) => onChange({ page: 1, pageSize: Number(e.target.value) })}
            disabled={disabled}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        {pages > 1 && (
          <div className="pagination-steps">
            <button
              type="button"
              className="secondary small"
              onClick={() => onChange({ page: current - 1, pageSize })}
              disabled={disabled || current <= 1}
            >
              <Icon name="chevronLeft" size={16} />
              Previous<span className="visually-hidden"> page</span>
            </button>
            <button
              type="button"
              className="secondary small"
              onClick={() => onChange({ page: current + 1, pageSize })}
              disabled={disabled || current >= pages}
            >
              Next<span className="visually-hidden"> page</span>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
