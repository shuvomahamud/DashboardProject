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
  aiJobProfileJson?: string | null;
  aiJobProfileUpdatedAt?: string | null;
  aiJobProfileVersion?: string | null;
  aiJobProfile?: JobProfile | null;
}

interface JobProfile {
  summary: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  targetTitles: string[];
  responsibilities: string[];
  requiredExperienceYears: number | null;
  preferredExperienceYears: number | null;
  domainKeywords: string[];
  certifications: string[];
  locationConstraints: string | null;
  disqualifiers: string[];
  toolsAndTech: string[];
}

const safeParseProfile = (json: string | null | undefined): JobProfile | null => {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    const toYears = (value: unknown) => {
      if (value === null || value === undefined) return null;
      const numeric = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numeric) ? Math.round(numeric) : null;
    };

    return {
      summary: parsed.summary ?? '',
      mustHaveSkills: parsed.mustHaveSkills ?? [],
      niceToHaveSkills: parsed.niceToHaveSkills ?? [],
      targetTitles: parsed.targetTitles ?? [],
      responsibilities: parsed.responsibilities ?? [],
      requiredExperienceYears: toYears(parsed.requiredExperienceYears),
      preferredExperienceYears: toYears(parsed.preferredExperienceYears),
      domainKeywords: parsed.domainKeywords ?? [],
      certifications: parsed.certifications ?? [],
      locationConstraints: parsed.locationConstraints ?? null,
      disqualifiers: parsed.disqualifiers ?? [],
      toolsAndTech: parsed.toolsAndTech ?? []
    };
  } catch (error) {
    console.warn('Failed to parse AI job profile JSON', error);
    return null;
  }
};

const renderChipSection = (label: string, items: string[] | null | undefined) => (
  <section>
    <h6 className="fw-semibold text-dark mb-2">
      <i className="bi bi-record-circle text-primary me-2"></i>
      {label}
    </h6>
    {items && items.length > 0 ? (
      <div className="d-flex flex-wrap gap-2">
        {items.map((item, index) => (
          <Badge key={`${label}-${index}`} bg="secondary" className="fw-normal">
            {item}
          </Badge>
        ))}
      </div>
    ) : (
      <p className="text-muted mb-0">Not specified</p>
    )}
  </section>
);

const ExperienceBadge = ({ label, value }: { label: string; value: number | null }) => (
  <div className="d-flex flex-column">
    <span className="text-muted small">{label}</span>
    <Badge bg="info" text="dark" className="mt-1 px-3 py-2">
      {value !== null && value !== undefined ? `${value} years` : 'Not specified'}
    </Badge>
  </div>
);

