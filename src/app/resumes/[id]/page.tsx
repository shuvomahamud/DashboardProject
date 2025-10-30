"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Modal,
  Row,
  Spinner,
  Table
} from "react-bootstrap";

type ResumeApplication = {
  id: number;
  status: string;
  appliedDate: string | null;
  job: {
    id: number;
    title: string;
    company?: {
      name: string | null;
    } | null;
  } | null;
};

type SkillExperienceEntry = {
  skill: string;
  months: number;
  confidence?: number | null;
  evidence?: string | null;
  lastUsed?: string | null;
  source?: string | null;
};

type SkillRequirementEvaluationRow = {
  skill: string;
  requiredMonths: number;
  manualMonths: number | null;
  aiMonths: number | null;
  candidateMonths: number;
  meetsRequirement: boolean;
  manualFound: boolean;
  aiFound: boolean;
  deficitMonths: number;
};

type SkillRequirementEvaluation = {
  evaluatedAt?: string;
  requirements?: Array<{ skill: string; requiredMonths: number }>;
  evaluations?: SkillRequirementEvaluationRow[];
  manualCoverageMissing?: string[];
  unmetRequirements?: string[];
  aiDetectedWithoutManual?: string[];
  allMet?: boolean;
};

type ResumeData = {
  id: number;
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  skills: string | null;
  experience: string | null;
  education: string | null;
  aiSummary: string | null;
  aiExtractJson: string | null;
  totalExperienceY: number | null;
  sourceFrom: string | null;
  companies: string | null;
  employmentHistoryJson: string | null;
  manualSkillsMatched: string[] | null;
  aiExtraSkills: string[] | null;
  manualToolsMatched: string[] | null;
  aiExtraTools: string[] | null;
  manualSkillAssessments: Array<{ skill: string; months: number | null; source?: string | null }> | null;
  aiSkillExperience: SkillExperienceEntry[] | null;
  skillRequirementEvaluation: SkillRequirementEvaluation | null;
  createdAt: string;
  updatedAt: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  rawText: string | null;
  applications: ResumeApplication[];
};

type ResumeFileResponse = {
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
};

interface MatchBreakdownRow {
  label: string;
  score: number;
  ratio: number;
  matched: number;
  available: number;
  scaledWeight: number;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const parseAiExtract = (json: string | null | undefined) => {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const coerceJson = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const parseSkillExperienceEntries = (value: unknown): SkillExperienceEntry[] => {
  const raw = coerceJson(value);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const skill = typeof entry.skill === "string" ? entry.skill.trim() : null;
      if (!skill) return null;
      const monthsValue = Number(entry.months ?? 0);
      const months = Number.isFinite(monthsValue) ? Math.max(0, Math.round(monthsValue)) : 0;
      return {
        skill,
        months,
        confidence:
          entry.confidence === null || entry.confidence === undefined
            ? null
            : Math.max(0, Math.min(1, Number(entry.confidence) || 0)),
        evidence: typeof entry.evidence === "string" ? entry.evidence : null,
        lastUsed: typeof entry.lastUsed === "string" ? entry.lastUsed : null,
        source: typeof entry.source === "string" ? entry.source : null
      } as SkillExperienceEntry;
    })
    .filter((entry): entry is SkillExperienceEntry => Boolean(entry));
};

