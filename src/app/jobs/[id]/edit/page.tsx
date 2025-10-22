"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Form, Button, Card, Row, Col, Alert, Spinner } from 'react-bootstrap';
import { useToast } from '@/contexts/ToastContext';

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
  expiryDate: string;
  companyName: string;
  applicationQuery: string;
  aiJobProfile?: JobProfile | null;
}

interface JobProfile {
  version?: string;
  summary: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  softSkills: string[];
  targetTitles: string[];
  responsibilities: string[];
  toolsAndTech: string[];
  domainKeywords: string[];
  certifications: string[];
  disqualifiers: string[];
  requiredExperienceYears: number | null;
  preferredExperienceYears: number | null;
  locationConstraints: string | null;
}

interface JobFormData {
  title: string;
  description: string;
  requirements: string;
  salaryMin: string;
  salaryMax: string;
  location: string;
  isRemote: boolean;
  employmentType: string;
  status: string;
  expiryDate: string;
  companyName: string;
  applicationQuery: string;
}

const initialFormData: JobFormData = {
  title: '',
  description: '',
  requirements: '',
  salaryMin: '',
  salaryMax: '',
  location: '',
  isRemote: false,
  employmentType: '',
  status: 'active',
  expiryDate: '',
  companyName: '',
  applicationQuery: ''
};

interface JobProfileFormData {
  summary: string;
  mustHaveSkills: string;
  niceToHaveSkills: string;
  softSkills: string;
  targetTitles: string;
  responsibilities: string;
  toolsAndTech: string;
  domainKeywords: string;
  certifications: string;
  disqualifiers: string;
  requiredExperienceYears: string;
  preferredExperienceYears: string;
  locationConstraints: string;
}