const LocationBadge = ({ location }: { location: string | null }) => (
  <div className="d-flex flex-column">
    <span className="text-muted small">Location Constraints</span>
    <Badge bg="info" text="dark" className="mt-1 px-3 py-2">
      {location || 'None'}
    </Badge>
  </div>
);

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [jobProfile, setJobProfile] = useState<JobProfile | null>(null);
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
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
      setProfileLoading(true);
      const response = await fetch(`/api/jobs/${jobId}`);
      
      if (!response.ok) {
        throw new Error('Job not found');
      }
      
      const jobData: Job = await response.json();
      setJob(jobData);

      const profileFromResponse: JobProfile | null =
        (jobData as any).aiJobProfile ??
        (jobData.aiJobProfileJson ? safeParseProfile(jobData.aiJobProfileJson) : null);

      setJobProfile(profileFromResponse);
      setProfileUpdatedAt(jobData.aiJobProfileUpdatedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setProfileLoading(false);
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
      <div className="mb-4 bg-dark rounded p-4 shadow">
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div className="flex-grow-1">
            <div className="d-flex align-items-center gap-3 mb-2">
              <h1 className="h2 mb-0 fw-bold text-white">{job.title}</h1>
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
                <i className="bi bi-building text-white fs-5"></i>
                <span className="h5 mb-0 text-white fw-semibold">{job.companyName}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-geo-alt text-white"></i>
                <span className="text-white">{job.isRemote ? 'Remote' : (job.location || 'Not specified')}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-briefcase text-white"></i>
                <span className="text-white">{job.employmentType || 'Not specified'}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-currency-dollar text-white"></i>
                <span className="text-white fw-medium">{formatSalary(job.salaryMin, job.salaryMax)}</span>
              </div>
            </div>
            <div className="d-flex align-items-center gap-3 text-white-50">
              <small><i className="bi bi-calendar3"></i> Posted {new Date(job.postedDate || job.createdAt).toLocaleDateString()}</small>
              <small><i className="bi bi-clock"></i> Updated {new Date(job.updatedAt).toLocaleDateString()}</small>
              {job.expiryDate && (
                <small><i className="bi bi-hourglass-split"></i> Expires {new Date(job.expiryDate).toLocaleDateString()}</small>
              )}
            </div>
          </div>
          <div className="d-flex gap-2">
            <Button
              variant="outline-light"
              onClick={() => router.push('/jobs')}
              className="px-3"
            >
              <i className="bi bi-arrow-left me-1"></i> Back to Jobs
            </Button>
            <Button
              variant="outline-light"
              onClick={() => router.push(`/jobs/${job.id}/edit`)}
              className="px-3"
            >
              <i className="bi bi-pencil me-1"></i> Edit Job
            </Button>
          </div>
        </div>
      </div>

      {/* Import Applications Button */}
      <div className="mb-4">
        <Button
          variant="success"
          size="lg"
          onClick={() => setShowImportModal(true)}
          className="fw-medium shadow-sm"
        >
          <i className="bi bi-envelope-plus me-2"></i> Import Applications
        </Button>
      </div>

      <Row className="g-4">
        <Col lg={12}>
          {/* AI Job Profile */}
          <Card className="mb-4 border-0 shadow-sm">
            <Card.Header className="bg-light border-0 py-3 d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-stars text-primary"></i>
                <h5 className="mb-0 fw-semibold">AI Job Profile</h5>
              </div>
              {profileUpdatedAt && (
                <small className="text-muted">
                  Last updated {new Date(profileUpdatedAt).toLocaleString()}
                </small>
              )}
            </Card.Header>
            <Card.Body className="p-4">
              {profileLoading ? (
                <div className="d-flex flex-column align-items-center justify-content-center py-4">
                  <Spinner animation="border" role="status" />
                  <p className="mt-3 mb-0 text-muted">Generating AI profile...</p>
                </div>
              ) : jobProfile ? (
                <div className="d-flex flex-column gap-4">
                  {jobProfile.summary && (
                    <section>
                      <h6 className="fw-semibold text-dark mb-2">
                        <i className="bi bi-chat-left-dots text-primary me-2"></i>Summary
                      </h6>
                      <p className="mb-0 text-muted" style={{ whiteSpace: 'pre-wrap' }}>
                        {jobProfile.summary}
                      </p>
                    </section>
                  )}

                  {renderChipSection('Must-have Skills', jobProfile.mustHaveSkills)}
                  {renderChipSection('Nice-to-have Skills', jobProfile.niceToHaveSkills)}
                  {renderChipSection('Target Titles', jobProfile.targetTitles)}
                  {renderChipSection('Responsibilities', jobProfile.responsibilities)}
                  {renderChipSection('Tools & Technologies', jobProfile.toolsAndTech)}
                  {renderChipSection('Domain Keywords', jobProfile.domainKeywords)}
                  {renderChipSection('Certifications', jobProfile.certifications)}
                  {renderChipSection('Disqualifiers', jobProfile.disqualifiers)}

                  <section className="d-flex flex-wrap gap-4">
                    <ExperienceBadge label="Required Experience" value={jobProfile.requiredExperienceYears} />
                    <ExperienceBadge label="Preferred Experience" value={jobProfile.preferredExperienceYears} />
                    <LocationBadge location={jobProfile.locationConstraints} />
                  </section>
                </div>
              ) : (
                <Alert variant="info" className="mb-0">
                  <Alert.Heading className="fs-6 fw-semibold">No AI profile available yet</Alert.Heading>
                  <p className="mb-0">
                    Edit the job posting to trigger profile extraction, or ensure the OpenAI integration is configured.
                  </p>
                </Alert>
              )}
            </Card.Body>
          </Card>

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