const parseSkillRequirementEvaluation = (value: unknown): SkillRequirementEvaluation | null => {
  const raw = coerceJson(value);
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const data = raw as Record<string, unknown>;
  const evaluationsRaw = Array.isArray(data.evaluations) ? data.evaluations : [];
  const evaluations: SkillRequirementEvaluationRow[] = evaluationsRaw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const skill = typeof record.skill === "string" ? record.skill.trim() : null;
      if (!skill) return null;
      const requiredMonths = Number(record.requiredMonths ?? 0);
      const manualMonths =
        record.manualMonths === null || record.manualMonths === undefined
          ? null
          : Math.max(0, Math.round(Number(record.manualMonths) || 0));
      const aiMonths =
        record.aiMonths === null || record.aiMonths === undefined
          ? null
          : Math.max(0, Math.round(Number(record.aiMonths) || 0));
      const candidateMonths = Math.max(0, Math.round(Number(record.candidateMonths) || 0));
      const meetsRequirement = Boolean(record.meetsRequirement);
      const manualFound = Boolean(record.manualFound);
      const aiFound = Boolean(record.aiFound);
      const deficitMonths = Math.max(0, Math.round(Number(record.deficitMonths) || 0));

      return {
        skill,
        requiredMonths: Math.max(0, Math.round(requiredMonths)),
        manualMonths,
        aiMonths,
        candidateMonths,
        meetsRequirement,
        manualFound,
        aiFound,
        deficitMonths
      };
    })
    .filter((row): row is SkillRequirementEvaluationRow => Boolean(row));

  const toStringArray = (input: unknown): string[] =>
    Array.isArray(input) ? input.map((item) => String(item)).filter(Boolean) : [];

  const requirementsRaw = Array.isArray(data.requirements) ? data.requirements : [];
  const requirements = requirementsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const skill = typeof record.skill === "string" ? record.skill.trim() : null;
      if (!skill) return null;
      const requiredMonths = Number(record.requiredMonths ?? 0);
      return { skill, requiredMonths: Math.max(0, Math.round(requiredMonths)) };
    })
    .filter((item): item is { skill: string; requiredMonths: number } => Boolean(item));

  return {
    evaluatedAt: typeof data.evaluatedAt === "string" ? data.evaluatedAt : undefined,
    requirements,
    evaluations,
    manualCoverageMissing: toStringArray(data.manualCoverageMissing),
    unmetRequirements: toStringArray(data.unmetRequirements),
    aiDetectedWithoutManual: toStringArray(data.aiDetectedWithoutManual),
    allMet: Boolean(data.allMet)
  };
};

const formatMonths = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return `${value} mo`;
};

