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
  experience?: string;
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


  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      
      
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
  }, [jobId, page, pageSize]);

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
      minWidth: '250px',
      maxWidth: '350px',
      grow: 1
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
      name: 'Notes',
      selector: (row: ApplicationRow) => row.notes || '',
      sortable: true,
      cell: (row: ApplicationRow) => (
        <div style={{ maxWidth: '200px', wordWrap: 'break-word' }}>
          {row.notes || '—'}
        </div>
      ),
      width: '200px'
    },
    {
      name: 'Match Score',
      selector: (row: ApplicationRow) => row.aiMatch || 0,
      sortable: true,
      cell: (row: ApplicationRow) => row.aiMatch != null ? Number(row.aiMatch).toFixed(0) : '—',
      width: '120px'
    },
    {
      name: 'Company Score',
      selector: (row: ApplicationRow) => row.aiCompany || 0,
      sortable: true,
      cell: (row: ApplicationRow) => row.aiCompany != null ? Number(row.aiCompany).toFixed(0) : '—',
      width: '130px'
    },
    {
      name: 'Fake Score',
      selector: (row: ApplicationRow) => row.aiFake || 0,
      sortable: true,
      cell: (row: ApplicationRow) => row.aiFake != null ? Number(row.aiFake).toFixed(0) : '—',
      width: '110px'
    },
    {
      name: 'Skills',
      selector: (row: ApplicationRow) => row.skills || '',
      sortable: true,
      cell: (row: ApplicationRow) => (
        <div style={{ wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
          {row.skills || '—'}
        </div>
      ),
      minWidth: '200px',
      maxWidth: '400px',
      grow: 2
    },
    {
      name: 'Experience',
      selector: (row: ApplicationRow) => row.experience || '',
      sortable: true,
      cell: (row: ApplicationRow) => (
        <div style={{ wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
          {row.experience || '—'}
        </div>
      ),
      minWidth: '200px',
      maxWidth: '400px',
      grow: 2
    },
    {
      name: 'Applied Date',
      selector: (row: ApplicationRow) => new Date(row.appliedDate).toLocaleDateString(),
      sortable: true,
      cell: (row: ApplicationRow) => new Date(row.appliedDate).toLocaleDateString(),
      width: '120px'
    },
    {
      name: 'Updated At',
      selector: (row: ApplicationRow) => new Date(row.updatedAt).toLocaleDateString(),
      sortable: true,
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
      name: 'Created At',
      selector: (row: ApplicationRow) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '',
      sortable: true,
      cell: (row: ApplicationRow) => (
        <div>
          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
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


  return (
    <div className="space-y-3">

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