"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Button, Card, Row, Col, Alert, Spinner, Badge } from 'react-bootstrap';
import { useToast } from '@/contexts/ToastContext';
import { parsePreferredExperienceInput, parseRequiredExperienceInput } from '@/lib/jobs/experience';
import { canonicalizeSkill } from '@/lib/skills/normalize';

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
  niceToHaveSkills: string;
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
  niceToHaveSkills: '',
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

export default function NewJobPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<JobFormData>(initialFormData);
  const [profileFormData, setProfileFormData] = useState<JobProfileFormData>(initialProfileFormData);
  const [profileVersion, setProfileVersion] = useState('v1');
  const [profileGenerated, setProfileGenerated] = useState(false);
  const [runningProfile, setRunningProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mandatorySkills, setMandatorySkills] = useState<string[]>([]);
  const [addingMandatorySkill, setAddingMandatorySkill] = useState(false);
  const [newMandatorySkill, setNewMandatorySkill] = useState('');
  const [aiMustHaveSkills, setAiMustHaveSkills] = useState<string[]>([]);
  const [aiRewrites, setAiRewrites] = useState<{ description: string; requirements: string[] }>({
    description: '',
    requirements: []
  });

  const listToMultiline = (items?: string[] | null) =>
    items && items.length > 0 ? items.join('\n') : '';

  const multilineToList = (value: string) =>
    value
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(item => item.length > 0);

  const normalizeSkillKey = (value: string) => canonicalizeSkill(value);

  const syncMandatorySkillsFromList = (skills: string[]) => {
    setMandatorySkills(() => {
      const seen = new Set<string>();
      const next: string[] = [];
      for (const rawSkill of skills) {
        const skill = rawSkill.trim();
        if (!skill) continue;
        const key = normalizeSkillKey(skill);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(skill);
        if (next.length >= 30) break;
      }
      return next;
    });
  };

  const handleMandatorySkillChange = (index: number, value: string) => {
    setMandatorySkills(prev => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemoveMandatorySkill = (index: number) => {
    setMandatorySkills(prev => prev.filter((_, idx) => idx !== index));
  };

  const resetNewMandatoryInputs = () => {
    setNewMandatorySkill('');
  };

  const handleAddMandatorySkill = () => {
    const skill = newMandatorySkill.trim();
    if (!skill) {
      showToast('Skill name is required.', 'error', 4000);
      return;
    }

    let additionMade = false;

    setMandatorySkills(prev => {
      const normalized = normalizeSkillKey(skill);
      const existingIndex = prev.findIndex(item => normalizeSkillKey(item) === normalized);
      if (existingIndex >= 0) {
        additionMade = true;
        const next = [...prev];
        next[existingIndex] = skill;
        return next;
      }

      if (prev.length >= 30) {
        showToast('You can only add up to 30 mandatory skills.', 'warning', 4000);
        additionMade = false;
        return prev;
      }

      additionMade = true;
      return [...prev, skill];
    });

    if (additionMade) {
      resetNewMandatoryInputs();
      setAddingMandatorySkill(false);
    }
  };

  const handleCancelAddMandatorySkill = () => {
    resetNewMandatoryInputs();
    setAddingMandatorySkill(false);
  };

  const handleProfileChange = (field: keyof JobProfileFormData, value: string) => {
    setProfileFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleChange = (field: keyof JobFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const applyProfileToForm = (profile: any | null) => {
    if (!profile) {
      setProfileFormData(initialProfileFormData);
      setProfileVersion('v1');
      setMandatorySkills([]);
      setAiMustHaveSkills([]);
      setAiRewrites({ description: '', requirements: [] });
      return;
    }

    setAiMustHaveSkills(Array.isArray(profile.mustHaveSkills) ? profile.mustHaveSkills : []);

    setProfileFormData({
      summary: profile.summary ?? '',
      niceToHaveSkills: listToMultiline(profile.niceToHaveSkills),
      targetTitles: listToMultiline(profile.targetTitles),
      responsibilities: listToMultiline(profile.responsibilities),
      toolsAndTech: listToMultiline(profile.toolsAndTech),
      domainKeywords: listToMultiline(profile.domainKeywords),
      certifications: listToMultiline(profile.certifications),
      disqualifiers: listToMultiline(profile.disqualifiers),
      requiredExperienceYears: profile?.requiredExperienceYears != null ? String(profile.requiredExperienceYears) : '',
      preferredExperienceYears: profile?.preferredExperienceYears != null ? String(profile.preferredExperienceYears) : '',
      locationConstraints: profile?.locationConstraints ?? ''
    });
    setProfileVersion(profile.version ?? 'v1');
    syncMandatorySkillsFromList(profile.mustHaveSkills ?? []);

    const rewrittenDescription =
      typeof profile.rewrittenJobDescription === 'string'
        ? profile.rewrittenJobDescription.trim()
        : '';
    const rewrittenRequirements = Array.isArray(profile.rewrittenRequirements)
      ? profile.rewrittenRequirements.map((item: string) => item?.toString().trim()).filter(Boolean)
      : [];

    setAiRewrites({
      description: rewrittenDescription,
      requirements: rewrittenRequirements
    });

    setFormData(prev => ({
      ...prev,
      description:
        rewrittenDescription && rewrittenDescription.toLowerCase() !== 'unknown'
          ? rewrittenDescription
          : prev.description,
      requirements:
        rewrittenRequirements.length > 0 &&
        !(rewrittenRequirements.length === 1 &&
          rewrittenRequirements[0] &&
          rewrittenRequirements[0].toLowerCase() === 'unknown')
          ? rewrittenRequirements.join('\n')
          : prev.requirements
    }));
  };

  const handleRunProfile = async () => {
    if (runningProfile) return;

    if (!formData.description.trim() && !formData.requirements.trim()) {
      setError('Provide a description or requirements so AI has context.');
      return;
    }

    setRunningProfile(true);
    setError(null);

    try {
      const response = await fetch('/api/jobs/generate-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
          requirements: formData.requirements.trim(),
          companyName: formData.companyName.trim(),
          employmentType: formData.employmentType || null,
          location: formData.location.trim() || null
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'AI profile generation failed');
      }

      applyProfileToForm(payload.aiJobProfile);
      setProfileGenerated(true);
      showToast(payload?.message ?? 'AI profile populated.', 'success', 4000);
    } catch (err) {
      setProfileGenerated(false);
      const message = err instanceof Error ? err.message : 'Failed to generate AI profile';
      setError(message);
      showToast(message, 'error', 6000);
    } finally {
      setRunningProfile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!profileGenerated) {
        throw new Error('Please run the AI profile first.');
      }
      if (!formData.title.trim()) {
        throw new Error('Job title is required');
      }
      if (!formData.companyName.trim()) {
        throw new Error('Company name is required');
      }

      const requiredExperienceYears = parseRequiredExperienceInput(
        profileFormData.requiredExperienceYears
      );
      const preferredExperience = parsePreferredExperienceInput(
        profileFormData.preferredExperienceYears,
        requiredExperienceYears
      );

      const aiJobProfile = {
        version: profileVersion || 'v1',
        rewrittenJobDescription: aiRewrites.description || '',
        rewrittenRequirements: aiRewrites.requirements,
        summary: profileFormData.summary.trim(),
        niceToHaveSkills: multilineToList(profileFormData.niceToHaveSkills),
        targetTitles: multilineToList(profileFormData.targetTitles),
        responsibilities: multilineToList(profileFormData.responsibilities),
        toolsAndTech: multilineToList(profileFormData.toolsAndTech),
        domainKeywords: multilineToList(profileFormData.domainKeywords),
        certifications: multilineToList(profileFormData.certifications),
        disqualifiers: multilineToList(profileFormData.disqualifiers),
        requiredExperienceYears,
        preferredExperienceYears: preferredExperience.min,
        locationConstraints: profileFormData.locationConstraints.trim() || null
      };

      let mandatorySkillRequirementsPayload = mandatorySkills
        .map(skill => skill.trim())
        .filter(skill => skill.length > 0)
        .slice(0, 30);

      if (mandatorySkillRequirementsPayload.length === 0) {
        mandatorySkillRequirementsPayload = aiMustHaveSkills
          .slice(0, 30)
          .map(skill => skill.trim())
          .filter(skill => skill.length > 0);
      }

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
        requiredExperienceYears,
        preferredExperienceMinYears: preferredExperience.min,
        preferredExperienceMaxYears: preferredExperience.max,
        aiJobProfile,
        aiSummary: aiJobProfile.summary,
        mandatorySkillRequirements: mandatorySkillRequirementsPayload
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

                <Row className="gy-3">
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Salary Min (k)</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={formData.salaryMin}
                        onChange={(e) => handleChange('salaryMin', e.target.value)}
                        placeholder="60"
                      />
                      <Form.Text className="text-muted">
                        Enter salary in thousands (e.g., 60 for $60k)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Salary Max (k)</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
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

                <div className="mb-4 p-3 border rounded bg-light">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h5 className="fw-semibold mb-1">AI Job Profile</h5>
                      <p className="text-muted mb-0">
                        These fields populate after running AI. You can edit them before saving.
                      </p>
                    </div>
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
                          min={0}
                          value={profileFormData.requiredExperienceYears}
                          onChange={(e) => handleProfileChange('requiredExperienceYears', e.target.value)}
                          placeholder="e.g., 5"
                          required
                        />
                        <Form.Text className="text-muted">
                          Whole years between 0 and 80.
                        </Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Preferred Experience (years)</Form.Label>
                        <Form.Control
                          type="text"
                          value={profileFormData.preferredExperienceYears}
                          onChange={(e) => handleProfileChange('preferredExperienceYears', e.target.value)}
                          placeholder="e.g., 8 or 8-10"
                        />
                        <Form.Text className="text-muted">
                          Leave blank or enter a range like 8-10. Candidates in the range earn the
                          strongest experience score, while those outside receive reduced points per
                          the matching logic.
                        </Form.Text>
                      </Form.Group>
                    </Col>

                    <Col md={12}>
                      <Form.Group>
                        <Form.Label>Location Constraints</Form.Label>
                        <Form.Control
                          type="text"
                          value={profileFormData.locationConstraints}
                          onChange={(e) => handleProfileChange('locationConstraints', e.target.value)}
                          placeholder="e.g., Within 2 hours of New York"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  {aiMustHaveSkills.length > 0 && (
                    <div className="mt-3">
                      <Form.Label>Must-have Skills (AI suggested)</Form.Label>
                      <div className="d-flex flex-wrap gap-2">
                        {aiMustHaveSkills.map((skill, index) => (
                          <Badge bg="secondary" className="fw-normal" key={`${skill}-${index}`}>
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3 mb-3">
                    <div>
                      <h5 className="fw-semibold mb-1">Mandatory Skills</h5>
                      <p className="text-muted small mb-0">
                        Add up to 30 critical skills for AI + manual review to verify.
                      </p>
                    </div>
                    <div>
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        disabled={mandatorySkills.length >= 30}
                        onClick={() => {
                          resetNewMandatoryInputs();
                          setAddingMandatorySkill(true);
                        }}
                      >
                        <i className="bi bi-plus-circle me-1" />
                        Add Skill
                      </Button>
                    </div>
                  </div>

                  {addingMandatorySkill && (
                    <div className="border rounded bg-light p-3 mb-3">
                      <Row className="g-3 align-items-end">
                        <Col md={8}>
                          <Form.Group className="mb-0">
                            <Form.Label className="small fw-semibold">Skill *</Form.Label>
                            <Form.Control
                              size="sm"
                              type="text"
                              value={newMandatorySkill}
                              onChange={(e) => setNewMandatorySkill(e.target.value)}
                              placeholder="e.g., React"
                              autoFocus
                            />
                          </Form.Group>
                        </Col>
                        <Col md={4} className="d-flex gap-2">
                          <Button size="sm" variant="primary" type="button" onClick={handleAddMandatorySkill}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline-secondary" type="button" onClick={handleCancelAddMandatorySkill}>
                            Cancel
                          </Button>
                        </Col>
                      </Row>
                    </div>
                  )}

                  {mandatorySkills.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th style={{ width: '4rem' }}>#</th>
                            <th>Skill</th>
                            <th style={{ width: '5rem' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {mandatorySkills.map((skill, index) => (
                            <tr key={`${skill}-${index}`}>
                              <td className="text-muted">{index + 1}</td>
                              <td>
                                <Form.Control
                                  size="sm"
                                  type="text"
                                  value={skill}
                                  onChange={(e) => handleMandatorySkillChange(index, e.target.value)}
                                />
                              </td>
                              <td className="text-end">
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  type="button"
                                  onClick={() => handleRemoveMandatorySkill(index)}
                                >
                                  <i className="bi bi-trash" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Alert variant="light" className="border border-secondary-subtle text-muted mb-0">
                      <i className="bi bi-info-circle me-2" />
                      No mandatory skills added yet. Sync from the must-have list or add skills manually above.
                    </Alert>
                  )}
                </div>

                <div className="d-flex justify-content-end gap-2">
                  <Button
                    variant="outline-secondary"
                    onClick={() => router.push('/jobs')}
                    disabled={loading || runningProfile}
                    type="button"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline-primary"
                    onClick={handleRunProfile}
                    disabled={runningProfile || loading}
                    type="button"
                  >
                    {runningProfile ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Running AI...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-stars me-2"></i>
                        {profileGenerated ? 'Re-run AI Profile' : 'Run AI Profile'}
                      </>
                    )}
                  </Button>
                  {profileGenerated && (
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
                  )}
                </div>
              </Form>
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
}