const ResumeDetailPage = () => {
  const params = useParams();
  const router = useRouter();
  const resumeId = params?.id as string | undefined;

  const [resume, setResume] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewModal, setPreviewModal] = useState<{
    show: boolean;
    url: string | null;
    loading: boolean;
    error: string | null;
    fileName: string | null;
  }>({
    show: false,
    url: null,
    loading: false,
    error: null,
    fileName: null
  });

  const loadResume = useCallback(async () => {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/resumes/${resumeId}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to load resume");
      }
      const data: ResumeData = await response.json();
      setResume(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resume");
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    loadResume();
  }, [loadResume]);

  const fetchResumeFile = useCallback(async (): Promise<ResumeFileResponse> => {
    if (!resumeId) throw new Error("Invalid resume id");
    const response = await fetch(`/api/resumes/${resumeId}/file`);
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // ignore parse errors, handled below
    }
    if (!response.ok || !data?.url) {
      throw new Error(data?.error || "Resume file unavailable");
    }
    return data as ResumeFileResponse;
  }, [resumeId]);

  const handlePreviewResume = useCallback(async () => {
    setPreviewModal({
      show: true,
      url: null,
      loading: true,
      error: null,
      fileName: null
    });
    try {
      const fileData = await fetchResumeFile();
      setPreviewModal({
        show: true,
        url: fileData.url,
        loading: false,
        error: null,
        fileName: fileData.fileName || null
      });
    } catch (err) {
      setPreviewModal({
        show: true,
        url: null,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load resume",
        fileName: null
      });
    }
  }, [fetchResumeFile]);

  const handleDownloadResume = useCallback(async () => {
    try {
      const fileData = await fetchResumeFile();
      const response = await fetch(fileData.url);
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = resumeId || "resume";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download resume");
    }
  }, [fetchResumeFile, resumeId]);

  const closePreviewModal = useCallback(() => {
    setPreviewModal({
      show: false,
      url: null,
      loading: false,
      error: null,
      fileName: null
    });
  }, []);

  const aiExtract = useMemo(() => parseAiExtract(resume?.aiExtractJson), [resume]);
  const analysis = aiExtract?.analysis;
  const scores = aiExtract?.scores;
  const matchDetails = aiExtract?.computedMatchScore;

  const matchBreakdown = useMemo<MatchBreakdownRow[]>(() => {
    if (!matchDetails?.breakdown) return [];
    return Object.values(matchDetails.breakdown).map((item: any) => ({
      label: item.label,
      score: Number(item.score ?? 0),
      ratio: Number(item.ratio ?? 0),
      matched: Number(item.matched ?? 0),
      available: Number(item.available ?? 0),
      scaledWeight: Number(item.scaledWeight ?? 0)
    }));
  }, [matchDetails]);

  const analysisSections = useMemo(() => {
    const sections: Array<{ label: string; value: string[]; type: 'analysis' | 'manual' | 'aiExtra' }> = [];
    if (analysis) {
      sections.push(
        { label: "Must-have Skills Matched", value: analysis.mustHaveSkillsMatched ?? [], type: 'analysis' },
        { label: "Must-have Skills Missing", value: analysis.mustHaveSkillsMissing ?? [], type: 'analysis' },
        { label: "Nice-to-have Skills Matched", value: analysis.niceToHaveSkillsMatched ?? [], type: 'analysis' },
        { label: "Target Titles Matched", value: analysis.targetTitlesMatched ?? [], type: 'analysis' },
        { label: "Responsibilities Matched", value: analysis.responsibilitiesMatched ?? [], type: 'analysis' },
        { label: "Tools & Technologies Matched", value: analysis.toolsAndTechMatched ?? [], type: 'analysis' },
        { label: "Domain Keywords Matched", value: analysis.domainKeywordsMatched ?? [], type: 'analysis' },
        { label: "Certifications Matched", value: analysis.certificationsMatched ?? [], type: 'analysis' },
        { label: "Disqualifiers Detected", value: analysis.disqualifiersDetected ?? [], type: 'analysis' }
      );
    }
    if (resume) {
      sections.push(
        {
          label: "Manual Skills Confirmed",
          value: Array.isArray(resume.manualSkillsMatched) ? resume.manualSkillsMatched.filter(Boolean) : [],
          type: 'manual'
        },
        {
          label: "AI Suggested Additional Skills",
          value: Array.isArray(resume.aiExtraSkills) ? resume.aiExtraSkills.filter(Boolean) : [],
          type: 'aiExtra'
        },
        {
          label: "Manual Tools & Technologies Confirmed",
          value: Array.isArray(resume.manualToolsMatched) ? resume.manualToolsMatched.filter(Boolean) : [],
          type: 'manual'
        },
        {
          label: "AI Suggested Additional Tools",
          value: Array.isArray(resume.aiExtraTools) ? resume.aiExtraTools.filter(Boolean) : [],
          type: 'aiExtra'
        }
      );
    }
    return sections;
  }, [analysis, resume]);

  const skillEvaluation = useMemo(
    () => parseSkillRequirementEvaluation(resume?.skillRequirementEvaluation),
    [resume?.skillRequirementEvaluation]
  );

  const aiSkillExperienceList = useMemo(
    () => parseSkillExperienceEntries(resume?.aiSkillExperience),
    [resume?.aiSkillExperience]
  );

  if (loading) {
    return (
      <div className="container mt-4 text-center">
        <Spinner animation="border" />
        <p className="mt-2">Loading candidate details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
          <Button variant="outline-danger" onClick={() => router.back()}>
            Back
          </Button>
        </Alert>
      </div>
    );
  }

  if (!resume) {
    return (
      <div className="container mt-4">
        <Alert variant="warning">
          <p>Resume not found</p>
          <Button variant="outline-warning" onClick={() => router.back()}>
            Back
          </Button>
        </Alert>
      </div>
    );
  }

  const headerScores: Array<{ label: string; value: number | null }> = [
    { label: "Match Score", value: scores?.matchScore ?? null },
    { label: "Company Score", value: scores?.companyScore ?? null },
    { label: "Fake Score", value: scores?.fakeScore ?? null }
  ];

  return (
    <div className="container-fluid mt-4" style={{ maxWidth: "1200px" }}>
      <div className="mb-4 bg-dark rounded p-4 shadow">
        <div className="d-flex justify-content-between align-items-start">
          <div className="flex-grow-1 text-white">
            <h1 className="h3 fw-bold mb-2">
              {resume.candidateName || "Unknown Candidate"}
            </h1>
            <div className="d-flex flex-wrap gap-3 text-white-50 mb-3">
              {resume.email && (
                <span>
                  <i className="bi bi-envelope me-1"></i>
                  {resume.email}
                </span>
              )}
              {resume.phone && (
                <span>
                  <i className="bi bi-telephone me-1"></i>
                  {resume.phone}
                </span>
              )}
              {typeof resume.totalExperienceY === "number" && (
                <span>
                  <i className="bi bi-briefcase me-1"></i>
                  {resume.totalExperienceY} yrs experience
                </span>
              )}
              {resume.sourceFrom && (
                <span>
                  <i className="bi bi-inbox me-1"></i>
                  {resume.sourceFrom}
                </span>
              )}
            </div>
            <div className="d-flex flex-wrap gap-2">
              {headerScores.map(({ label, value }) => (
                <Badge bg="secondary" key={label}>
                  {label}: {value != null ? Number(value).toFixed(0) : "—"}
                </Badge>
              ))}
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Button variant="outline-light" onClick={() => router.back()}>
              <i className="bi bi-arrow-left me-1"></i> Back
            </Button>
            <Button
              variant="outline-light"
              onClick={() => router.push(`/resumes/${resume.id}/edit`)}
            >
              <i className="bi bi-pencil me-1"></i> Edit
            </Button>
            <Button variant="light" onClick={handleDownloadResume}>
              <i className="bi bi-download me-1"></i> Download
            </Button>
            <Button variant="primary" onClick={handlePreviewResume}>
              <i className="bi bi-eye me-1"></i> View Resume
            </Button>
          </div>
        </div>
      </div>

      <Row className="g-4 mb-4">
        <Col lg={8}>
          <Card className="shadow-sm border-0">
            <Card.Header className="bg-light border-0 py-3">
              <h5 className="mb-0 fw-semibold">
                <i className="bi bi-person-lines-fill text-primary me-2"></i>
                Candidate Overview
              </h5>
            </Card.Header>
            <Card.Body className="p-4">
              <Row className="gy-3">
                <Col md={6}>
                  <h6 className="fw-semibold text-muted">Email</h6>
                  <p className="mb-0">{resume.email || "Not provided"}</p>
                </Col>
                <Col md={6}>
                  <h6 className="fw-semibold text-muted">Phone</h6>
                  <p className="mb-0">{resume.phone || "Not provided"}</p>
                </Col>
                <Col md={6}>
                  <h6 className="fw-semibold text-muted">Total Experience</h6>
                  <p className="mb-0">
                    {typeof resume.totalExperienceY === "number"
                      ? `${resume.totalExperienceY} years`
                      : "Not specified"}
                  </p>
                </Col>
                <Col md={6}>
                  <h6 className="fw-semibold text-muted">Source</h6>
                  <p className="mb-0">{resume.sourceFrom || "Not specified"}</p>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4}>
          <Card className="shadow-sm border-0 h-100">
            <Card.Header className="bg-light border-0 py-3">
              <h5 className="mb-0 fw-semibold">
                <i className="bi bi-clock-history text-primary me-2"></i>
                Metadata
              </h5>
            </Card.Header>
            <Card.Body className="p-4">
              <div className="d-flex flex-column gap-2 text-muted">
                <div>
                  <strong>Uploaded:</strong>
                  <div>{formatDate(resume.createdAt)}</div>
                </div>
                <div>
                  <strong>Updated:</strong>
                  <div>{formatDate(resume.updatedAt)}</div>
                </div>
                <div>
                  <strong>Original File:</strong>
                  <div>{resume.originalName || resume.fileName}</div>
                </div>
                <div>
                  <strong>File Size:</strong>
                  <div>{(resume.fileSize / (1024 * 1024)).toFixed(2)} MB</div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="shadow-sm border-0 mb-4">
        <Card.Header className="bg-light border-0 py-3">
          <h5 className="mb-0 fw-semibold">
            <i className="bi bi-robot text-primary me-2"></i>
            AI Summary
          </h5>
        </Card.Header>
        <Card.Body className="p-4">
          {resume.aiSummary ? (
            <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
              {resume.aiSummary}
            </p>
          ) : (
            <p className="text-muted mb-0">No AI summary available.</p>
          )}
        </Card.Body>
      </Card>

      {matchBreakdown.length > 0 && (
        <Card className="shadow-sm border-0 mb-4">
          <Card.Header className="bg-light border-0 py-3">
            <h5 className="mb-0 fw-semibold">
              <i className="bi bi-bar-chart text-primary me-2"></i>
              Match Score Breakdown
            </h5>
          </Card.Header>
          <Card.Body className="p-0">
            <Table striped hover responsive className="mb-0">
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>Matched</th>
                  <th>Available</th>
                  <th>Coverage</th>
                  <th>Weight</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {matchBreakdown.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.matched}</td>
                    <td>{row.available}</td>
                    <td>{(row.ratio * 100).toFixed(0)}%</td>
                    <td>{row.scaledWeight.toFixed(1)}</td>
                    <td>{row.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {matchDetails?.penalties?.disqualifierPenalty ? (
              <div className="p-3 text-danger">
                Disqualifier penalty applied: -{matchDetails.penalties.disqualifierPenalty} points
              </div>
            ) : null}
          </Card.Body>
        </Card>
      )}

      {analysisSections.length > 0 && (
        <Card className="shadow-sm border-0 mb-4">
          <Card.Header className="bg-light border-0 py-3">
            <h5 className="mb-0 fw-semibold">
              <i className="bi bi-list-check text-primary me-2"></i>
              Analysis Details
            </h5>
          </Card.Header>
        <Card.Body className="p-4">
          <Row className="gy-4">
            {analysisSections.map(({ label, value, type }) => (
              <Col md={6} key={label}>
                <h6 className="fw-semibold text-muted mb-2">{label}</h6>
                {Array.isArray(value) && value.length > 0 ? (
                  <div className="d-flex flex-wrap gap-2">
                    {value.map((item: string, index: number) => {
                      if (!item) return null;
                      const key = `${label}-${index}-${item}`;
                      if (type === 'manual') {
                        return (
                          <Badge bg="primary" key={key} className="fw-normal">
                            {item}
                          </Badge>
                        );
                      }
                      if (type === 'aiExtra') {
                        return (
                          <Badge
                            key={key}
                            className="fw-normal"
                            bg="light"
                            text="dark"
                            style={{ backgroundColor: '#f7d6f9', color: '#6a1a4c' }}
                          >
                            {item}
                          </Badge>
                        );
                      }
                      return (
                        <Badge bg="secondary" key={key} className="fw-normal">
                          {item}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted mb-0">Not specified</p>
                )}
              </Col>
            ))}
            </Row>
            {analysis?.notes && (
              <div className="mt-4">
                <h6 className="fw-semibold text-muted mb-2">Notes</h6>
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {analysis.notes}
                </p>
              </div>
            )}
        </Card.Body>
      </Card>
    )}

      <Card className="shadow-sm border-0 mb-4">
        <Card.Header className="bg-light border-0 py-3">
          <h5 className="mb-0 fw-semibold">
            <i className="bi bi-diagram-3 text-primary me-2"></i>
            Mandatory Skills Evaluation
          </h5>
        </Card.Header>
        <Card.Body className="p-4">
          {skillEvaluation ? (
            (skillEvaluation.evaluations && skillEvaluation.evaluations.length > 0) ? (
              <>
                <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <Badge bg={skillEvaluation.allMet ? "success" : "danger"}>
                      {skillEvaluation.allMet ? "All requirements met" : "Requirements pending"}
                    </Badge>
                    {skillEvaluation.evaluatedAt && (
                      <span className="text-muted small">
                        Evaluated {formatDate(skillEvaluation.evaluatedAt)}
                      </span>
                    )}
                  </div>
                  <div className="text-muted small">
                    {(skillEvaluation.requirements?.length ?? 0)} mandatory skill
                    {(skillEvaluation.requirements?.length ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>

                <Table hover responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Skill</th>
                      <th>Required</th>
                      <th>Manual</th>
                      <th>AI</th>
                      <th>Credited</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(skillEvaluation.evaluations ?? []).map((row) => {
                      const statusVariant = row.meetsRequirement
                        ? "success"
                        : row.requiredMonths === 0
                          ? "warning"
                          : "danger";
                      const statusLabel = row.meetsRequirement
                        ? "Met"
                        : row.requiredMonths === 0
                          ? "Not found"
                          : row.deficitMonths > 0
                            ? `Short ${row.deficitMonths} mo`
                            : "Not met";
                      return (
                        <tr key={row.skill}>
                          <td>{row.skill}</td>
                          <td>{formatMonths(row.requiredMonths)}</td>
                          <td>
                            {row.manualFound
                              ? formatMonths(row.manualMonths)
                              : <span className="text-muted">Not noted</span>}
                          </td>
                          <td>
                            {row.aiFound
                              ? formatMonths(row.aiMonths)
                              : <span className="text-muted">Not detected</span>}
                          </td>
                          <td>{formatMonths(row.candidateMonths)}</td>
                          <td>
                            <Badge bg={statusVariant}>{statusLabel}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>

                {skillEvaluation.unmetRequirements && skillEvaluation.unmetRequirements.length > 0 ? (
                  <Alert variant="danger" className="mt-3 mb-0">
                    Missing mandatory coverage: {skillEvaluation.unmetRequirements.join(", ")}
                  </Alert>
                ) : (
                  <Alert variant="success" className="mt-3 mb-0">
                    All mandatory skills meet the required experience thresholds.
                  </Alert>
                )}

                {skillEvaluation.manualCoverageMissing && skillEvaluation.manualCoverageMissing.length > 0 && (
                  <div className="mt-3 text-warning small">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    Manual review missed: {skillEvaluation.manualCoverageMissing.join(", ")}
                  </div>
                )}

                {skillEvaluation.aiDetectedWithoutManual && skillEvaluation.aiDetectedWithoutManual.length > 0 && (
                  <div className="mt-2 text-info small">
                    <i className="bi bi-lightbulb-fill me-2"></i>
                    AI detected evidence for: {skillEvaluation.aiDetectedWithoutManual.join(", ")}
                  </div>
                )}

                {aiSkillExperienceList.length > 0 && (
                  <div className="mt-4">
                    <h6 className="fw-semibold text-muted mb-2">AI Skill Experience Snapshot</h6>
                    <div className="d-flex flex-wrap gap-2">
                      {aiSkillExperienceList.slice(0, 12).map((entry) => (
                        <Badge
                          bg="secondary"
                          key={`${entry.skill}-${entry.months}`}
                          className="fw-normal"
                          title={entry.evidence || undefined}
                        >
                          {entry.skill}: {formatMonths(entry.months)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted mb-0">No mandatory skill requirements recorded for this candidate.</p>
            )
          ) : (
            <p className="text-muted mb-0">Mandatory skill evaluation is not available for this resume.</p>
          )}
        </Card.Body>
      </Card>

      <Row className="g-4 mb-4">
        <Col lg={6}>
          <Card className="shadow-sm border-0 h-100">
            <Card.Header className="bg-light border-0 py-3">
              <h5 className="mb-0 fw-semibold">
                <i className="bi bi-stars text-primary me-2"></i>
                Skills & Experience
              </h5>
            </Card.Header>
            <Card.Body className="p-4">
              <div className="mb-3">
                <h6 className="fw-semibold text-muted">Skills</h6>
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {resume.skills || "Not provided"}
                </p>
              </div>
              <div className="mb-3">
                <h6 className="fw-semibold text-muted">Experience</h6>
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {resume.experience || "Not provided"}
                </p>
              </div>
              <div>
                <h6 className="fw-semibold text-muted">Education</h6>
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {resume.education || "Not provided"}
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6}>
          <Card className="shadow-sm border-0 h-100">
            <Card.Header className="bg-light border-0 py-3">
              <h5 className="mb-0 fw-semibold">
                <i className="bi bi-briefcase text-primary me-2"></i>
                Applications
              </h5>
            </Card.Header>
            <Card.Body className="p-0">
              {resume.applications?.length ? (
                <Table hover responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resume.applications.map((app) => (
                      <tr key={app.id}>
                        <td>
                          {app.job ? (
                            <Link href={`/jobs/${app.job.id}`}>
                              {app.job.title}
                              {app.job.company?.name ? ` — ${app.job.company.name}` : ""}
                            </Link>
                          ) : (
                            "Unknown job"
                          )}
                        </td>
                        <td>
                          <Badge bg="info" text="dark">
                            {app.status}
                          </Badge>
                        </td>
                        <td>{formatDate(app.appliedDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="p-4 text-muted">
                  This candidate is not linked to any job applications yet.
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="shadow-sm border-0 mb-5">
        <Card.Header className="bg-light border-0 py-3">
          <h5 className="mb-0 fw-semibold">
            <i className="bi bi-file-earmark-text text-primary me-2"></i>
            Resume File
          </h5>
        </Card.Header>
        <Card.Body className="p-4 d-flex flex-column align-items-center gap-3">
          <div
            role="button"
            className="text-muted"
            style={{ fontSize: "4rem" }}
            title="Preview resume"
            onClick={handlePreviewResume}
          >
            <i className="bi bi-file-earmark-text" />
          </div>
          <div className="d-flex gap-3">
            <Button variant="primary" onClick={handlePreviewResume}>
              <i className="bi bi-eye me-1" />
              Preview
            </Button>
            <Button variant="outline-secondary" onClick={handleDownloadResume}>
              <i className="bi bi-download me-1" />
              Download
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Modal
        size="xl"
        centered
        show={previewModal.show}
        onHide={closePreviewModal}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Resume Preview
            {previewModal.fileName ? ` — ${previewModal.fileName}` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ minHeight: "60vh" }}>
          {previewModal.loading && (
            <div className="d-flex flex-column align-items-center justify-content-center py-5">
              <Spinner animation="border" />
              <p className="mt-3 mb-0 text-muted">Loading resume...</p>
            </div>
          )}
          {!previewModal.loading && previewModal.error && (
            <Alert variant="danger" className="mb-0">
              {previewModal.error}
            </Alert>
          )}
          {!previewModal.loading && !previewModal.error && previewModal.url && (
            <iframe
              src={previewModal.url}
              title="Resume preview"
              style={{ width: "100%", height: "70vh", border: "none" }}
            />
          )}
          {!previewModal.loading && !previewModal.error && !previewModal.url && (
            <p className="text-muted mb-0">Resume preview not available.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={handleDownloadResume}>
            Download
          </Button>
          <Button variant="secondary" onClick={closePreviewModal}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ResumeDetailPage;
