"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, Row, Col, Badge, Button, Alert, Spinner } from 'react-bootstrap';
import DataTable from '@/components/DataTable';
import ImportApplicationsModal from '@/components/jobs/ImportApplicationsModal';
import ApplicationsTable from '@/components/jobs/ApplicationsTable';

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
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const handleImported = useCallback(() => {
    // Refresh the job data to show new applications
    fetchJob();
  }, []);

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
    <div className="container-fluid mt-4" style={{ maxWidth: '1400px' }}>
      {/* Modern Header Section */}
      <div className="mb-4">
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div className="flex-grow-1">
            <div className="d-flex align-items-center gap-3 mb-2">
              <h1 className="h2 mb-0 fw-bold text-dark">{job.title}</h1>
              <Badge
                bg={
                  job.status === 'active' ? 'success' :
                  job.status === 'draft' ? 'secondary' :
                  job.status === 'closed' ? 'danger' : 'warning'
                }
                className="fs-6 px-3 py-2"
              >
                {job.status.toUpperCase()}
              </Badge>
            </div>
            <div className="d-flex align-items-center gap-3 mb-3">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-building text-primary fs-5"></i>
                <span className="h5 mb-0 text-dark fw-semibold">{job.companyName}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-geo-alt text-primary"></i>
                <span className="text-dark">{job.isRemote ? 'Remote' : (job.location || 'Not specified')}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-briefcase text-primary"></i>
                <span className="text-dark">{job.employmentType || 'Not specified'}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-currency-dollar text-success"></i>
                <span className="text-dark fw-medium">{formatSalary(job.salaryMin, job.salaryMax)}</span>
              </div>
            </div>
            <div className="d-flex align-items-center gap-3 text-muted">
              <small><i className="bi bi-calendar3"></i> Posted {new Date(job.postedDate || job.createdAt).toLocaleDateString()}</small>
              <small><i className="bi bi-clock"></i> Updated {new Date(job.updatedAt).toLocaleDateString()}</small>
              {job.expiryDate && (
                <small><i className="bi bi-hourglass-split"></i> Expires {new Date(job.expiryDate).toLocaleDateString()}</small>
              )}
            </div>
          </div>
          <div className="d-flex gap-2">
            <Button
              variant="outline-secondary"
              onClick={() => router.push('/jobs')}
              className="px-3"
            >
              <i className="bi bi-arrow-left me-1"></i> Back to Jobs
            </Button>
            <Button
              variant="outline-primary"
              onClick={() => router.push(`/jobs/${job.id}/edit`)}
              className="px-3"
            >
              <i className="bi bi-pencil me-1"></i> Edit Job
            </Button>
          </div>
        </div>
      </div>

      <Row className="g-4">
        <Col lg={8}>
          {/* Job Description Card */}
          <Card className="mb-4 border-0 shadow-sm">
            <Card.Header className="bg-light border-0 py-3">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-file-text text-primary"></i>
                <h5 className="mb-0 fw-semibold">Job Details</h5>
              </div>
            </Card.Header>
            <Card.Body className="p-4">
              {job.description && (
                <div className="mb-4">
                  <h6 className="fw-semibold text-dark mb-3">
                    <i className="bi bi-card-text text-primary me-2"></i>Description
                  </h6>
                  <div
                    className="text-dark lh-lg"
                    style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}
                  >
                    {job.description}
                  </div>
                </div>
              )}

              {job.requirements && (
                <div className="mb-4">
                  <h6 className="fw-semibold text-dark mb-3">
                    <i className="bi bi-list-check text-primary me-2"></i>Requirements
                  </h6>
                  <div
                    className="text-dark lh-lg"
                    style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}
                  >
                    {job.requirements}
                  </div>
                </div>
              )}

              {job.applicationQuery && (
                <div className="mb-0">
                  <h6 className="fw-semibold text-dark mb-3">
                    <i className="bi bi-search text-primary me-2"></i>Application Query
                  </h6>
                  <div className="bg-light rounded p-3">
                    <code className="text-dark">{job.applicationQuery}</code>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Applications Section */}
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-primary text-white border-0 py-3">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-people-fill"></i>
                <h5 className="mb-0 fw-semibold">Applications</h5>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <ApplicationsTable jobId={job.id} />
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          {/* Job Information Card */}
          <Card className="mb-4 border-0 shadow-sm h-fit">
            <Card.Header className="bg-light border-0 py-3">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-info-circle text-primary"></i>
                <h6 className="mb-0 fw-semibold">Quick Info</h6>
              </div>
            </Card.Header>
            <Card.Body className="p-4">
              <div className="mb-3 pb-3 border-bottom">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <i className="bi bi-geo-alt-fill text-primary"></i>
                  <small className="text-muted fw-medium">LOCATION</small>
                </div>
                <div className="fw-medium text-dark">{job.isRemote ? 'Remote' : (job.location || 'Not specified')}</div>
              </div>

              <div className="mb-3 pb-3 border-bottom">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <i className="bi bi-briefcase-fill text-primary"></i>
                  <small className="text-muted fw-medium">EMPLOYMENT TYPE</small>
                </div>
                <div className="fw-medium text-dark">{job.employmentType || 'Not specified'}</div>
              </div>

              <div className="mb-3 pb-3 border-bottom">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <i className="bi bi-currency-dollar text-success"></i>
                  <small className="text-muted fw-medium">SALARY RANGE</small>
                </div>
                <div className="fw-bold text-success">{formatSalary(job.salaryMin, job.salaryMax)}</div>
              </div>

              <div className="mb-3 pb-3 border-bottom">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <i className="bi bi-calendar-plus text-primary"></i>
                  <small className="text-muted fw-medium">POSTED DATE</small>
                </div>
                <div className="fw-medium text-dark">{new Date(job.postedDate || job.createdAt).toLocaleDateString()}</div>
              </div>

              {job.expiryDate && (
                <div className="mb-3 pb-3 border-bottom">
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <i className="bi bi-hourglass-split text-warning"></i>
                    <small className="text-muted fw-medium">EXPIRY DATE</small>
                  </div>
                  <div className="fw-medium text-dark">{new Date(job.expiryDate).toLocaleDateString()}</div>
                </div>
              )}

              <div className="mb-0">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <i className="bi bi-clock-fill text-primary"></i>
                  <small className="text-muted fw-medium">LAST UPDATED</small>
                </div>
                <div className="fw-medium text-dark">{new Date(job.updatedAt).toLocaleDateString()}</div>
              </div>
            </Card.Body>
          </Card>

          {/* Action Buttons */}
          <div className="d-grid gap-3">
            <Button
              variant="success"
              size="lg"
              onClick={() => setShowImportModal(true)}
              className="fw-medium shadow-sm"
            >
              <i className="bi bi-envelope-plus me-2"></i> Import Applications
            </Button>
          </div>
        </Col>
      </Row>

      {/* Import Applications Modal */}
      <ImportApplicationsModal
        jobId={parseInt(jobId)}
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={handleImported}
      />
    </div>
  );
}