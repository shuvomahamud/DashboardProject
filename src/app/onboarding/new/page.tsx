"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Row, Col, Card, Form, Button, Navbar, Nav, Alert } from 'react-bootstrap';
import Link from 'next/link';

interface FieldData {
  fieldname: string;
  detailsvalue: string;
  owner: string;
  notes: string;
  dateutc: string;
}

export default function NewOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidatename, setCandidatename] = useState('');
  const [fieldData, setFieldData] = useState<FieldData[]>([
    { fieldname: '', detailsvalue: '', owner: '', notes: '', dateutc: '' }
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          candidatename,
          fieldData: fieldData.filter(field => field.fieldname.trim() !== '')
        }),
      });

      if (response.ok) {
        router.push('/onboarding');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create onboarding');
      }
    } catch (err) {
      setError('An error occurred while creating the onboarding');
    } finally {
      setLoading(false);
    }
  };

  const addFieldData = () => {
    setFieldData([...fieldData, { fieldname: '', detailsvalue: '', owner: '', notes: '', dateutc: '' }]);
  };

  const removeFieldData = (index: number) => {
    setFieldData(fieldData.filter((_, i) => i !== index));
  };

  const updateFieldData = (index: number, field: keyof FieldData, value: string) => {
    const updated = [...fieldData];
    updated[index][field] = value;
    setFieldData(updated);
  };

  return (
    <Container className="mt-4">
        <Row>
          <Col>
            <div className="d-flex align-items-center mb-4">
              <Link href="/onboarding" className="btn btn-outline-secondary me-3">
                ← Back to Onboarding
              </Link>
              <h1>Create New Onboarding</h1>
            </div>
          </Col>
        </Row>

        <Row>
          <Col md={10}>
            <Card>
              <Card.Body>
                {error && (
                  <Alert variant="danger" className="mb-3">
                    {error}
                  </Alert>
                )}

                <Form onSubmit={handleSubmit}>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Candidate Name *</Form.Label>
                        <Form.Control
                          type="text"
                          value={candidatename}
                          onChange={(e) => setCandidatename(e.target.value)}
                          required
                          placeholder="Enter candidate name"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <hr className="my-4" />
                  
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5>Onboarding Field Data</h5>
                    <Button variant="outline-primary" onClick={addFieldData}>
                      Add Field
                    </Button>
                  </div>

                  {fieldData.map((field, index) => (
                    <Card key={index} className="mb-3">
                      <Card.Header className="d-flex justify-content-between align-items-center">
                        <h6 className="mb-0">Field Data #{index + 1}</h6>
                        {fieldData.length > 1 && (
                          <Button 
                            variant="outline-danger" 
                            size="sm"
                            onClick={() => removeFieldData(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </Card.Header>
                      <Card.Body>
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Field Name</Form.Label>
                              <Form.Control
                                type="text"
                                value={field.fieldname}
                                onChange={(e) => updateFieldData(index, 'fieldname', e.target.value)}
                                placeholder="Enter field name"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Owner</Form.Label>
                              <Form.Control
                                type="text"
                                value={field.owner}
                                onChange={(e) => updateFieldData(index, 'owner', e.target.value)}
                                placeholder="Enter owner"
                              />
                            </Form.Group>
                          </Col>
                        </Row>

                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Details Value</Form.Label>
                              <Form.Control
                                as="textarea"
                                rows={3}
                                value={field.detailsvalue}
                                onChange={(e) => updateFieldData(index, 'detailsvalue', e.target.value)}
                                placeholder="Enter details value"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Notes</Form.Label>
                              <Form.Control
                                as="textarea"
                                rows={3}
                                value={field.notes}
                                onChange={(e) => updateFieldData(index, 'notes', e.target.value)}
                                placeholder="Enter notes"
                              />
                            </Form.Group>
                          </Col>
                        </Row>

                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Date UTC</Form.Label>
                              <Form.Control
                                type="datetime-local"
                                value={field.dateutc}
                                onChange={(e) => updateFieldData(index, 'dateutc', e.target.value)}
                              />
                            </Form.Group>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  ))}

                  <hr className="my-4" />

                  <div className="d-flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading}
                    >
                      {loading ? 'Creating...' : 'Create Onboarding'}
                    </Button>
                    <Link href="/onboarding" className="btn btn-secondary">
                      Cancel
                    </Link>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
  );
} 