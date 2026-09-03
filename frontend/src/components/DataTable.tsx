'use client';

import React, { useEffect, useRef } from 'react';
import { Table } from 'react-bootstrap';
import { Select, Button } from '@bcgov/design-system-react-components';
import { FaChevronLeft, FaChevronRight, FaSort, FaSortDown, FaSortUp } from 'react-icons/fa6';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { useDictionary } from '@/app/[lang]/Providers';
import { useScrollableRegion } from '@/src/shared/hooks/useScrollableRegion';
import styles from './DataTable.module.css';

export type SortDirection = 'asc' | 'desc';

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  align?: 'start' | 'center' | 'end';
  render?: (item: T) => React.ReactNode;
  /** Server sort field. Set it to make the header a sort control. */
  sortField?: string;
  /** Direction the first click asks for. */
  sortDefaultDirection?: SortDirection;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  loadingMessage?: string;
  itemName?: string;
  caption?: string;
  pageSize?: number;
  currentPage?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Active sort as `field:asc` / `field:desc`. */
  sort?: string;
  onSortChange?: (sort: string) => void;
  keyExtractor: (item: T) => string;
}

const COLUMN_WIDTH_CLASS: Record<string, string> = {
  '40%': styles.colWidth40,
};

function columnHeaderClass<T>(col: Column<T>): string {
  const align = col.align || 'start';
  const widthClass = col.width ? COLUMN_WIDTH_CLASS[col.width] : undefined;
  return ['px-4', 'py-2', 'text-dark', 'fw-bold', `text-${align}`, widthClass]
    .filter(Boolean)
    .join(' ');
}

const splitSort = (sort: string | undefined): { field?: string; direction?: SortDirection } => {
  const separator = sort ? sort.lastIndexOf(':') : -1;
  if (!sort || separator < 0) return {};
  return {
    field: sort.slice(0, separator),
    direction: sort.slice(separator + 1) as SortDirection,
  };
};

