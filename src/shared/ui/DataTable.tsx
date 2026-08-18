import type { ReactNode } from 'react';

export type DataTableColumn<Row> = {
  cell: (row: Row) => ReactNode;
  header: string;
  id: string;
};

/** A semantic table wrapper; sorting/selection stay feature-owned. */
export function DataTable<Row>({
  caption,
  columns,
  getRowId,
  rows,
}: {
  caption: string;
  columns: DataTableColumn<Row>[];
  getRowId: (row: Row) => string;
  rows: Row[];
}) {
  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowId(row)}>
              {columns.map((column) => (
                <td key={column.id}>{column.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
