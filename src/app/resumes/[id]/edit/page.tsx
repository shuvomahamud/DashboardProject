"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Row,
  Spinner
} from "react-bootstrap";

type ResumeData = {
  id: number;
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  totalExperienceY: number | null;
  skills: string | null;
  experience: string | null;
  education: string | null;
  contactInfo: string | null;
  aiSummary: string | null;
  companies: string | null;
  employmentHistoryJson: string | null;
  sourceFrom: string | null;
};

type FormState = {
  candidateName: string;
  email: string;
  phone: string;
  totalExperienceY: string;
  skills: string;
  experience: string;
  education: string;
  contactInfo: string;
  aiSummary: string;
  companies: string;
  employmentHistoryJson: string;
  sourceFrom: string;
};

const defaultFormState: FormState = {
  candidateName: "",
  email: "",
  phone: "",
  totalExperienceY: "",
  skills: "",
  experience: "",
  education: "",
  contactInfo: "",
  aiSummary: "",
  companies: "",
  employmentHistoryJson: "",
  sourceFrom: ""
};

const ResumeEditPage = () => {
  const params = useParams();
  const router = useRouter();
  const resumeId = params?.id as string | undefined;

  const [form, setForm] = useState<FormState>(defaultFormState);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const formatJsonIfPossible = (value: string | null | undefined) => {
    if (!value) return "";
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  };

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
      setForm({
        candidateName: data.candidateName || "",
        email: data.email || "",
        phone: data.phone || "",
        totalExperienceY:
          typeof data.totalExperienceY === "number"
            ? String(data.totalExperienceY)
            : "",
        skills: data.skills || "",
        experience: data.experience || "",
        education: data.education || "",
        contactInfo: data.contactInfo || "",
        aiSummary: data.aiSummary || "",
        companies: data.companies || "",
        employmentHistoryJson: formatJsonIfPossible(data.employmentHistoryJson),
        sourceFrom: data.sourceFrom || ""
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resume");
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    loadResume();
  }, [loadResume]);

  const handleChange = useCallback(
    (field: keyof FormState, value: string) => {
      setForm((prev) => ({
        ...prev,
        [field]: value
      }));
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!resumeId) return;
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      setFieldErrors({});

      const errors: Record<string, string> = {};

      let normalisedEmploymentHistory: string | null = null;
      if (form.employmentHistoryJson.trim()) {
        try {
          const parsed = JSON.parse(form.employmentHistoryJson);
          normalisedEmploymentHistory = JSON.stringify(parsed, null, 2);
        } catch {
          errors.employmentHistoryJson = "Employment history must be valid JSON.";
        }
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setSubmitting(false);
        return;
      }

      try {
        const payload: Record<string, any> = {
          candidateName: form.candidateName || null,
          email: form.email || null,
          phone: form.phone || null,
          skills: form.skills || null,
          experience: form.experience || null,
          education: form.education || null,
          contactInfo: form.contactInfo || null,
          aiSummary: form.aiSummary || null,
          companies: form.companies || null,
          employmentHistoryJson: normalisedEmploymentHistory,
          sourceFrom: form.sourceFrom || null,
          totalExperienceY:
            form.totalExperienceY.trim() === ""
              ? null
              : Number(form.totalExperienceY)
        };

        const response = await fetch(`/api/resumes/${resumeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to update resume");
        }

        setSuccess("Candidate updated successfully.");
        setTimeout(() => {
          router.push(`/resumes/${resumeId}`);
        }, 800);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update resume");
      } finally {
        setSubmitting(false);
      }
    },
    [resumeId, form, router]
  );

  if (loading) {
    return (
      <div className="container mt-4 text-center">
        <Spinner animation="border" />
        <p className="mt-2">Loading candidate...</p>
      </div>
    );
  }

  if (error && !submitting && !success) {
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

  return (
    <div className="container mt-4" style={{ maxWidth: "900px" }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 fw-bold mb-1">Edit Candidate</h1>
          <p className="text-muted mb-0">
            Update the candidate details and save changes.
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            onClick={() => router.push(`/resumes/${resumeId}`)}
          >
            Cancel
          </Button>
          <Link href={`/resumes/${resumeId}`} className="btn btn-outline-primary">
            View Profile
          </Link>
        </div>
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-4">
          {success && (
            <Alert variant="success" onClose={() => setSuccess(null)} dismissible>
              {success}
            </Alert>
          )}
          {error && (
            <Alert variant="danger" onClose={() => setError(null)} dismissible>
              {error}
            </Alert>
          )}

          <Form onSubmit={handleSubmit}>
            <Row className="gy-3">
              <Col md={6}>
                <Form.Group controlId="candidateName">
                  <Form.Label>Candidate Name</Form.Label>
                  <Form.Control
                    value={form.candidateName}
                    onChange={(e) => handleChange("candidateName", e.target.value)}
                    placeholder="e.g., Jane Doe"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="email">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="candidate@example.com"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="phone">
                  <Form.Label>Phone</Form.Label>
                  <Form.Control
                    value={form.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+1 555 123 4567"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="totalExperienceY">
                  <Form.Label>Total Experience (years)</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.totalExperienceY}
                    onChange={(e) => handleChange("totalExperienceY", e.target.value)}
                    placeholder="e.g., 6"
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="skills">
                  <Form.Label>Skills</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={form.skills}
                    onChange={(e) => handleChange("skills", e.target.value)}
                    placeholder="Comma separated skills or short summary"
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="experience">
                  <Form.Label>Experience Summary</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={form.experience}
                    onChange={(e) => handleChange("experience", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="education">
                  <Form.Label>Education</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={form.education}
                    onChange={(e) => handleChange("education", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="contactInfo">
                  <Form.Label>Contact Info (JSON or text)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={form.contactInfo}
                    onChange={(e) => handleChange("contactInfo", e.target.value)}
                    placeholder="Additional contact info or parsed JSON"
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="aiSummary">
                  <Form.Label>AI Summary</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={form.aiSummary}
                    onChange={(e) => handleChange("aiSummary", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="companies">
                  <Form.Label>Companies (CSV)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={form.companies}
                    onChange={(e) => handleChange("companies", e.target.value)}
                    placeholder="Company A, Company B"
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="employmentHistoryJson">
                  <Form.Label>Employment History (JSON)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    value={form.employmentHistoryJson}
                    onChange={(e) =>
                      handleChange("employmentHistoryJson", e.target.value)
                    }
                    placeholder="JSON representation of employment history"
                    isInvalid={Boolean(fieldErrors.employmentHistoryJson)}
                  />
                  {fieldErrors.employmentHistoryJson && (
                    <Form.Control.Feedback type="invalid">
                      {fieldErrors.employmentHistoryJson}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="sourceFrom">
                  <Form.Label>Source From</Form.Label>
                  <Form.Control
                    value={form.sourceFrom}
                    onChange={(e) => handleChange("sourceFrom", e.target.value)}
                    placeholder="e.g., inbox@company.com"
                  />
                </Form.Group>
              </Col>
            </Row>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <Button
                variant="outline-secondary"
                onClick={() => router.push(`/resumes/${resumeId}`)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      className="me-2"
                    />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default ResumeEditPage;
