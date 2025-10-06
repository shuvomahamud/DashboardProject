"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Badge, Button, Form, Spinner, Alert, InputGroup } from "react-bootstrap";
import DataTable from '@/components/DataTable';

type ApplicationRow = {
  id: number;
  jobId: number;
  resumeId: number;
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  aiMatch: number | null;
  aiCompany: number | null;
  aiFake: number | null;
  updatedAt: string;
  appliedDate: string;
  // Additional resume fields
  skills?: string;
  experience?: number | null;
  createdAt?: string;
};

type ApiResp = {
  applications: ApplicationRow[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  query: string;
};

interface ApplicationsTableProps {
  jobId: number;
}

export default function ApplicationsTable({ jobId }: ApplicationsTableProps) {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [updating, setUpdating] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [sortField, setSortField] = useState<string>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Search/Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [minMatchScore, setMinMatchScore] = useState('');
  const [maxFakeScore, setMaxFakeScore] = useState('');
  const [showFilters, setShowFilters] = useState(false);


  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      // Add search/filter params
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (minMatchScore) params.append('minMatch', minMatchScore);
      if (maxFakeScore) params.append('maxFake', maxFakeScore);
      if (sortField) params.append('sortField', sortField);
      if (sortDirection) params.append('sortDirection', sortDirection);

      const res = await fetch(`/api/jobs/${jobId}/applications?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to load applications');
      }

      const data: ApiResp = await res.json();
      setRows(data.applications || []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [jobId, page, pageSize, searchTerm, statusFilter, minMatchScore, maxFakeScore, sortField, sortDirection]);

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setMinMatchScore('');
    setMaxFakeScore('');
    setPage(1);
  };

  const updateStatus = useCallback(async (resumeId: number, status: string) => {
    setUpdating(resumeId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/applications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, status }),
      });
      
      if (res.ok) {
        // Optimistic update
        setRows((prev) =>
          prev.map((r) => (r.resumeId === resumeId ? { ...r, status } : r))
        );
      } else {
        throw new Error('Failed to update status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  }, [jobId]);

  const unlink = useCallback(async (resumeId: number) => {
    if (!confirm("Unlink this application? This cannot be undone.")) return;

    setUpdating(resumeId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/applications`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId }),
      });

      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.resumeId !== resumeId));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        throw new Error('Failed to unlink application');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink application');
    } finally {
      setUpdating(null);
    }
  }, [jobId]);

  const deleteAllApplications = async () => {
    if (!confirm(
      `Are you sure you want to delete ALL ${total} applications and their resumes for this job?\n\nThis action CANNOT be undone!`
    )) {
      return;
    }

    // Second confirmation for safety
    if (!confirm(
      "⚠️ FINAL CONFIRMATION ⚠️\n\nThis will permanently delete all applications and resume files. Are you absolutely sure?"
    )) {
      return;
    }

    setDeletingAll(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/applications/delete-all`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete all applications');
      }

      const result = await res.json();

      // Clear the table
      setRows([]);
      setTotal(0);
      setPage(1);

      // Show success message
      alert(`✅ Successfully deleted ${result.deletedApplications} applications and ${result.deletedResumes} resumes`);

      // Reload the data
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete all applications');
    } finally {
      setDeletingAll(false);
    }
  };

  const columns = useMemo(() => [
    {
      id: 'candidate',
      name: 'Candidate',
      selector: (row: ApplicationRow) => row.candidateName || 'Unknown',
      sortable: true,
      sortField: 'candidateName',
      cell: (row: ApplicationRow) => (
        <div>
          <strong>{row.candidateName || 'Unknown'}</strong>
          {row.email && (
            <>
              <br />
              <small className="text-muted">{row.email}</small>
            </>
          )}
          {row.phone && (
            <>
              <br />
              <small className="text-muted">{row.phone}</small>
            </>
          )}
        </div>
      ),
      minWidth: '250px',
      maxWidth: '350px',
      grow: 1
    },
    {
      id: 'status',
      name: 'Status',
      selector: (row: ApplicationRow) => row.status,
      sortable: true,
      sortField: 'status',
      cell: (row: ApplicationRow) => (
        <div className="d-flex align-items-center gap-2">
          <Form.Select
            size="sm"
            value={row.status}
            onChange={(e) => updateStatus(row.resumeId, e.target.value)}
            disabled={updating === row.resumeId}
            style={{ width: '140px' }}
          >
            <option value="new">New</option>
            <option value="submitted">Submitted</option>
            <option value="reviewed">Reviewed</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="rejected">Rejected</option>
            <option value="hired">Hired</option>
          </Form.Select>
          {updating === row.resumeId && (
            <Spinner size="sm" animation="border" />
          )}
        </div>
      ),
      width: '180px'
    },
    {
      id: 'notes',
      name: 'Notes',
      selector: (row: ApplicationRow) => row.notes || '',
      sortable: true,
      sortField: 'notes',
      cell: (row: ApplicationRow) => (
        <div style={{ maxWidth: '200px', wordWrap: 'break-word' }}>
          {row.notes || '-'}
        </div>
      ),
      width: '200px'
    },
    {
      id: 'matchScore',
      name: 'Match Score',
      selector: (row: ApplicationRow) => row.aiMatch ?? 0,
      sortable: true,
      sortField: 'matchScore',
      cell: (row: ApplicationRow) => row.aiMatch != null ? Number(row.aiMatch).toFixed(0) : '-',
      width: '120px'
    },
    {
      id: 'companyScore',
      name: 'Company Score',
      selector: (row: ApplicationRow) => row.aiCompany ?? 0,
      sortable: true,
      sortField: 'aiCompanyScore',
      cell: (row: ApplicationRow) => row.aiCompany != null ? Number(row.aiCompany).toFixed(0) : '-',
      width: '130px'
    },
    {
      id: 'fakeScore',
      name: 'Fake Score',
      selector: (row: ApplicationRow) => row.aiFake ?? 0,
      sortable: true,
      sortField: 'fakeScore',
      cell: (row: ApplicationRow) => row.aiFake != null ? Number(row.aiFake).toFixed(0) : '-',
      width: '110px'
    },
    {
      id: 'skills',
      name: 'Skills',
      selector: (row: ApplicationRow) => row.skills || '',
      sortable: true,
      sortField: 'skills',
      cell: (row: ApplicationRow) => (
        <div style={{ wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
          {row.skills || '-'}
        </div>
      ),
      minWidth: '200px',
      maxWidth: '400px',
      grow: 2
    },
    {
      id: 'experience',
      name: 'Experience',
      selector: (row: ApplicationRow) => row.experience ?? '',
      sortable: true,
      sortField: 'experience',
      cell: (row: ApplicationRow) => (
        <div style={{ wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
          {row.experience != null ? row.experience : '-'}
        </div>
      ),
      minWidth: '200px',
      maxWidth: '400px',
      grow: 2
    },
    {
      id: 'appliedDate',
      name: 'Applied Date',
      selector: (row: ApplicationRow) => row.appliedDate,
      sortable: true,
      sortField: 'appliedDate',
      cell: (row: ApplicationRow) => new Date(row.appliedDate).toLocaleDateString(),
      width: '120px'
    },
    {
      id: 'updatedAt',
      name: 'Updated At',
      selector: (row: ApplicationRow) => row.updatedAt,
      sortable: true,
      sortField: 'updatedAt',
      cell: (row: ApplicationRow) => (
        <div>
          {new Date(row.updatedAt).toLocaleDateString()}
          <br />
          <small className="text-muted">
            {new Date(row.updatedAt).toLocaleTimeString()}
          </small>
        </div>
      ),
      width: '140px'
    },
    {
      id: 'createdAt',
      name: 'Created At',
      selector: (row: ApplicationRow) => row.createdAt || '',
      sortable: true,
      sortField: 'createdAt',
      cell: (row: ApplicationRow) => (
        <div>
          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '-'}
          {row.createdAt && (
            <>
              <br />
              <small className="text-muted">
                {new Date(row.createdAt).toLocaleTimeString()}
              </small>
            </>
          )}
        </div>
      ),
      width: '140px'
    },
    {
      id: 'actions',
      name: 'Actions',
      cell: (row: ApplicationRow) => (
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => unlink(row.resumeId)}
          disabled={updating === row.resumeId}
          title="Unlink Application"
        >
          <i className="bi bi-trash"></i>
        </Button>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: '80px'
    }
  ], [updateStatus, unlink, updating]);

  const sortedColumn = useMemo(
    () => columns.find((col: any) => col.sortField === sortField),
    [columns, sortField]
  );

  const handleSort = useCallback(
    (column: any, direction: 'asc' | 'desc') => {
      if (!column?.sortField) {
        return;
      }
      setSortField(column.sortField);
      setSortDirection(direction);
      setPage(1);
    },
    []
  );

  if (error) {
    return (
      <Alert variant="danger" dismissible onClose={() => setError(null)}>
        {error}
      </Alert>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <div className="text-center py-4">
        <Spinner animation="border" />
        <p className="mt-2">Loading applications...</p>
      </div>
    );
  }


  const activeFiltersCount = [
    searchTerm,
    statusFilter !== 'all' ? statusFilter : null,
    minMatchScore,
    maxFakeScore
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Search and Filter Section */}
      <div className="p-3 bg-light border rounded">
        <div className="d-flex gap-2 mb-3">
          {/* Search Bar */}
          <InputGroup style={{ flex: 1 }}>
            <InputGroup.Text>
              <i className="bi bi-search"></i>
            </InputGroup.Text>
            <Form.Control
              type="text"
              placeholder="Search by name, email, phone, skills, or experience..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
            />
            {searchTerm && (
              <Button
                variant="outline-secondary"
                onClick={() => {
                  setSearchTerm('');
                  setPage(1);
                }}
              >
                <i className="bi bi-x"></i>
              </Button>
            )}
          </InputGroup>

          {/* Toggle Filters Button */}
          <Button
            variant={showFilters ? 'primary' : 'outline-primary'}
            onClick={() => setShowFilters(!showFilters)}
            className="d-flex align-items-center gap-2"
          >
            <i className="bi bi-funnel"></i>
            Filters
            {activeFiltersCount > 0 && (
              <Badge bg="light" text="dark">{activeFiltersCount}</Badge>
            )}
          </Button>

          {/* Clear All Button */}
          {activeFiltersCount > 0 && (
            <Button
              variant="outline-secondary"
              onClick={clearFilters}
              title="Clear all filters"
            >
              <i className="bi bi-x-circle"></i>
            </Button>
          )}
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="row g-3 pt-3 border-top">
            <div className="col-md-3">
              <Form.Label className="small fw-bold">Status</Form.Label>
              <Form.Select
                size="sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="submitted">Submitted</option>
                <option value="reviewed">Reviewed</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="rejected">Rejected</option>
                <option value="hired">Hired</option>
              </Form.Select>
            </div>

            <div className="col-md-3">
              <Form.Label className="small fw-bold">Min Match Score</Form.Label>
              <Form.Control
                type="number"
                size="sm"
                min="0"
                max="100"
                placeholder="e.g., 70"
                value={minMatchScore}
                onChange={(e) => {
                  setMinMatchScore(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="col-md-3">
              <Form.Label className="small fw-bold">Max Fake Score</Form.Label>
              <Form.Control
                type="number"
                size="sm"
                min="0"
                max="100"
                placeholder="e.g., 30"
                value={maxFakeScore}
                onChange={(e) => {
                  setMaxFakeScore(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="col-md-3 d-flex align-items-end">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={clearFilters}
                className="w-100"
              >
                <i className="bi bi-arrow-counterclockwise me-1"></i>
                Reset Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Results Count and Delete All Button */}
      {total > 0 && (
        <div className="p-3 bg-light border-bottom">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <strong>{total}</strong> application{total !== 1 ? 's' : ''} found
              {activeFiltersCount > 0 && (
                <span className="text-muted ms-2">
                  ({activeFiltersCount} filter{activeFiltersCount !== 1 ? 's' : ''} active)
                </span>
              )}
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={deleteAllApplications}
              disabled={deletingAll || loading}
              className="d-flex align-items-center gap-2"
            >
              {deletingAll ? (
                <>
                  <Spinner size="sm" animation="border" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <i className="bi bi-trash3"></i>
                  <span>Delete All Applications</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Table or Empty state */}
      {rows.length === 0 ? (
        <div className="text-center py-4">
          <i className="bi bi-inbox display-4 text-muted"></i>
          <p className="mt-2 text-muted">
            No applications yet
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          pagination={true}
          paginationPerPage={pageSize}
          paginationServer={true}
          paginationTotalRows={total}
          sortServer={true}
          onSort={handleSort}
          sortDirection={sortDirection}
          sortColumn={sortedColumn}
          onChangePage={(page: number) => setPage(page)}
          onChangeRowsPerPage={(currentRowsPerPage: number, currentPage: number) => {
            setPageSize(currentRowsPerPage);
            setPage(1); // Reset to first page when changing page size
          }}
        />
      )}
    </div>
  );
}
