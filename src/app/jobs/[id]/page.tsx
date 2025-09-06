"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, Row, Col, Badge, Button, Alert, Spinner } from 'react-bootstrap';
import DataTable from '@/components/DataTable';

interface Job {
  id: number;
  title: string;
  description: string;
  requirements: string;
  salaryMin: number;
  salaryMax: number;
  location: string;
  isRemote: boolean;
  employmentType: string;
  status: string;
  postedDate: string;
  expiryDate: string;
  companyId: number;
  applicationQuery: string;
  createdAt: string;
  updatedAt: string;
  companyName: string;
  applications: Array<{
    id: number;
    status: string;
    appliedDate: string;
    score: number;
    resume: {
      id: number;
      fileName: string;
      originalName: string;
      createdAt: string;
    };
  }>;
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId) {
      fetchJob();
    }
  }, [jobId]);

  const fetchJob = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/jobs/${jobId}`);
      
      if (!response.ok) {
        throw new Error('Job not found');
      }
      
      const jobData: Job = await response.json();
      setJob(jobData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  };

  const formatSalary = (min: number, max: number) => {
    if (!min && !max) return 'Not specified';
    // Values are stored in thousands, so multiply by 1000 for display
    const minSalary = min ? min * 1000 : 0;
    const maxSalary = max ? max * 1000 : 0;
    
    if (min && max) return `$${minSalary.toLocaleString()} - $${maxSalary.toLocaleString()}`;
    if (min) return `$${minSalary.toLocaleString()}+`;
    if (max) return `Up to $${maxSalary.toLocaleString()}`;
    return 'Not specified';
  };

  const applicationColumns = [
    {
      name: 'Resume',
      selector: (row: any) => row.resume.originalName,
      sortable: true,
      cell: (row: any) => (
        <div>
          <strong>{row.resume.originalName}</strong>
          <br />
          <small className="text-muted">{row.resume.fileName}</small>
        </div>
      ),
      width: '250px'
    },
    {
      name: 'Status',
      selector: (row: any) => row.status,
      sortable: true,
      cell: (row: any) => (
        <Badge bg={
          row.status === 'new' ? 'primary' :
          row.status === 'reviewed' ? 'info' :
          row.status === 'shortlisted' ? 'success' :
          row.status === 'rejected' ? 'danger' : 'secondary'
        }>
          {row.status}
        </Badge>
      ),
      width: '120px'
    },
    {
      name: 'Score',
      selector: (row: any) => row.score || 0,
      sortable: true,
      cell: (row: any) => row.score ? `${row.score}/100` : '-',
      width: '80px'
    },
    {
      name: 'Applied Date',
      selector: (row: any) => new Date(row.appliedDate).toLocaleDateString(),
      sortable: true,
      width: '120px'
    },
    {
      name: 'Actions',
      cell: (row: any) => (
        <div className="d-flex gap-2">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => router.push(`/resumes/${row.resume.id}`)}
            title="View Resume"
          >
            <i className="bi bi-eye"></i>
          </Button>
        </div>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: '80px'
    }
  ];

  if (loading) {
    return (
      <div className="container mt-4 text-center">
        <Spinner animation="border" />
        <p className="mt-2">Loading job details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
          <Button variant="outline-danger" onClick={() => router.push('/jobs')}>
            Back to Jobs
          </Button>
        </Alert>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container mt-4">
        <Alert variant="warning">
          <p>Job not found</p>
          <Button variant="outline-warning" onClick={() => router.push('/jobs')}>
            Back to Jobs
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 mb-1">{job.title}</h1>
          <p className="text-muted mb-0">{job.companyName}</p>
        </div>
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            onClick={() => router.push('/jobs')}
          >
            <i className="bi bi-arrow-left"></i> Back to Jobs
          </Button>
          <Button
            variant="outline-primary"
            onClick={() => router.push(`/jobs/${job.id}/edit`)}
          >
            <i className="bi bi-pencil"></i> Edit
          </Button>
        </div>
      </div>

      <Row>
        <Col lg={8}>
          <Card className="mb-4">
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Job Details</h5>
                <Badge bg={
                  job.status === 'active' ? 'success' :
                  job.status === 'draft' ? 'secondary' :
                  job.status === 'closed' ? 'danger' : 'warning'
                }>
                  {job.status}
                </Badge>
              </div>
            </Card.Header>
            <Card.Body>
              {job.description && (
                <div className="mb-4">
                  <h6>Description</h6>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{job.description}</p>
                </div>
              )}

              {job.requirements && (
                <div className="mb-4">
                  <h6>Requirements</h6>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{job.requirements}</p>
                </div>
              )}

              {job.applicationQuery && (
                <div className="mb-4">
                  <h6>Application Query</h6>
                  <code>{job.applicationQuery}</code>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Applications Section */}
          <Card>
            <Card.Header>
              <h5 className="mb-0">
                Applications ({job.applications?.length || 0})
              </h5>
            </Card.Header>
            <Card.Body>
              {job.applications && job.applications.length > 0 ? (
                <DataTable
                  columns={applicationColumns}
                  data={job.applications}
                  pagination={true}
                  paginationPerPage={10}
                />
              ) : (
                <div className="text-center py-4">
                  <i className="bi bi-inbox display-4 text-muted"></i>
                  <p className="mt-2 text-muted">No applications yet</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="mb-4">
            <Card.Header>
              <h6 className="mb-0">Job Information</h6>
            </Card.Header>
            <Card.Body>
              <div className="mb-3">
                <small className="text-muted">Location</small>
                <div>{job.isRemote ? 'Remote' : (job.location || 'Not specified')}</div>
              </div>

              <div className="mb-3">
                <small className="text-muted">Employment Type</small>
                <div>{job.employmentType || 'Not specified'}</div>
              </div>

              <div className="mb-3">
                <small className="text-muted">Salary Range</small>
                <div>{formatSalary(job.salaryMin, job.salaryMax)}</div>
              </div>

              <div className="mb-3">
                <small className="text-muted">Posted Date</small>
                <div>{new Date(job.postedDate || job.createdAt).toLocaleDateString()}</div>
              </div>

              {job.expiryDate && (
                <div className="mb-3">
                  <small className="text-muted">Expiry Date</small>
                  <div>{new Date(job.expiryDate).toLocaleDateString()}</div>
                </div>
              )}

              <div className="mb-0">
                <small className="text-muted">Last Updated</small>
                <div>{new Date(job.updatedAt).toLocaleDateString()}</div>
              </div>
            </Card.Body>
          </Card>

          <div className="d-grid gap-2">
            <Button 
              variant="primary"
              onClick={() => router.push(`/jobs/${job.id}/candidates`)}
            >
              <i className="bi bi-people"></i> View Candidates
            </Button>
            <Button 
              variant="outline-success"
              onClick={() => router.push(`/jobs/${job.id}/ingest`)}
            >
              <i className="bi bi-envelope"></i> Import Applications
            </Button>
          </div>
        </Col>
      </Row>
    </div>
  );
}