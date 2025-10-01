"use client";

import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, ProgressBar, Spinner, Alert } from 'react-bootstrap';
import { formatDistanceToNow } from 'date-fns';

interface ImportRun {
  id: string;
  jobId: number;
  jobTitle: string;
  status: string;
  progress?: number;
  processedMessages?: number;
  totalMessages?: number;
  lastError?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

interface ImportQueueSummary {
  inProgress: ImportRun | null;
  enqueued: ImportRun[];
  recentDone: ImportRun[];
}

export default function ImportQueueStatus() {
  const [summary, setSummary] = useState<ImportQueueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

  const fetchSummary = async () => {
    try {
      const response = await fetch('/api/import-email-runs/summary');
      if (!response.ok) {
        throw new Error('Failed to fetch import queue status');
      }
      const data = await response.json();
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue status');
      console.error('Error fetching import queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();

    // Poll every 3 seconds when there's activity, every 10 seconds otherwise
    const pollInterval = (summary?.inProgress || (summary?.enqueued && summary.enqueued.length > 0)) ? 3000 : 10000;

    const interval = setInterval(() => {
      fetchSummary();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [summary?.inProgress, summary?.enqueued]);

  const handleCancel = async (runId: string) => {
    if (!confirm('Are you sure you want to cancel this import?')) {
      return;
    }

    setCanceling(runId);
    try {
      const response = await fetch(`/api/import-email-runs/${runId}/cancel`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to cancel import');
      }

      // Refresh summary
      await fetchSummary();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel import');
    } finally {
      setCanceling(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      enqueued: 'secondary',
      running: 'primary',
      succeeded: 'success',
      failed: 'danger',
      canceled: 'warning'
    };
    return <Badge bg={variants[status] || 'secondary'}>{status}</Badge>;
  };

  if (loading) {
    return (
      <Card className="mb-4">
        <Card.Body className="text-center py-4">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading import queue status...
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return null; // Silently hide if there's an error (likely table doesn't exist yet)
  }

  if (!summary) {
    return null;
  }

  const hasActivity = summary.inProgress || summary.enqueued.length > 0;

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div>
          <i className="bi bi-arrow-repeat me-2"></i>
          <strong>Email Import Queue</strong>
        </div>
        {hasActivity && (
          <div className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" className="text-primary" />
            <small className="text-muted">Active</small>
          </div>
        )}
      </Card.Header>
      <Card.Body>
        {/* Warning: Items queued but worker not processing */}
        {!summary.inProgress && summary.enqueued.length > 0 && (
          <Alert variant="warning" className="mb-3">
            <div className="d-flex align-items-start">
              <i className="bi bi-exclamation-triangle-fill me-2 mt-1"></i>
              <div>
                <strong>Worker Not Running</strong>
                <p className="mb-0 small">
                  {summary.enqueued.length} job{summary.enqueued.length !== 1 ? 's' : ''} waiting to be processed.
                  Start the worker to begin processing:
                </p>
                <code className="small">npm run worker:import</code>
                <p className="mb-0 small mt-1 text-muted">
                  Or use <code>npm run dev:all</code> to start both dev server and worker together.
                </p>
              </div>
            </div>
          </Alert>
        )}

        {/* In Progress Section */}
        {summary.inProgress ? (
          <div className="mb-4">
            <h6 className="mb-3">
              <i className="bi bi-play-circle me-2"></i>
              In Progress
            </h6>
            <div className="border rounded p-3 bg-light">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <strong>{summary.inProgress.jobTitle}</strong>
                  <div className="text-muted small">
                    Job #{summary.inProgress.jobId}
                  </div>
                </div>
                <div className="d-flex gap-2 align-items-center">
                  {getStatusBadge(summary.inProgress.status)}
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleCancel(summary.inProgress!.id)}
                    disabled={canceling === summary.inProgress.id}
                  >
                    {canceling === summary.inProgress.id ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-1" />
                        Canceling...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-x-circle me-1"></i>
                        Cancel
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {summary.inProgress.progress !== undefined && (
                <div className="mb-2">
                  <ProgressBar
                    now={summary.inProgress.progress}
                    label={`${Math.round(summary.inProgress.progress)}%`}
                    variant="primary"
                    animated
                  />
                </div>
              )}

              {summary.inProgress.processedMessages !== undefined && (
                <div className="text-muted small">
                  Processed: {summary.inProgress.processedMessages}
                  {summary.inProgress.totalMessages && ` / ${summary.inProgress.totalMessages}`} messages
                </div>
              )}

              {summary.inProgress.startedAt && (
                <div className="text-muted small mt-1">
                  Started {formatDistanceToNow(new Date(summary.inProgress.startedAt), { addSuffix: true })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <h6 className="mb-3">
              <i className="bi bi-play-circle me-2"></i>
              In Progress
            </h6>
            <div className="text-muted small">No import currently running</div>
          </div>
        )}

        {/* Enqueued Section */}
        {summary.enqueued.length > 0 && (
          <div className="mb-4">
            <h6 className="mb-3">
              <i className="bi bi-clock-history me-2"></i>
              Queued ({summary.enqueued.length})
            </h6>
            {summary.enqueued.map((run) => (
              <div key={run.id} className="border rounded p-2 mb-2 bg-light">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2">
                      <strong>{run.jobTitle}</strong>
                      <Badge bg="secondary" pill>Job #{run.jobId}</Badge>
                    </div>
                    <div className="text-muted small">
                      Queued {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleCancel(run.id)}
                    disabled={canceling === run.id}
                  >
                    {canceling === run.id ? (
                      <Spinner animation="border" size="sm" />
                    ) : (
                      <i className="bi bi-x-circle"></i>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Completed Section */}
        {summary.recentDone.length > 0 && (
          <div>
            <h6 className="mb-3">
              <i className="bi bi-check-circle me-2"></i>
              Recently Finished
            </h6>
            {summary.recentDone.map((run) => (
              <div key={run.id} className="border rounded p-2 mb-2">
                <div className="d-flex justify-content-between align-items-start">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2">
                      <strong>{run.jobTitle}</strong>
                      <Badge bg="secondary" pill>Job #{run.jobId}</Badge>
                      {getStatusBadge(run.status)}
                    </div>
                    {run.finishedAt && (
                      <div className="text-muted small">
                        Finished {formatDistanceToNow(new Date(run.finishedAt), { addSuffix: true })}
                      </div>
                    )}
                    {run.status === 'succeeded' && run.processedMessages !== undefined && (
                      <div className="text-muted small">
                        Processed {run.processedMessages} messages
                      </div>
                    )}
                    {run.status === 'failed' && run.lastError && (
                      <div className="text-danger small mt-1">
                        Error: {run.lastError.substring(0, 100)}
                        {run.lastError.length > 100 && '...'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasActivity && summary.recentDone.length === 0 && (
          <div className="text-center text-muted py-5">
            <i className="bi bi-cloud-download display-1 d-block mb-3 text-secondary opacity-50"></i>
            <h5 className="mb-2">No Email Imports Running</h5>
            <p className="mb-0 text-muted">
              Email imports will appear here when you click "Import Emails" on a job card.
              <br />
              The system processes one import at a time in FIFO order.
            </p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
