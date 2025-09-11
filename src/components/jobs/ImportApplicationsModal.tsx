"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Modal, Button, Form, Alert } from "react-bootstrap";
import { importEmailSchema, type ImportEmailInput } from "@/lib/validation/importEmail";

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

// super-tiny toast fallback (you can replace with your real toaster)
function toast(msg: string, type: 'success' | 'error' = 'success') {
  if (typeof window !== "undefined") {
    // Simple alert for now - can be replaced with proper toast notifications
    window.alert(msg);
  }
}

export default function ImportApplicationsModal({ jobId, open, onClose, onImported }: Props) {
  const [mailbox, setMailbox] = useState("");
  const [text, setText] = useState("");
  const [top, setTop] = useState(25);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ mailbox?: string; text?: string; top?: string }>({});

  // reset form when opened
  useEffect(() => {
    if (open) {
      setMailbox("");
      setText("");
      setTop(25);
      setErrors({});
      setSubmitting(false);
    }
  }, [open]);

  async function onDownload() {
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
      toast(
        `Imported: ${data.createdResumes} | Linked: ${data.linkedApplications} | Duplicates: ${data.skippedDuplicates} | Failed: ${data.failed}`
      );
      onImported?.(data);
      onClose();
    } catch (e: any) {
      toast(e?.message || "Import failed");
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
              placeholder="recruiting@yourdomain.com"
              isInvalid={!!errors.mailbox}
            />
            {errors.mailbox && (
              <Form.Control.Feedback type="invalid">
                {errors.mailbox}
              </Form.Control.Feedback>
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
              Default is 25 emails
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
              Downloading...
            </>
          ) : (
            "Download"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}