const initialProfileFormData: JobProfileFormData = {
  summary: '',
  mustHaveSkills: '',
  niceToHaveSkills: '',
  softSkills: '',
  targetTitles: '',
  responsibilities: '',
  toolsAndTech: '',
  domainKeywords: '',
  certifications: '',
  disqualifiers: '',
  requiredExperienceYears: '',
  preferredExperienceYears: '',
  locationConstraints: ''
};

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.id as string;
  const { showToast } = useToast();

  const [formData, setFormData] = useState<JobFormData>(initialFormData);
  const [profileFormData, setProfileFormData] = useState<JobProfileFormData>(initialProfileFormData);
  const [profileVersion, setProfileVersion] = useState('v1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [loadingJob, setLoadingJob] = useState(true);

  const listToMultiline = (items?: string[] | null) =>
    items && items.length > 0 ? items.join('\n') : '';

  const multilineToList = (value: string) =>
    value
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(item => item.length > 0);

  const handleProfileChange = (field: keyof JobProfileFormData, value: string) => {
    setProfileFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const applyProfileToForm = (profile: JobProfile | null) => {
    setProfileFormData({
      summary: profile?.summary ?? '',
      mustHaveSkills: listToMultiline(profile?.mustHaveSkills),
      niceToHaveSkills: listToMultiline(profile?.niceToHaveSkills),
      softSkills: listToMultiline(profile?.softSkills),
      targetTitles: listToMultiline(profile?.targetTitles),
      responsibilities: listToMultiline(profile?.responsibilities),
      toolsAndTech: listToMultiline(profile?.toolsAndTech),
      domainKeywords: listToMultiline(profile?.domainKeywords),
      certifications: listToMultiline(profile?.certifications),
      disqualifiers: listToMultiline(profile?.disqualifiers),
      requiredExperienceYears: profile?.requiredExperienceYears != null ? String(profile.requiredExperienceYears) : '',
      preferredExperienceYears: profile?.preferredExperienceYears != null ? String(profile.preferredExperienceYears) : '',
      locationConstraints: profile?.locationConstraints ?? ''
    });
    setProfileVersion(profile?.version ?? 'v1');
  };

  useEffect(() => {
    if (jobId) {
      fetchJob();
    }
  }, [jobId]);

  const fetchJob = async () => {
    try {
      setLoadingJob(true);
      const response = await fetch(`/api/jobs/${jobId}`);
      
      if (!response.ok) {
        throw new Error('Job not found');
      }
      
      const job: Job = await response.json();
      
      // Format date for input
      let formattedExpiryDate = '';
      if (job.expiryDate) {
        const date = new Date(job.expiryDate);
        formattedExpiryDate = date.toISOString().split('T')[0];
      }

      setFormData({
        title: job.title || '',
        description: job.description || '',
        requirements: job.requirements || '',
        salaryMin: job.salaryMin ? job.salaryMin.toString() : '',
        salaryMax: job.salaryMax ? job.salaryMax.toString() : '',
        location: job.location || '',
        isRemote: job.isRemote || false,
        employmentType: job.employmentType || '',
        status: job.status || 'active',
        expiryDate: formattedExpiryDate,
        companyName: job.companyName || '',
        applicationQuery: job.applicationQuery || ''
      });

      const profile = job.aiJobProfile || null;
      applyProfileToForm(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoadingJob(false);
    }
  };

  const handleProfileRefresh = async () => {
    if (!jobId) {
      return;
    }

    setRefreshingProfile(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/refresh-profile`, {
        method: 'POST'
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || 'Failed to refresh AI job profile');
      }

      const profile = payload?.aiJobProfile as JobProfile | null;
      if (!profile) {
        throw new Error('AI did not return a usable profile. Please try again later.');
      }

      applyProfileToForm(profile);
      setError(null);
      showToast(payload?.message ?? 'AI profile fields updated.', 'success', 4000);
    } catch (err) {
      console.error('Failed to refresh AI job profile', err);
      const message = err instanceof Error ? err.message : 'Failed to refresh AI job profile';
      showToast(message, 'error', 6000);
    } finally {
      setRefreshingProfile(false);
    }
  };


  const handleChange = (field: keyof JobFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.title.trim()) {
        throw new Error('Job title is required');
      }
      if (!formData.companyName.trim()) {
        throw new Error('Company name is required');
      }

      const parseYears = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const aiJobProfile = {
        version: profileVersion || 'v1',
        summary: profileFormData.summary.trim(),
        mustHaveSkills: multilineToList(profileFormData.mustHaveSkills),
        niceToHaveSkills: multilineToList(profileFormData.niceToHaveSkills),
        softSkills: multilineToList(profileFormData.softSkills),
        targetTitles: multilineToList(profileFormData.targetTitles),
        responsibilities: multilineToList(profileFormData.responsibilities),
        toolsAndTech: multilineToList(profileFormData.toolsAndTech),
        domainKeywords: multilineToList(profileFormData.domainKeywords),
        certifications: multilineToList(profileFormData.certifications),
        disqualifiers: multilineToList(profileFormData.disqualifiers),
        requiredExperienceYears: parseYears(profileFormData.requiredExperienceYears),
        preferredExperienceYears: parseYears(profileFormData.preferredExperienceYears),
        locationConstraints: profileFormData.locationConstraints.trim() || null
      };

      const jobData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        requirements: formData.requirements.trim() || null,
        salaryMin: formData.salaryMin ? parseFloat(formData.salaryMin) : null,
        salaryMax: formData.salaryMax ? parseFloat(formData.salaryMax) : null,
        location: formData.location.trim() || null,
        isRemote: formData.isRemote,
        employmentType: formData.employmentType || null,
        status: formData.status,
        expiryDate: formData.expiryDate ? new Date(formData.expiryDate).toISOString() : null,
        companyName: formData.companyName.trim(),
        applicationQuery: formData.applicationQuery.trim() || null,
        aiJobProfile,
        aiSummary: aiJobProfile.summary
      };

      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jobData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update job');
      }

      router.push('/jobs');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setLoading(false);
    }
  };

  if (loadingJob) {
    return (
      <div className="container mt-4 text-center">
        <Spinner animation="border" />
        <p className="mt-2">Loading job details...</p>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-8">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h1 className="h3 mb-1">Edit Job</h1>
              <p className="text-muted mb-0">Update job posting details</p>
            </div>
            <Button
              variant="outline-secondary"
              onClick={() => router.push('/jobs')}
            >
              <i className="bi bi-arrow-left"></i> Back to Jobs
            </Button>
          </div>

          {error && (
            <Alert variant="danger" className="mb-4">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              {error}
            </Alert>
          )}

          <Card>
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                <Row>
                  <Col md={8}>
                    <Form.Group className="mb-3">
                      <Form.Label>Job Title *</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.title}
                        onChange={(e) => handleChange('title', e.target.value)}
                        placeholder="e.g., Senior Software Developer"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Company *</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.companyName}
                        onChange={(e) => handleChange('companyName', e.target.value)}
                        placeholder="e.g., Tech Corp"
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label>Job Description</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Describe the role, responsibilities, and what makes this position exciting..."
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Requirements</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={formData.requirements}
                    onChange={(e) => handleChange('requirements', e.target.value)}
                    placeholder="List the required skills, experience, education, etc..."
                  />
                </Form.Group>

                <div className="mb-4 p-3 border rounded bg-light">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h5 className="fw-semibold mb-1">AI Job Profile</h5>
                      <p className="text-muted mb-0">
                        Control the structured requirements used by AI scoring. Enter one item per line for list fields.
                      </p>
                    </div>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={handleProfileRefresh}
                      disabled={refreshingProfile || loading || loadingJob}
                    >
                      {refreshingProfile ? (
                        <>
                          <Spinner animation="border" size="sm" className="me-2" />
                          Refreshing...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-arrow-repeat me-2"></i>
                          Re-run with AI
                        </>
                      )}
                    </Button>
                  </div>

                  <Form.Group className="mb-3">
                    <Form.Label>Summary</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={profileFormData.summary}
                      onChange={(e) => handleProfileChange('summary', e.target.value)}
                      placeholder="Concise overview of the ideal candidate (max 600 characters)."
                    />
                    <Form.Text className="text-muted">
                      Keep under 600 characters.
                    </Form.Text>
                  </Form.Group>

                  <Row className="gy-3">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Must-have Skills</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={4}
                          value={profileFormData.mustHaveSkills}
                          onChange={(e) => handleProfileChange('mustHaveSkills', e.target.value)}
                          placeholder="One skill per line"
                        />
                        <Form.Text className="text-muted">Required for top candidates.</Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Nice-to-have Skills</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={4}
                          value={profileFormData.niceToHaveSkills}
                          onChange={(e) => handleProfileChange('niceToHaveSkills', e.target.value)}
                          placeholder="One skill per line"
                        />
                      </Form.Group>
                    </Col>

                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Soft Skills</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={profileFormData.softSkills}
                          onChange={(e) => handleProfileChange('softSkills', e.target.value)}
                          placeholder="e.g., communication, leadership"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Target Titles</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={profileFormData.targetTitles}
                          onChange={(e) => handleProfileChange('targetTitles', e.target.value)}
                          placeholder="e.g., Senior Java Developer"
                        />
                      </Form.Group>
                    </Col>

                    <Col md={12}>
                      <Form.Group>
                        <Form.Label>Responsibilities</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={4}
                          value={profileFormData.responsibilities}
                          onChange={(e) => handleProfileChange('responsibilities', e.target.value)}
                          placeholder="One responsibility per line"
                        />
                      </Form.Group>
                    </Col>

                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Tools &amp; Technologies</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={profileFormData.toolsAndTech}
                          onChange={(e) => handleProfileChange('toolsAndTech', e.target.value)}
                          placeholder="One item per line"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Domain Keywords</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={profileFormData.domainKeywords}
                          onChange={(e) => handleProfileChange('domainKeywords', e.target.value)}
                          placeholder="e.g., healthcare, fintech"
                        />
                      </Form.Group>
                    </Col>

                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Certifications</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={profileFormData.certifications}
                          onChange={(e) => handleProfileChange('certifications', e.target.value)}
                          placeholder="One certification per line"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Disqualifiers</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={profileFormData.disqualifiers}
                          onChange={(e) => handleProfileChange('disqualifiers', e.target.value)}
                          placeholder="e.g., Missing references"
                        />
                      </Form.Group>
                    </Col>

                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Required Experience (years)</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          step="1"
                          value={profileFormData.requiredExperienceYears}
                          onChange={(e) => handleProfileChange('requiredExperienceYears', e.target.value)}
                          placeholder="e.g., 8"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Preferred Experience (years)</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          step="1"
                          value={profileFormData.preferredExperienceYears}
                          onChange={(e) => handleProfileChange('preferredExperienceYears', e.target.value)}
                          placeholder="e.g., 10"
                        />
                      </Form.Group>
                    </Col>

                    <Col md={12}>
                      <Form.Group>
                        <Form.Label>Location Constraints</Form.Label>
                        <Form.Control
                          type="text"
                          value={profileFormData.locationConstraints}
                          onChange={(e) => handleProfileChange('locationConstraints', e.target.value)}
                          placeholder="e.g., Albany, NY"
                        />
                        <Form.Text className="text-muted">
                          Leave blank if there are no specific constraints.
                        </Form.Text>
                      </Form.Group>
                    </Col>
                  </Row>
                </div>

                <Row>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Min Salary (in thousands)</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        min="0"
                        max="999.99"
                        value={formData.salaryMin}
                        onChange={(e) => handleChange('salaryMin', e.target.value)}
                        placeholder="50"
                      />
                      <Form.Text className="text-muted">
                        Enter salary in thousands (e.g., 50 for $50k)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Max Salary (in thousands)</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        min="0"
                        max="999.99"
                        value={formData.salaryMax}
                        onChange={(e) => handleChange('salaryMax', e.target.value)}
                        placeholder="80"
                      />
                      <Form.Text className="text-muted">
                        Enter salary in thousands (e.g., 80 for $80k)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Employment Type</Form.Label>
                      <Form.Select
                        value={formData.employmentType}
                        onChange={(e) => handleChange('employmentType', e.target.value)}
                      >
                        <option value="">Select type</option>
                        <option value="full-time">Full-time</option>
                        <option value="part-time">Part-time</option>
                        <option value="contract">Contract</option>
                        <option value="temporary">Temporary</option>
                        <option value="internship">Internship</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Status</Form.Label>
                      <Form.Select
                        value={formData.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                      >
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="closed">Closed</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={8}>
                    <Form.Group className="mb-3">
                      <Form.Label>Location</Form.Label>
                      <Form.Control
                        type="text"
                        value={formData.location}
                        onChange={(e) => handleChange('location', e.target.value)}
                        placeholder="e.g., New York, NY"
                        disabled={formData.isRemote}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>&nbsp;</Form.Label>
                      <div>
                        <Form.Check
                          type="checkbox"
                          label="Remote Work Available"
                          checked={formData.isRemote}
                          onChange={(e) => handleChange('isRemote', e.target.checked)}
                        />
                      </div>
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Expiry Date</Form.Label>
                      <Form.Control
                        type="date"
                        value={formData.expiryDate}
                        onChange={(e) => handleChange('expiryDate', e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-4">
                  <Form.Label>Application Query (Advanced)</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.applicationQuery}
                    onChange={(e) => handleChange('applicationQuery', e.target.value)}
                    placeholder='e.g., subject:"Software Developer" hasAttachments:yes'
                  />
                  <Form.Text className="text-muted">
                    Optional: Outlook AQS query for automatic email ingestion
                  </Form.Text>
                </Form.Group>

                <div className="d-flex justify-content-end gap-2">
                  <Button
                    variant="outline-secondary"
                    onClick={() => router.push('/jobs')}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Updating Job...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-circle me-2"></i>
                        Update Job
                      </>
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
}
