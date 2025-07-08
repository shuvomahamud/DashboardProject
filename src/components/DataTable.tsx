"use client";

import React from 'react';
import DataTable from 'react-data-table-component';

interface DataTableProps {
  columns: any[];
  data: any[];
  pagination?: boolean;
  paginationPerPage?: number;
  title?: string;
  actions?: React.ReactNode;
  selectableRows?: boolean;
  onSelectedRowsChange?: (selected: any) => void;
}

const customStyles = {
  table: {
    style: {
      backgroundColor: 'transparent',
    },
  },
  headRow: {
    style: {
      backgroundColor: '#f8f9fa',
      borderTop: '1px solid #dee2e6',
    },
  },
  headCells: {
    style: {
      fontSize: '14px',
      fontWeight: '600',
    },
  },
  cells: {
    style: {
      fontSize: '14px',
    },
  },
};

const AppDataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  pagination = true,
  paginationPerPage = 10,
  title,
  actions,
  selectableRows = false,
  onSelectedRowsChange
}) => {
  return (
    <div className="table-responsive">
      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        paginationPerPage={paginationPerPage}
        title={title}
        actions={actions}
        selectableRows={selectableRows}
        onSelectedRowsChange={onSelectedRowsChange}
        customStyles={customStyles}
        highlightOnHover
        responsive
        striped
      />
    </div>
  );
};

export default AppDataTable; 