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
  score: number | null;
  notes: string | null;
  aiMatch: number | null;
  aiCompany: number | null;
  aiFake: number | null;
  updatedAt: string;
  appliedDate: string;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to first page when searching
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      
      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      }
      
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
  }, [jobId, page, pageSize, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (resumeId: number, status: string) => {
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
  };

  const unlink = async (resumeId: number) => {
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
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'new':
      case 'submitted':
        return 'primary';
      case 'reviewed':
        return 'info';
      case 'shortlisted':
        return 'success';
      case 'rejected':
        return 'danger';
      case 'hired':
        return 'success';
      default:
        return 'secondary';
    }
  };

  const columns = [
    {
      name: 'Candidate',
      selector: (row: ApplicationRow) => row.candidateName || 'Unknown',
      sortable: true,
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
      width: '250px'
    },
    {
      name: 'Status',
      selector: (row: ApplicationRow) => row.status,
      sortable: true,
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
      name: 'Score',
      selector: (row: ApplicationRow) => row.score || 0,
      sortable: true,
      cell: (row: ApplicationRow) => row.score ? `${row.score}/100` : '—',
      width: '80px'
    },
    {
      name: 'AI Match',
      selector: (row: ApplicationRow) => row.aiMatch || 0,
      sortable: true,
      cell: (row: ApplicationRow) => row.aiMatch != null ? Number(row.aiMatch).toFixed(0) : '—',
      width: '90px'
    },
    {
      name: 'AI Company',
      selector: (row: ApplicationRow) => row.aiCompany || 0,
      sortable: true,
      cell: (row: ApplicationRow) => row.aiCompany != null ? Number(row.aiCompany).toFixed(0) : '—',
      width: '100px'
    },
    {
      name: 'AI Fake',
      selector: (row: ApplicationRow) => row.aiFake || 0,
      sortable: true,
      cell: (row: ApplicationRow) => row.aiFake != null ? Number(row.aiFake).toFixed(0) : '—',
      width: '80px'
    },
    {
      name: 'Applied',
      selector: (row: ApplicationRow) => new Date(row.appliedDate).toLocaleDateString(),
      sortable: true,
      cell: (row: ApplicationRow) => new Date(row.appliedDate).toLocaleDateString(),
      width: '100px'
    },
    {
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
  ];

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

  const clearSearch = () => {
    setSearchQuery("");
  };

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div className="mb-3">
        <InputGroup style={{ maxWidth: '400px' }}>
          <InputGroup.Text>
            <i className="bi bi-search"></i>
          </InputGroup.Text>
          <Form.Control
            type="text"
            placeholder="Search candidates, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <InputGroup.Text 
              role="button" 
              onClick={clearSearch}
              style={{ cursor: 'pointer' }}
              title="Clear search"
            >
              <i className="bi bi-x-circle"></i>
            </InputGroup.Text>
          )}
        </InputGroup>
        {debouncedSearch && (
          <small className="text-muted">
            {loading ? 'Searching...' : `Found ${total} result${total !== 1 ? 's' : ''} for "${debouncedSearch}"`}
          </small>
        )}
      </div>

      {/* Table or Empty state */}
      {rows.length === 0 ? (
        <div className="text-center py-4">
          <i className="bi bi-inbox display-4 text-muted"></i>
          <p className="mt-2 text-muted">
            {debouncedSearch ? `No applications found for "${debouncedSearch}"` : 'No applications yet'}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          pagination={true}
          paginationPerPage={pageSize}
        />
      )}
    </div>
  );
}