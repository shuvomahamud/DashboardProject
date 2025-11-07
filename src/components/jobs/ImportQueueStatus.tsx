"use client";

import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, ProgressBar, Spinner, Alert } from 'react-bootstrap';
import { formatDistanceToNow } from 'date-fns';
import type { ImportRunSummary } from '@/types/importQueue';

interface ImportRun {
  id: string;
  jobId: number;
  jobTitle: string;
  status: string;
  progress?: number;
  processedMessages?: number;
  totalMessages?: number;
  aiCompletedMessages?: number;
  aiTotalMessages?: number;
  lastError?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  timeTakenMs?: number | null;
  summary?: ImportRunSummary | null;
}

interface ImportQueueSummary {
  inProgress: ImportRun | null;
  enqueued: ImportRun[];
  recentDone: ImportRun[];
}

const toPercent = (value?: number) => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, numeric * 100));
};

export default function ImportQueueStatus() {
  const [summary, setSummary] = useState<ImportQueueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [clearingSummary, setClearingSummary] = useState<string | null>(null);

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

    // Poll every 10 seconds for near-real-time updates
    const pollInterval = 10 * 1000; // 10 seconds

    const interval = setInterval(() => {
      fetchSummary();
    }, pollInterval);

    return () => clearInterval(interval);
  }, []);

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

  const handleClearSummary = async (runId: string) => {
    setClearingSummary(runId);
    try {
      const response = await fetch(`/api/import-email-runs/${runId}/summary`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to clear diagnostics');
      }
      await fetchSummary();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear diagnostics');
    } finally {
      setClearingSummary(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      enqueued: 'secondary',
      running: 'primary',
      waiting_ai: 'info',
      succeeded: 'success',
      failed: 'danger',
      canceled: 'warning'
    };
    return <Badge bg={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const activeRun = summary?.inProgress ?? null;
  const activeProgressPercent = toPercent(activeRun?.progress);

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

  const formatDuration = (ms?: number | null) => {
    if (ms === null || ms === undefined) {
      return null;
    }
    if (ms <= 0) {
      return '0s';
    }
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds}s`);
    }
    return parts.join(' ');
  };

  const deriveTimeTaken = (run: ImportRun) => {
    if (run.timeTakenMs !== null && run.timeTakenMs !== undefined) {
      return run.timeTakenMs;
    }
    if (run.startedAt && run.finishedAt) {
      const started = new Date(run.startedAt).getTime();
      const finished = new Date(run.finishedAt).getTime();
      return Math.max(0, finished - started);
    }
    return null;
  };

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
        {/* Info: Items queued - cron will process */}
        {!summary.inProgress && summary.enqueued.length > 0 && (
          <Alert variant="info" className="mb-3">
            <div className="d-flex align-items-start">
              <i className="bi bi-info-circle-fill me-2 mt-1"></i>
              <div>
                <strong>Queued for Processing</strong>
                <p className="mb-0 small">
                  {summary.enqueued.length} job{summary.enqueued.length !== 1 ? 's' : ''} queued.
                  Processing will begin automatically (FIFO order).
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
                    now={activeProgressPercent}
                    label={`${Math.round(activeProgressPercent)}%`}
                    variant="primary"
                    animated
                  />
                </div>
              )}

              <div className="text-muted small">
                Emails processed (10%): {summary.inProgress.processedMessages ?? 0}
                {summary.inProgress.totalMessages
                  ? ` / ${summary.inProgress.totalMessages}`
                  : ''}
              </div>
              <div className="text-muted small">
                AI responses saved (90%): {summary.inProgress.aiCompletedMessages ?? 0}
                {summary.inProgress.aiTotalMessages
                  ? ` / ${summary.inProgress.aiTotalMessages}`
                  : ''}
              </div>

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
            {summary.recentDone.map((run) => {
              const timeTakenLabel = formatDuration(deriveTimeTaken(run));
              return (
                <div key={run.id} className="border rounded p-2 mb-2">
                  <div className="d-flex justify-content-between align-items-start gap-2">
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
                      {timeTakenLabel && (
                        <div className="text-muted small">
                          Time Taken: {timeTakenLabel}
                        </div>
                      )}
                      {run.processedMessages !== undefined && (
                        <div className="text-muted small">
                          Processed {run.processedMessages} messages
                        </div>
                      )}
                      <div className="text-muted small">
                        AI responses saved: {run.aiCompletedMessages ?? 0}
                        {run.aiTotalMessages ? ` / ${run.aiTotalMessages}` : ''}
                      </div>
                      {run.status === 'failed' && run.lastError && (
                        <div className="text-danger small mt-1">
                          Error: {run.lastError.substring(0, 100)}
                          {run.lastError.length > 100 && '...'}
                        </div>
                      )}
                      {run.summary && (
                        <details className="small mt-2">
                          <summary>Diagnostics</summary>
                          <div className="mt-2">
                            <div>
                              Total messages: {run.summary.totals.totalMessages ?? '—'} | Processed:{' '}
                              {run.summary.totals.processedMessages} | Failed:{' '}
                              {run.summary.totals.failedMessages}
                            </div>
                            {run.summary.resumeParsing.failed > 0 && (
                              <div className="text-danger mt-1">
                                <strong>Resume parsing failed ({run.summary.resumeParsing.failed}):</strong>
                                <ul className="mb-1">
                                  {run.summary.resumeParsing.failedResumes.map((entry, idx) => (
                                    <li key={`fail-${run.id}-${entry.resumeId ?? idx}`}>
                                      Resume #{entry.resumeId ?? 'unknown'} ({entry.status}) –{' '}
                                      {entry.error || 'Unknown error'}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {run.summary.resumeParsing.retryResumes.length > 0 && (
                              <div className="text-warning mt-1">
                                <strong>
                                  Pending retries ({run.summary.resumeParsing.retryResumes.length}):
                                </strong>
                                <ul className="mb-1">
                                  {run.summary.resumeParsing.retryResumes.map((entry, idx) => (
                                    <li key={`retry-${run.id}-${entry.resumeId ?? idx}`}>
                                      Resume #{entry.resumeId ?? 'unknown'} – pending retry
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {run.summary.itemFailures.length > 0 && (
                              <div className="text-muted mt-1">
                                <strong>Email failures:</strong>
                                <ul className="mb-1">
                                  {run.summary.itemFailures.map((item, idx) => (
                                    <li key={`item-${run.id}-${item.messageId}-${idx}`}>
                                      {item.messageId}: {item.error || 'Unknown error'}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {run.summary.warnings.length > 0 && (
                              <div className="text-warning mt-1">
                                <strong>Warnings:</strong>
                                <ul className="mb-0">
                                  {run.summary.warnings.map((warning, idx) => (
                                    <li key={`warning-${run.id}-${idx}`}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                    {run.summary && (
                      <div className="flex-shrink-0">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => handleClearSummary(run.id)}
                          disabled={clearingSummary === run.id}
                        >
                          {clearingSummary === run.id ? (
                            <>
                              <Spinner animation="border" size="sm" className="me-1" />
                              Clearing...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-trash me-1"></i>
                              Clear Diagnostics
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
