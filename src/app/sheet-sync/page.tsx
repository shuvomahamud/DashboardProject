"use client";

import { useState, useEffect } from 'react';
import { Container, Row, Col, Table, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface SheetConfig {
  [key: string]: string;
}

export default function SheetSyncPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [configs, setConfigs] = useState<SheetConfig>({});
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingRows, setSyncingRows] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const tableKeys = ['todo', 'interview', 'ap'];

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    
    fetchConfigs();
  }, [session, status, router]);

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/sheets/config');
      if (response.ok) {
        const data = await response.json();
        setConfigs(data);
      }
    } catch (error) {
      console.error('Error fetching configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tableKey: string) => {
    setEditingRows(prev => new Set(prev).add(tableKey));
  };

  const handleCancel = (tableKey: string) => {
    setEditingRows(prev => {
      const newSet = new Set(prev);
      newSet.delete(tableKey);
      return newSet;
    });
    // Reset to original value
    fetchConfigs();
  };

  const handleSave = async (tableKey: string) => {
    try {
      const response = await fetch('/api/sheets/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [tableKey]: configs[tableKey] }),
      });

      if (response.ok) {
        setEditingRows(prev => {
          const newSet = new Set(prev);
          newSet.delete(tableKey);
          return newSet;
        });
        setMessage({ type: 'success', text: `Configuration saved for ${tableKey}` });
      } else {
        setMessage({ type: 'error', text: 'Failed to save configuration' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving configuration' });
    }
  };

  const handleUrlChange = (tableKey: string, value: string) => {
    setConfigs(prev => ({
      ...prev,
      [tableKey]: value
    }));
  };

  const handleSync = async (tableKey: string) => {
    setSyncingRows(prev => new Set(prev).add(tableKey));
    
    try {
      // Use specialized todo sync endpoint for todo_list
      const endpoint = tableKey === 'todo_list' 
        ? '/api/sheets/todo/sync'
        : `/api/sheets/sync/${tableKey}`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
      });

      const data = await response.json();
      if (response.ok) {
        // Handle different response formats
        if (tableKey === 'todo_list') {
          const { inserted, updated, deleted } = data;
          setMessage({ 
            type: 'success', 
            text: `Todo List synced (${inserted} inserts, ${updated} updates, ${deleted} deletions)` 
          });
        } else {
          setMessage({ type: 'success', text: data.message });
        }
        
        // Refresh configs to update last-synced timestamp
        fetchConfigs();
      } else {
        setMessage({ type: 'error', text: data.error || 'Sync failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Sync failed - check API/network' });
    } finally {
      setSyncingRows(prev => {
        const newSet = new Set(prev);
        newSet.delete(tableKey);
        return newSet;
      });
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    
    try {
      const response = await fetch('/api/sheets/sync', {
        method: 'POST',
      });

      const data = await response.json();
      if (response.ok) {
        setMessage({ type: 'success', text: data.report });
      } else {
        setMessage({ type: 'error', text: data.error || 'Sync all failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Sync all failed - check API/network' });
    } finally {
      setSyncingAll(false);
    }
  };

  if (loading) {
    return (
      <Container className="mt-4">
        <div className="text-center">
          <Spinner animation="border" />
          <p>Loading...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <h3 className="mb-3">External Google-Sheet Links</h3>
          
          {message && (
            <Alert 
              variant={message.type === 'success' ? 'success' : 'danger'} 
              dismissible 
              onClose={() => setMessage(null)}
            >
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{message.text}</pre>
            </Alert>
          )}

          <Table bordered>
            <thead className="table-light">
              <tr>
                <th>Table</th>
                <th style={{ width: '60%' }}>URL</th>
                <th className="text-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {tableKeys.map(tableKey => {
                const isEditing = editingRows.has(tableKey);
                const isSyncing = syncingRows.has(tableKey);
                
                return (
                  <tr key={tableKey}>
                    <td className="text-capitalize">
                      {tableKey}
                      {tableKey === 'todo_list' && (
                        <span className="badge bg-info ms-2" title="Advanced sync with INSERT/UPDATE/DELETE">
                          <i className="bi bi-gear-fill"></i> Advanced
                        </span>
                      )}
                    </td>
                    <td>
                      <Form.Control
                        type="text"
                        value={configs[tableKey] || ''}
                        onChange={(e) => handleUrlChange(tableKey, e.target.value)}
                        disabled={!isEditing}
                        placeholder="Enter Google Sheets URL"
                      />
                    </td>
                    <td className="text-nowrap">
                      {!isEditing ? (
                        <>
                          <Button 
                            variant="outline-primary" 
                            size="sm" 
                            className="me-2"
                            onClick={() => handleSync(tableKey)}
                            disabled={isSyncing || !configs[tableKey]}
                            title={tableKey === 'todo_list' ? "Advanced Todo Sync (INSERT/UPDATE/DELETE)" : "Sync only this table"}
                          >
                            {isSyncing ? (
                              <Spinner as="span" animation="border" size="sm" />
                            ) : (
                              <>
                                <i className="bi bi-cloud-arrow-down"></i>
                                {tableKey === 'todo_list' && <i className="bi bi-gear-fill ms-1" style={{fontSize: '0.7em'}}></i>}
                              </>
                            )}
                          </Button>
                          <Button 
                            variant="outline-secondary" 
                            size="sm"
                            onClick={() => handleEdit(tableKey)}
                            title="Edit"
                          >
                            <i className="bi bi-pencil"></i>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button 
                            variant="outline-success" 
                            size="sm" 
                            className="me-2"
                            onClick={() => handleSave(tableKey)}
                            title="Save"
                          >
                            <i className="bi bi-check-lg"></i>
                          </Button>
                          <Button 
                            variant="outline-danger" 
                            size="sm"
                            onClick={() => handleCancel(tableKey)}
                            title="Cancel"
                          >
                            <i className="bi bi-x-lg"></i>
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <Button 
            variant="primary" 
            className="mt-3"
            onClick={handleSyncAll}
            disabled={syncingAll}
          >
            {syncingAll ? (
              <>
                <Spinner as="span" animation="border" size="sm" className="me-2" />
                Syncing...
              </>
            ) : (
              <>
                <i className="bi bi-cloud-arrow-down"></i> Sync All
              </>
            )}
          </Button>
        </Col>
      </Row>
    </Container>
  );
} 