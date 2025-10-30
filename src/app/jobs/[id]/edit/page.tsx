"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Form, Button, Card, Row, Col, Alert, Spinner, Badge } from 'react-bootstrap';
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
  mandatorySkillRequirements?: MandatorySkillRequirement[] | null;
}

interface JobProfile {
  version?: string;
  summary: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
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

const coerceMandatorySkillRequirements = (input: unknown): MandatorySkillRequirement[] => {
  if (!input) return [];

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return coerceMandatorySkillRequirements(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const result: MandatorySkillRequirement[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const skill = typeof record.skill === 'string' ? record.skill.trim() : '';
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    const monthsRaw = Number(record.requiredMonths ?? record.months ?? 0);
    const months = Number.isFinite(monthsRaw) && monthsRaw >= 0 ? Math.min(1200, Math.round(monthsRaw)) : 0;
    result.push({ skill, requiredMonths: months });
    seen.add(key);
    if (result.length >= 30) break;
  }
  return result;
};

interface MandatorySkillRequirement {
  skill: string;
  requiredMonths: number;
}


const extractSuggestedMonths = (skill: string, context: string): number | null => {
  if (!skill || !context) return null;
  const normalizedContext = context.toLowerCase();
  const normalizedSkill = skill.toLowerCase();

  const windows: Array<[number, number]> = [];
  let index = normalizedContext.indexOf(normalizedSkill);
  while (index !== -1) {
    windows.push([Math.max(0, index - 80), Math.min(normalizedContext.length, index + normalizedSkill.length + 80)]);
    index = normalizedContext.indexOf(normalizedSkill, index + normalizedSkill.length);
  }
  if (windows.length === 0) {
    windows.push([0, Math.min(normalizedContext.length, 200)]);
  }

  const evaluateSnippet = (snippet: string): number | null => {
    const patterns = [
      /(\d{1,2})\s*\+?\s*(years?|yrs?|yr|y)\b/g,
      /(\d{1,2})\s*\+?\s*(months?|mos?|mo)\b/g,
      /(\d{1,2})\s*-\s*year\b/g
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(snippet)) !== null) {
        const raw = Number(match[1]);
        if (!Number.isFinite(raw)) continue;
        const token = (match[2] ?? '').toLowerCase();
        const months = /year|yr|y/.test(token) ? raw * 12 : raw;
        if (months > 0) {
          return Math.min(1200, Math.max(1, months));
        }
      }
    }
    return null;
  };

  for (const [start, end] of windows) {
    const snippet = normalizedContext.slice(start, end);
    const months = evaluateSnippet(snippet);
    if (months !== null) {
      return months;
    }
  }

  return null;
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
  const [mandatorySkills, setMandatorySkills] = useState<MandatorySkillRequirement[]>([]);
  const [aiMustHaveSkills, setAiMustHaveSkills] = useState<string[]>([]);
  const [addingMandatorySkill, setAddingMandatorySkill] = useState(false);
  const [newMandatorySkill, setNewMandatorySkill] = useState('');
  const [newMandatoryMonths, setNewMandatoryMonths] = useState('');

  const listToMultiline = (items?: string[] | null) =>
    items && items.length > 0 ? items.join('\n') : '';

  const multilineToList = (value: string) =>
    value
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(item => item.length > 0);

  const normalizeSkillKey = (value: string) => value.trim().toLowerCase();

  const computeDefaultMonths = (profile: JobProfile | null | undefined) => {
    const years =
      (typeof profile?.requiredExperienceYears === 'number' && profile.requiredExperienceYears > 0
        ? profile.requiredExperienceYears
        : null) ??
      (typeof profile?.preferredExperienceYears === 'number' && profile.preferredExperienceYears > 0
        ? profile.preferredExperienceYears
        : null);

    if (!years || !Number.isFinite(years)) {
      return 12;
    }

    const months = Math.round(years * 12);
    return Math.max(6, Math.min(1200, months));
  };

