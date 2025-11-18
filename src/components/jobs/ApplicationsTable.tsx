"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Badge, Button, Form, Spinner, Alert, InputGroup, Modal } from "react-bootstrap";
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
  matchScore: number | null;
  aiCompany: number | null;
  aiFake: number | null;
  updatedAt: string;
  appliedDate: string;
  // Additional resume fields
  skills?: string;
  experience?: number | null;
  createdAt?: string;
  originalName?: string | null;
  sourceFrom?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  locationDisplay?: string | null;
};

type LocationStateOption = {
  code: string;
  name: string;
  cities: string[];
};

type ApiResp = {
  applications: ApplicationRow[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  query: string;
  filters?: {
    search?: string | null;
    status?: string | null;
    minMatch?: number | null;
    maxFake?: number | null;
    state?: string | null;
    city?: string | null;
    locationOptions?: { states: LocationStateOption[] };
  };
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
  const [sortField, setSortField] = useState<string>('matchScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Search/Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [minMatchScore, setMinMatchScore] = useState('');
  const [maxFakeScore, setMaxFakeScore] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [stateOptions, setStateOptions] = useState<LocationStateOption[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [previewModal, setPreviewModal] = useState<{
    resumeId: number | null;
    url: string | null;
    loading: boolean;
    error: string | null;
    fileName: string | null;
  }>({
    resumeId: null,
    url: null,
    loading: false,
    error: null,
    fileName: null
  });


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
      if (stateFilter) {
        params.append('state', stateFilter);
        if (cityFilter) params.append('city', cityFilter);
      }

      const res = await fetch(`/api/jobs/${jobId}/applications?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to load applications');
      }

      const data: ApiResp = await res.json();
      setRows(data.applications || []);
      setTotal(data.pagination?.total || 0);
      setStateOptions(data.filters?.locationOptions?.states || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [jobId, page, pageSize, searchTerm, statusFilter, minMatchScore, maxFakeScore, sortField, sortDirection, stateFilter, cityFilter]);

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
    setStateFilter('');
    setCityFilter('');
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

  const fetchResumeFile = useCallback(async (resumeId: number) => {
    const response = await fetch(`/api/resumes/${resumeId}/file`);
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // Ignore JSON parse failure; will throw below
    }
    if (!response.ok || !data?.url) {
      throw new Error(data?.error || 'Failed to load resume file');
    }
    return data as { url: string; fileName?: string | null };
  }, []);

  const handleOpenPreview = useCallback(async (resumeId: number) => {
    setPreviewModal({
      resumeId,
      url: null,
      loading: true,
      error: null,
      fileName: null
    });
    try {
      const fileData = await fetchResumeFile(resumeId);
      setPreviewModal({
        resumeId,
        url: fileData.url,
        loading: false,
        error: null,
        fileName: fileData.fileName || null
      });
    } catch (err) {
      setPreviewModal({
        resumeId,
        url: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load resume file',
        fileName: null
      });
    }
  }, [fetchResumeFile]);

  const handleClosePreview = useCallback(() => {
    setPreviewModal({
      resumeId: null,
      url: null,
      loading: false,
      error: null,
      fileName: null
    });
  }, []);

  const handleDownloadResume = useCallback(async (resumeId: number) => {
    try {
      const fileData = await fetchResumeFile(resumeId);
      if (typeof window !== 'undefined') {
        window.open(fileData.url, '_blank', 'noopener');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download resume');
    }
  }, [fetchResumeFile]);

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
          <Link
            href={`/resumes/${row.resumeId}`}
            className="fw-semibold text-decoration-none"
          >
            {row.candidateName || 'Unknown'}
          </Link>
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
          {row.originalName && (
            <>
              <br />
              <small className="text-muted">Resume: {row.originalName}</small>
            </>
          )}
        </div>
      ),
      minWidth: '250px',
      maxWidth: '350px',
      grow: 1
    },
    {
      id: 'location',
      name: 'Location',
      selector: (row: ApplicationRow) => row.locationDisplay || '',
      sortable: true,
      sortField: 'location',
      cell: (row: ApplicationRow) => (
        <div style={{ maxWidth: '200px' }}>
          {row.locationDisplay || <span className="text-muted">-</span>}
        </div>
      ),
      width: '200px'
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
            <option value="communicated">Communicated</option>
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
      id: 'matchScore',
      name: 'Match Score',
      selector: (row: ApplicationRow) => row.matchScore ?? 0,
      sortable: true,
      sortField: 'matchScore',
      cell: (row: ApplicationRow) => row.matchScore != null ? Number(row.matchScore).toFixed(0) : '-',
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
      id: 'resumeFile',
      name: 'Resume',
      cell: (row: ApplicationRow) => (
        <div className="d-flex flex-column gap-2">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => handleOpenPreview(row.resumeId)}
          >
            View
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => handleDownloadResume(row.resumeId)}
          >
            Download
          </Button>
        </div>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: '160px'
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
  ], [updateStatus, unlink, updating, handleOpenPreview, handleDownloadResume]);

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


  const cityOptions = useMemo(() => {
    if (!stateFilter) return [];
    const selected = stateOptions.find((state) => state.code === stateFilter);
    return selected ? selected.cities : [];
  }, [stateOptions, stateFilter]);

  const activeFiltersCount = [
    searchTerm,
    statusFilter !== 'all' ? statusFilter : null,
    minMatchScore,
    maxFakeScore,
    stateFilter || null,
    stateFilter && cityFilter ? cityFilter : null
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
                <option value="communicated">Communicated</option>
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

            <div className="col-md-3">
              <Form.Label className="small fw-bold">State</Form.Label>
              <Form.Select
                size="sm"
                value={stateFilter}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  setStateFilter(value);
                  setCityFilter('');
                  setPage(1);
                }}
              >
                <option value="">All States</option>
                {stateOptions.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.code} - {state.name}
                  </option>
                ))}
              </Form.Select>
            </div>

            <div className="col-md-3">
              <Form.Label className="small fw-bold">City</Form.Label>
              <Form.Select
                size="sm"
                value={cityFilter}
                disabled={!stateFilter || cityOptions.length === 0}
                onChange={(e) => {
                  setCityFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Cities</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </Form.Select>
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

      <Modal
        size="xl"
        show={previewModal.resumeId !== null}
        onHide={handleClosePreview}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Resume Preview
            {previewModal.fileName ? ` — ${previewModal.fileName}` : ''}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ minHeight: '60vh' }}>
          {previewModal.loading && (
            <div className="d-flex flex-column align-items-center justify-content-center py-5">
              <Spinner animation="border" />
              <p className="mt-3 mb-0 text-muted">Loading resume...</p>
            </div>
          )}
          {!previewModal.loading && previewModal.error && (
            <Alert variant="danger" className="mb-0">
              {previewModal.error}
            </Alert>
          )}
          {!previewModal.loading && !previewModal.error && previewModal.url && (
            <iframe
              src={previewModal.url}
              title="Resume preview"
              style={{ width: '100%', height: '70vh', border: 'none' }}
            />
          )}
          {!previewModal.loading && !previewModal.error && !previewModal.url && (
            <p className="text-muted mb-0">Resume preview not available.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          {previewModal.resumeId && (
            <Button
              variant="primary"
              onClick={() => handleDownloadResume(previewModal.resumeId!)}
            >
              Download
            </Button>
          )}
          <Button variant="secondary" onClick={handleClosePreview}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