export function DataTable<T>({
  data,
  columns,
  loading = false,
  error = null,
  emptyMessage = 'No items found.',
  loadingMessage = 'Loading...',
  itemName = 'items',
  caption,
  pageSize = 10,
  currentPage = 1,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 25, 50],
  sort,
  onSortChange,
  keyExtractor,
}: DataTableProps<T>) {
  const scrollerRef = useScrollableRegion<HTMLElement>();

  const dict = useDictionary();
  const t = dict.dataTable;

  const finalEmptyMessage = emptyMessage === 'No items found.' ? t.emptyMessage : emptyMessage;
  const finalLoadingMessage = loadingMessage === 'Loading...' ? t.loadingMessage : loadingMessage;
  const finalItemName = itemName === 'items' ? t.itemName : itemName;

  // A size the menu does not offer would leave the control blank, so fall back to one it does.
  const effectivePageSize = pageSizeOptions.includes(pageSize) ? pageSize : pageSizeOptions[0];
  const totalPages = totalItems ? Math.ceil(totalItems / effectivePageSize) : 1;
  // A page past the end reads as an empty table with a range that contradicts it, and the page menu
  // renders blank because the number is not one of its options. Only once the total is known: before
  // the first response every page looks past the end, which would reset a deep link to page one.
  const totalKnown = totalItems !== undefined;
  const effectivePage = totalKnown
    ? Math.min(Math.max(currentPage, 1), totalPages)
    : Math.max(currentPage, 1);

  // Asked once per value. The setter writes the URL, which comes back as a new `currentPage`; if a
  // caller ever fails to apply it, re-asking every render would spin.
  const clampAsked = useRef<number | null>(null);
  useEffect(() => {
    if (!totalKnown || !onPageChange) return;
    if (currentPage === effectivePage) {
      clampAsked.current = null;
      return;
    }
    if (clampAsked.current === effectivePage) return;
    clampAsked.current = effectivePage;
    onPageChange(effectivePage);
  }, [totalKnown, onPageChange, currentPage, effectivePage]);

  const { field: sortField, direction: sortDirection } = splitSort(sort);

  const renderHeader = (col: Column<T>) => {
    if (!col.sortField || !onSortChange) return col.label;
    const active = col.sortField === sortField;
    const flipped: SortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    const nextDirection = active ? flipped : (col.sortDefaultDirection ?? 'asc');
    const Icon = active && sortDirection === 'asc' ? FaSortUp : FaSortDown;
    return (
      <button
        type="button"
        className={styles.sortButton}
        data-testid={`datatable-sort-${col.key}`}
        onClick={() => onSortChange(`${col.sortField}:${nextDirection}`)}
      >
        {col.label}
        {active ? (
          <Icon aria-hidden className={styles.sortIconActive} />
        ) : (
          <FaSort aria-hidden className={styles.sortIcon} />
        )}
      </button>
    );
  };

  const headerSortState = (col: Column<T>) => {
    if (!col.sortField || !onSortChange) return undefined;
    if (col.sortField !== sortField) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const renderBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={columns.length} className="p-0">
            <CenteredProgress label={finalLoadingMessage} data-testid="datatable-loading" />
          </td>
        </tr>
      );
    }
    if (error || data.length === 0) {
      return (
        <tr>
          <td
            colSpan={columns.length}
            className="text-center py-5 text-muted"
            data-testid={error ? 'datatable-error' : 'datatable-empty'}
          >
            {/* Callers pass a sentence the reader can act on. Prefixing it turns "Your session has
                ended. Please sign in again." into something that reads like a stack trace. */}
            {error ?? finalEmptyMessage}
          </td>
        </tr>
      );
    }
    return data.map((item) => (
      <tr key={keyExtractor(item)} className={styles.row}>
        {columns.map((col) => (
          <td
            key={`${keyExtractor(item)}-${col.key}`}
            className={`px-4 py-2 text-${col.align || 'start'}`}
          >
            {col.render
              ? col.render(item)
              : ((item as Record<string, unknown>)[col.key] as React.ReactNode)}
          </td>
        ))}
      </tr>
    ));
  };

  return (
    <div className={`bg-white rounded overflow-hidden ${styles.container}`}>
      {/* Owned rather than react-bootstrap's `responsive` wrapper, which is scrollable but has no
          tabindex, leaving the overflow unreachable by keyboard. */}
      <section ref={scrollerRef} className={styles.scroller} aria-label={caption}>
        <Table className={`mb-0 align-middle ${styles.table}`}>
          {caption ? <caption className="visually-hidden">{caption}</caption> : null}
          <thead className={styles.thead}>
            <tr className={styles.headerRow}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={columnHeaderClass(col)}
                  aria-sort={headerSortState(col)}
                >
                  {renderHeader(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={styles.tbody}>{renderBody()}</tbody>
        </Table>
      </section>

      {totalItems !== undefined && totalItems > 0 && (
        <div className={`d-flex align-items-stretch ${styles.pagination}`}>
          <div className="d-flex align-items-center gap-2 px-4 py-3 border-end">
            <span>{t.itemsPerPage}</span>
            {onPageSizeChange ? (
              <Select
                aria-label={t.itemsPerPageAria}
                data-testid="datatable-page-size-select"
                size="small"
                value={effectivePageSize}
                onChange={(key) => onPageSizeChange(Number(key))}
                items={pageSizeOptions.map((opt) => ({ id: opt, label: String(opt) }))}
              />
            ) : (
              <span className="fw-medium">{effectivePageSize}</span>
            )}
          </div>

          <div className="d-flex align-items-center px-4 py-3 text-muted">
            {/* The range describes the rows last delivered. An error replaces them, so stating it
                would contradict the body; the controls stay live because they are the way back. */}
            {error
              ? null
              : `${Math.min((effectivePage - 1) * effectivePageSize + 1, totalItems)} - ${Math.min(
                  effectivePage * effectivePageSize,
                  totalItems,
                )} ${t.of} ${totalItems} ${finalItemName}`}
          </div>

          <div className="d-flex align-items-stretch ms-auto border-start">
            <div className="d-flex align-items-center gap-2 px-4 py-3 border-end">
              {totalPages <= 1 && <span>{effectivePage}</span>}
              {onPageChange && totalPages > 1 && (
                <Select
                  aria-label={t.pageAria}
                  data-testid="datatable-page-select-select"
                  size="small"
                  value={effectivePage}
                  onChange={(key) => onPageChange(Number(key))}
                  items={Array.from({ length: totalPages }, (_, i) => ({
                    id: i + 1,
                    label: String(i + 1),
                  }))}
                />
              )}
              <span>{t.pageOf.replace('{totalPages}', String(totalPages))}</span>
            </div>

            <div className="d-flex align-items-stretch">
              <div className="d-flex align-items-center px-3 py-3 border-end">
                <Button
                  variant="tertiary"
                  size="small"
                  isIconButton
                  onPress={() => onPageChange?.(effectivePage - 1)}
                  data-testid="datatable-prev-page-button"
                  aria-label={t.previousPage}
                  isDisabled={effectivePage === 1}
                >
                  <FaChevronLeft />
                </Button>
              </div>
              <div className="d-flex align-items-center px-3 py-3">
                <Button
                  variant="tertiary"
                  size="small"
                  isIconButton
                  onPress={() => onPageChange?.(effectivePage + 1)}
                  data-testid="datatable-next-page-button"
                  aria-label={t.nextPage}
                  isDisabled={effectivePage >= totalPages}
                >
                  <FaChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
