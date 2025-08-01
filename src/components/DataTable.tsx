"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Form, InputGroup } from 'react-bootstrap';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredData, setFilteredData] = useState(data);

  // Function to recursively search through all object properties
  const searchInObject = (obj: any, searchTerm: string): boolean => {
    if (!obj || typeof obj !== 'object') {
      return String(obj).toLowerCase().includes(searchTerm.toLowerCase());
    }

    // Skip the Actions column and other non-searchable fields
    const skipKeys = ['actions'];
    
    return Object.keys(obj).some(key => {
      if (skipKeys.includes(key.toLowerCase())) {
        return false;
      }
      
      const value = obj[key];
      
      // Handle different data types
      if (value === null || value === undefined) {
        return false;
      } else if (typeof value === 'string') {
        return value.toLowerCase().includes(searchTerm.toLowerCase());
      } else if (typeof value === 'number') {
        return String(value).includes(searchTerm);
      } else if (typeof value === 'boolean') {
        return String(value).toLowerCase().includes(searchTerm.toLowerCase());
      } else if (value instanceof Date) {
        return value.toISOString().toLowerCase().includes(searchTerm.toLowerCase());
      } else if (typeof value === 'object') {
        return searchInObject(value, searchTerm);
      }
      
      return false;
    });
  };

  // Filter data based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredData(data);
    } else {
      const filtered = data.filter(item => searchInObject(item, searchTerm));
      setFilteredData(filtered);
    }
  }, [searchTerm, data]);

  // Update filtered data when original data changes
  useEffect(() => {
    setFilteredData(data);
  }, [data]);

  // Clear search when component unmounts
  useEffect(() => {
    return () => {
      setSearchTerm('');
    };
  }, []);

  const SearchComponent = useMemo(() => {
    return (
      <div className="mb-3">
        <InputGroup style={{ maxWidth: '300px' }}>
          <InputGroup.Text>
            <i className="bi bi-search"></i>
          </InputGroup.Text>
          <Form.Control
            type="text"
            placeholder="Search across all fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <InputGroup.Text 
              role="button" 
              onClick={() => setSearchTerm('')}
              style={{ cursor: 'pointer' }}
              title="Clear search"
            >
              <i className="bi bi-x-circle"></i>
            </InputGroup.Text>
          )}
        </InputGroup>
        {searchTerm && (
          <small className="text-muted">
            Found {filteredData.length} result{filteredData.length !== 1 ? 's' : ''} 
            {searchTerm && ` for "${searchTerm}"`}
          </small>
        )}
      </div>
    );
  }, [searchTerm, filteredData.length]);

  return (
    <div className="table-responsive">
      {SearchComponent}
      <DataTable
        columns={columns}
        data={filteredData}
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
        noDataComponent={
          <div className="text-center py-4">
            {searchTerm ? (
              <div>
                <p>No results found for "{searchTerm}"</p>
                <small className="text-muted">Try adjusting your search terms</small>
              </div>
            ) : (
              <p>No data available</p>
            )}
          </div>
        }
      />
    </div>
  );
};

export default AppDataTable; 