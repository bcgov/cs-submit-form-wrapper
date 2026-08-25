'use client';

import React from 'react';
import { Table } from 'react-bootstrap';
import { Select, Button } from '@bcgov/design-system-react-components';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa6';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { useDictionary } from '@/app/[lang]/Providers';
import styles from './DataTable.module.css';

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  align?: 'start' | 'center' | 'end';
  render?: (item: T) => React.ReactNode;
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
  keyExtractor,
}: DataTableProps<T>) {
  const dict = useDictionary();
  const t = dict.dataTable;

  const finalEmptyMessage = emptyMessage === 'No items found.' ? t.emptyMessage : emptyMessage;
  const finalLoadingMessage = loadingMessage === 'Loading...' ? t.loadingMessage : loadingMessage;
  const finalItemName = itemName === 'items' ? t.itemName : itemName;

  const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 1;

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
    if (data.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length} className="text-center py-5 text-muted">
            {error ? `Error: ${error}` : finalEmptyMessage}
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
      <div className={styles.scroller} tabIndex={0} role="region" aria-label={caption}>
        <Table className={`mb-0 align-middle ${styles.table}`}>
          {caption ? <caption className="visually-hidden">{caption}</caption> : null}
          <thead className={styles.thead}>
            <tr className="bg-bcgov-light-blue">
              {columns.map((col) => (
                <th key={col.key} scope="col" className={columnHeaderClass(col)}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={styles.tbody}>{renderBody()}</tbody>
        </Table>
      </div>

      {!loading && data.length > 0 && totalItems !== undefined && (
        <div className={`d-flex align-items-stretch ${styles.pagination}`}>
          <div className="d-flex align-items-center gap-2 px-4 py-3 border-end">
            <span>{t.itemsPerPage}</span>
            {onPageSizeChange ? (
              <Select
                aria-label={t.itemsPerPageAria}
                data-testid="datatable-page-size-select"
                size="small"
                selectedKey={pageSize}
                onSelectionChange={(key) => onPageSizeChange(Number(key))}
                items={pageSizeOptions.map((opt) => ({ id: opt, label: String(opt) }))}
              />
            ) : (
              <span className="fw-medium">{pageSize}</span>
            )}
          </div>

          <div className="d-flex align-items-center px-4 py-3 text-muted">
            {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)}{' '}
            {t.of} {totalItems} {finalItemName}
          </div>

          <div className="d-flex align-items-stretch ms-auto border-start">
            <div className="d-flex align-items-center gap-2 px-4 py-3 border-end">
              {totalPages <= 1 && <span>{currentPage}</span>}
              {onPageChange && totalPages > 1 && (
                <Select
                  aria-label={t.pageAria}
                  data-testid="datatable-page-select-select"
                  size="small"
                  value={currentPage}
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
                  onPress={() => onPageChange && onPageChange(currentPage - 1)}
                  data-testid="datatable-prev-page-button"
                  aria-label={t.previousPage}
                  isDisabled={currentPage === 1}
                >
                  <FaChevronLeft />
                </Button>
              </div>
              <div className="d-flex align-items-center px-3 py-3">
                <Button
                  variant="tertiary"
                  size="small"
                  isIconButton
                  onPress={() => onPageChange && onPageChange(currentPage + 1)}
                  data-testid="datatable-next-page-button"
                  aria-label={t.nextPage}
                  isDisabled={currentPage === totalPages}
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
