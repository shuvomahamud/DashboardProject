"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Alert, Badge, Form, InputGroup } from 'react-bootstrap';
import DataTable from '@/components/DataTable';
import ImportQueueStatus from '@/components/jobs/ImportQueueStatus';

interface Job {
  id: number;
  title: string;
  description: string;
  status: string;
  location: string;
  isRemote: boolean;
  employmentType: string;
  postedDate: string;
  createdAt: string;
  updatedAt: string;
  companyName: string;
  _count: {
    applications: number;
  };
}

interface JobsResponse {
  jobs: Job[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalJobs, setTotalJobs] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize)
      });

      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }

      const response = await fetch(`/api/jobs?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }

      const data: JobsResponse = await response.json();
      setJobs(data.jobs || []);
      setTotalJobs(data.pagination?.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleDelete = useCallback(async (jobId: number) => {
    if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete job');
      }

      await fetchJobs();
      console.log('Job deleted successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  }, [fetchJobs]);

  const handleEdit = useCallback((jobId: number) => {
    router.push(`/jobs/${jobId}/edit`);
  }, [router]);

  const handleView = useCallback((jobId: number) => {
    router.push(`/jobs/${jobId}`);
  }, [router]);

  const columns = useMemo(() => [
    {
      name: 'ID',
      selector: (row: Job) => row.id,
      sortable: true,
      width: '60px'
    },
    {
      name: 'Title',
      selector: (row: Job) => row.title,
      sortable: true,
      cell: (row: Job) => (
        <div>
          <strong 
            className="text-primary" 
            style={{ cursor: 'pointer' }}
            onClick={() => handleView(row.id)}
          >
            {row.title}
          </strong>
        </div>
      ),
      width: '200px'
    },
    {
      name: 'Company',
      selector: (row: Job) => row.companyName || 'N/A',
      sortable: true,
      width: '150px'
    },
    {
      name: 'Status',
      selector: (row: Job) => row.status,
      sortable: true,
      cell: (row: Job) => (
        <Badge bg={
          row.status === 'active' ? 'success' :
          row.status === 'draft' ? 'secondary' :
          row.status === 'closed' ? 'danger' : 'warning'
        }>
          {row.status}
        </Badge>
      ),
      width: '100px'
    },
    {
      name: 'Location',
      selector: (row: Job) => row.isRemote ? 'Remote' : (row.location || 'Not specified'),
      sortable: true,
      width: '150px'
    },
    {
      name: 'Type',
      selector: (row: Job) => row.employmentType || 'Not specified',
      sortable: true,
      width: '120px'
    },
    {
      name: 'Applications',
      selector: (row: Job) => row._count?.applications || 0,
      sortable: true,
      center: true,
      width: '100px'
    },
    {
      name: 'Posted',
      selector: (row: Job) => new Date(row.postedDate || row.createdAt).toLocaleDateString(),
      sortable: true,
      width: '100px'
    },
    {
      name: 'Actions',
      cell: (row: Job) => (
        <div className="d-flex gap-2">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => handleView(row.id)}
            title="View Details"
          >
            <i className="bi bi-eye"></i>
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => handleEdit(row.id)}
            title="Edit Job"
          >
            <i className="bi bi-pencil"></i>
          </Button>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => handleDelete(row.id)}
            title="Delete Job"
          >
            <i className="bi bi-trash"></i>
          </Button>
        </div>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: '140px'
    }
  ], [handleView, handleEdit, handleDelete]);

  const pageSummary = useMemo(() => {
    if (totalJobs === 0 || jobs.length === 0) {
      return loading ? 'Loading…' : 'No jobs to display';
    }
    const start = (page - 1) * pageSize + 1;
    const end = start + jobs.length - 1;
    return `Showing ${start}-${Math.min(end, totalJobs)} of ${totalJobs}`;
  }, [jobs.length, page, pageSize, totalJobs, loading]);

  if (error) {
    return (
      <div className="container mt-4">
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
          <Button variant="outline-danger" onClick={fetchJobs}>
            Try Again
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container-fluid mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 mb-1">Jobs</h1>
          <p className="text-muted mb-0">
            Manage job postings and track applications
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => router.push('/jobs/new')}
          className="d-flex align-items-center gap-2"
        >
          <i className="bi bi-plus-circle"></i>
          Add New Job
        </Button>
      </div>

      {/* Import Queue Status */}
      <ImportQueueStatus />

      {jobs.length === 0 && !loading ? (
        <div className="text-center py-5">
          <div className="mb-4">
            <i className="bi bi-briefcase display-1 text-muted"></i>
          </div>
          <h4>No Jobs Found</h4>
          <p className="text-muted mb-4">
            Get started by creating your first job posting.
          </p>
          <Button
            variant="primary"
            onClick={() => router.push('/jobs/new')}
            className="d-flex align-items-center gap-2 mx-auto"
          >
            <i className="bi bi-plus-circle"></i>
            Create Your First Job
          </Button>
        </div>
      ) : (
        <>
          <div className="d-flex flex-wrap gap-3 align-items-center mb-3">
            <InputGroup style={{ maxWidth: '320px' }}>
              <InputGroup.Text>
                <i className="bi bi-search"></i>
              </InputGroup.Text>
              <Form.Control
                type="text"
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (page !== 1) {
                    setPage(1);
                  }
                }}
              />
              {searchTerm && (
                <InputGroup.Text
                  role="button"
                  onClick={() => {
                    setSearchTerm('');
                    if (page !== 1) {
                      setPage(1);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                  title="Clear search"
                >
                  <i className="bi bi-x-circle"></i>
                </InputGroup.Text>
              )}
            </InputGroup>
            <div className="ms-auto text-muted small">
              {pageSummary}
            </div>
          </div>
          <DataTable
            columns={columns}
            data={jobs}
            pagination={true}
            paginationServer={true}
            paginationPerPage={pageSize}
            paginationTotalRows={totalJobs}
            onChangeRowsPerPage={(rowsPerPage: number) => {
              setPageSize(rowsPerPage);
              setPage(1);
            }}
            onChangePage={(nextPage: number) => {
              setPage(nextPage);
            }}
            title={`${totalJobs} Job${totalJobs !== 1 ? 's' : ''}`}
          />
        </>
      )}
    </div>
  );
}
