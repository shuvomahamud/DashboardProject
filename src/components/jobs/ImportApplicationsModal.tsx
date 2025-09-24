"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Modal, Button, Form, Alert } from "react-bootstrap";
import { importEmailSchema, type ImportEmailInput } from "@/lib/validation/importEmail";
import { useToast } from "@/contexts/ToastContext";
import { useIsAdmin } from "@/lib/auth/useTablePermit";

type Props = {
  jobId: number;
  open: boolean;
  onClose: () => void;
  onImported?: (summary: {
    createdResumes: number;
    linkedApplications: number;
    skippedDuplicates: number;
    failed: number;
    emailsScanned: number;
  }) => void;
};

export default function ImportApplicationsModal({ jobId, open, onClose, onImported }: Props) {
  const { showToast } = useToast();
  const isAdmin = useIsAdmin();
  const [mailbox, setMailbox] = useState("");
  const [text, setText] = useState("");
  const [top, setTop] = useState(5000);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ mailbox?: string; text?: string; top?: string }>({});
  const [realTimeErrors, setRealTimeErrors] = useState<{ mailbox?: string }>({});

  // reset form when opened
  useEffect(() => {
    if (open) {
      // Fetch default mailbox from server
      fetch('/api/config/mailbox')
        .then(res => res.json())
        .then(data => setMailbox(data.mailbox || ""))
        .catch(() => setMailbox(""));
      setText("");
      setTop(5000);
      setErrors({});
      setRealTimeErrors({});
      setSubmitting(false);
    }
  }, [open]);

  // Real-time validation for mailbox domain
  useEffect(() => {
    const tenantDomain = process.env.NEXT_PUBLIC_ALLOWED_TENANT_EMAIL_DOMAIN;
    if (!mailbox.trim() || !tenantDomain) {
      setRealTimeErrors(prev => ({ ...prev, mailbox: undefined }));
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(mailbox)) {
      setRealTimeErrors(prev => ({ ...prev, mailbox: "Enter a valid email address" }));
      return;
    }

    // Domain validation
    if (!mailbox.toLowerCase().endsWith(`@${tenantDomain.toLowerCase()}`)) {
      setRealTimeErrors(prev => ({ ...prev, mailbox: `Mailbox must be in @${tenantDomain}` }));
      return;
    }

    // Clear error if validation passes
    setRealTimeErrors(prev => ({ ...prev, mailbox: undefined }));
  }, [mailbox]);


  async function onDownload() {
    // Check for real-time validation errors first
    if (realTimeErrors.mailbox) {
      setErrors({ mailbox: realTimeErrors.mailbox });
      return;
    }

    // validate
    const parse = importEmailSchema.safeParse({
      mailbox,
      text,
      top: Number.isFinite(top) ? top : 25,
    });
    if (!parse.success) {
      const fieldErrs: Record<string, string> = {};
      parse.error.issues.forEach((i) => {
        const key = i.path.join(".") || "form";
        fieldErrs[key] = i.message;
      });
      setErrors(fieldErrs);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/import-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parse.data satisfies ImportEmailInput),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Import failed");
      }

      const data = await res.json();
      // expected shape:
      // { createdResumes, linkedApplications, skippedDuplicates, failed, emailsScanned }
      showToast(
        `Import Complete! Created: ${data.createdResumes} resumes, Linked: ${data.linkedApplications} applications, Duplicates skipped: ${data.skippedDuplicates}, Failed: ${data.failed}, Emails scanned: ${data.emailsScanned}`,
        'success',
        8000  // Show for 8 seconds since it's more detailed
      );
      onImported?.(data);
      onClose();
    } catch (e: any) {
      showToast(e?.message || "Import failed", 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal show={open} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Import Applications</Modal.Title>
      </Modal.Header>
      
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>Mailbox <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="email"
              value={mailbox}
              onChange={(e) => setMailbox(e.target.value)}
              placeholder="recruiting@bnbtech-inc.com"
              isInvalid={!!(errors.mailbox || realTimeErrors.mailbox)}
              readOnly={!isAdmin}
              disabled={!isAdmin}
            />
            {(errors.mailbox || realTimeErrors.mailbox) && (
              <Form.Control.Feedback type="invalid">
                {errors.mailbox || realTimeErrors.mailbox}
              </Form.Control.Feedback>
            )}
            {!isAdmin && (
              <Form.Text className="text-muted">
                Using your logged-in email address. Only admins can modify this field.
              </Form.Text>
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Search text <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g., Senior React developer"
              isInvalid={!!errors.text}
            />
            {errors.text && (
              <Form.Control.Feedback type="invalid">
                {errors.text}
              </Form.Control.Feedback>
            )}
            <Form.Text className="text-muted">
              We will search this mailbox Inbox with: <code>hasAttachments:yes "your text"</code>
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Max emails to scan (optional)</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={200}
              value={top}
              onChange={(e) => setTop(Number(e.target.value))}
              style={{ width: '150px' }}
              isInvalid={!!errors.top}
            />
            {errors.top && (
              <Form.Control.Feedback type="invalid">
                {errors.top}
              </Form.Control.Feedback>
            )}
            <Form.Text className="text-muted">
              Default is 5,000 emails
            </Form.Text>
          </Form.Group>
        </Form>
      </Modal.Body>
      
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button 
          variant="primary" 
          onClick={onDownload} 
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Importing...
            </>
          ) : (
            "Import Applications"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}