  const syncMandatorySkillsFromList = (
    skills: string[],
    options?: { defaultMonths?: number; contextText?: string }
  ) => {
    const defaultMonths = options?.defaultMonths ?? 0;
    const contextText = options?.contextText ?? '';
    setMandatorySkills(prev => {
      const prevMap = new Map(prev.map(item => [normalizeSkillKey(item.skill), item]));
      const next: MandatorySkillRequirement[] = [];
      for (const rawSkill of skills) {
        const skill = rawSkill.trim();
        if (!skill) continue;
        if (next.length >= 30) break;
        const existing = prevMap.get(normalizeSkillKey(skill));
        const suggestedMonths = contextText ? extractSuggestedMonths(skill, contextText) : null;
        const months = existing
          ? (existing.requiredMonths > 0 ? existing.requiredMonths : (suggestedMonths ?? defaultMonths))
          : (suggestedMonths ?? defaultMonths);
        next.push({ skill, requiredMonths: months });
      }
      return next;
    });
  };

  const handleMandatorySkillChange = (
    index: number,
    field: 'skill' | 'requiredMonths',
    value: string
  ) => {
    setMandatorySkills(prev => {
      if (!prev[index]) return prev;
      const next = [...prev];
      if (field === 'skill') {
        next[index] = {
          ...next[index],
          skill: value
        };
      } else {
        const numeric = Number(value);
        const sanitized = Number.isFinite(numeric) && numeric >= 0 ? Math.min(1200, Math.round(numeric)) : 0;
        next[index] = {
          ...next[index],
          requiredMonths: sanitized
        };
      }
      return next;
    });
  };

  const handleRemoveMandatorySkill = (index: number) => {
    setMandatorySkills(prev => prev.filter((_, idx) => idx !== index));
  };

  const resetNewMandatoryInputs = () => {
    setNewMandatorySkill('');
    setNewMandatoryMonths('');
  };

