"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Button, Card, Row, Col, Alert, Spinner } from 'react-bootstrap';

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

export default function NewJobPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<JobFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


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
      // Validate required fields
      if (!formData.title.trim()) {
        throw new Error('Job title is required');
      }
      if (!formData.companyName.trim()) {
        throw new Error('Company name is required');
      }

      // Prepare data for API
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
        applicationQuery: formData.applicationQuery.trim() || null
      };

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jobData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create job');
      }

      const result = await response.json();
      console.log('Job created successfully:', result);
      
      // Redirect to jobs list
      router.push('/jobs');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-8">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h1 className="h3 mb-1">Create New Job</h1>
              <p className="text-muted mb-0">Add a new job posting to start receiving applications</p>
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
                        Creating Job...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-circle me-2"></i>
                        Create Job
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