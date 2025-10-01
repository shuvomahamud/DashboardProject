"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Alert, Badge } from 'react-bootstrap';
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

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/jobs');
      
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      
      const data: JobsResponse = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleDelete = async (jobId: number) => {
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

      // Remove the deleted job from the list
      setJobs(prevJobs => prevJobs.filter(job => job.id !== jobId));
      
      // Show success message (you can implement a toast notification here)
      console.log('Job deleted successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  const handleEdit = (jobId: number) => {
    router.push(`/jobs/${jobId}/edit`);
  };

  const handleView = (jobId: number) => {
    router.push(`/jobs/${jobId}`);
  };

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
  ], []);

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
        <DataTable
          columns={columns}
          data={jobs}
          pagination={true}
          paginationPerPage={10}
          title={`${jobs.length} Job${jobs.length !== 1 ? 's' : ''}`}
        />
      )}
    </div>
  );
}