  const handleAddMandatorySkill = () => {
    const skill = newMandatorySkill.trim();
    if (!skill) {
      showToast('Skill name is required.', 'error', 4000);
      return;
    }

    const monthsNumber = (() => {
      const numeric = Number(newMandatoryMonths);
      if (!Number.isFinite(numeric) || numeric < 0) return 0;
      return Math.min(1200, Math.round(numeric));
    })();

    let additionMade = false;

    setMandatorySkills(prev => {
      const existingIndex = prev.findIndex(item => normalizeSkillKey(item.skill) === normalizeSkillKey(skill));
      if (existingIndex >= 0) {
        additionMade = true;
        const next = [...prev];
        next[existingIndex] = { skill, requiredMonths: monthsNumber };
        return next;
      }

      if (prev.length >= 30) {
        showToast('You can only add up to 30 mandatory skills.', 'warning', 4000);
        additionMade = false;
        return prev;
      }

      additionMade = true;
      return [...prev, { skill, requiredMonths: monthsNumber }];
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

  const applyProfileToForm = (profile: JobProfile | null, override?: MandatorySkillRequirement[] | null, contextOverride?: string | null) => {
    if (!profile) {
      setProfileFormData(initialProfileFormData);
      setProfileVersion('v1');
      setAiMustHaveSkills([]);
      setMandatorySkills(override && override.length > 0 ? override : []);
      return;
    }

    const mustHaveList = Array.isArray(profile.mustHaveSkills) ? profile.mustHaveSkills : [];
    setAiMustHaveSkills(mustHaveList);

    setProfileFormData({
      summary: profile.summary ?? '',
      niceToHaveSkills: listToMultiline(profile.niceToHaveSkills),
      targetTitles: listToMultiline(profile.targetTitles),
      responsibilities: listToMultiline(profile.responsibilities),
      toolsAndTech: listToMultiline(profile.toolsAndTech),
      domainKeywords: listToMultiline(profile.domainKeywords),
      certifications: listToMultiline(profile.certifications),
      disqualifiers: listToMultiline(profile.disqualifiers),
      requiredExperienceYears: profile.requiredExperienceYears != null ? String(profile.requiredExperienceYears) : '',
      preferredExperienceYears: profile.preferredExperienceYears != null ? String(profile.preferredExperienceYears) : '',
      locationConstraints: profile.locationConstraints ?? ''
    });
    setProfileVersion(profile.version ?? 'v1');

    const defaultMonths = computeDefaultMonths(profile);
    const contextText = contextOverride && contextOverride.length > 0
      ? contextOverride
      : [
          formData.description,
          formData.requirements,
          profile.summary ?? '',
          Array.isArray(profile.responsibilities) ? profile.responsibilities.join('\n') : '',
          Array.isArray(profile.toolsAndTech) ? profile.toolsAndTech.join('\n') : ''
        ]
          .filter(Boolean)
          .join('\n');

    const overrideList = override && override.length > 0 ? override : null;

    if (overrideList) {
      setMandatorySkills(overrideList);
    } else {
      syncMandatorySkillsFromList(mustHaveList, {
        defaultMonths,
        contextText
      });
    }
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
      const override = coerceMandatorySkillRequirements(job.mandatorySkillRequirements ?? null);
      const contextSource = [job.description || '', job.requirements || ''].filter(Boolean).join('\n');
      applyProfileToForm(profile, override.length > 0 ? override : null, contextSource);
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

      const override = coerceMandatorySkillRequirements(payload?.mandatorySkillRequirements ?? null);
      const contextSource = [formData.description, formData.requirements].filter(Boolean).join('\n');
      applyProfileToForm(profile, override.length > 0 ? override : null, contextSource);
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
        niceToHaveSkills: multilineToList(profileFormData.niceToHaveSkills),
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

      let mandatorySkillRequirementsPayload = mandatorySkills
        .map(item => ({
          skill: item.skill.trim(),
          requiredMonths: Math.max(0, Math.min(1200, Math.round(item.requiredMonths ?? 0)))
        }))
        .filter(item => item.skill.length > 0)
        .slice(0, 30);

      if (mandatorySkillRequirementsPayload.length === 0 && aiMustHaveSkills.length > 0) {
        mandatorySkillRequirementsPayload = aiMustHaveSkills.slice(0, 30).map(skill => ({
          skill,
          requiredMonths: 0
        }));
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
        aiJobProfile,
        aiSummary: aiJobProfile.summary,
        mandatorySkillRequirements: mandatorySkillRequirementsPayload
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
                      <h5 className="fw-semibold mb-1">Mandatory Skills & Experience Checks</h5>
                      <p className="text-muted small mb-0">
                        Add up to 30 critical skills and the minimum months of experience required. Leave months at 0 to track presence only.
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
                        <Col md={6}>
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
                        <Col md={3}>
                          <Form.Group className="mb-0">
                            <Form.Label className="small fw-semibold">Required Months</Form.Label>
                            <Form.Control
                              size="sm"
                              type="number"
                              min={0}
                              max={1200}
                              value={newMandatoryMonths}
                              onChange={(e) => setNewMandatoryMonths(e.target.value)}
                              placeholder="0"
                            />
                          </Form.Group>
                        </Col>
                        <Col md={3} className="d-flex gap-2">
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
                            <th style={{ width: '12rem' }}>Required Months</th>
                            <th style={{ width: '5rem' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {mandatorySkills.map((item, index) => (
                            <tr key={`${item.skill}-${index}`}>
                              <td className="text-muted">{index + 1}</td>
                              <td>
                                <Form.Control
                                  size="sm"
                                  type="text"
                                  value={item.skill}
                                  onChange={(e) => handleMandatorySkillChange(index, 'skill', e.target.value)}
                                />
                              </td>
                              <td>
                                <Form.Control
                                  size="sm"
                                  type="number"
                                  min={0}
                                  max={1200}
                                  value={item.requiredMonths}
                                  onChange={(e) => handleMandatorySkillChange(index, 'requiredMonths', e.target.value)}
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
                      No mandatory skills configured yet. Add skills above to define AI-enforced requirements.
                    </Alert>
                  )}
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
