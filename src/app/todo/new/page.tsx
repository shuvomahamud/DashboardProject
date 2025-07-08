"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Row, Col, Card, Form, Button, Navbar, Nav, Alert } from 'react-bootstrap';
import Link from 'next/link';

export default function NewTodoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    category: '',
    taskname: '',
    triggerdate: '',
    assignedto: '',
    internalduedate: '',
    actualduedate: '',
    status: '',
    requiresfiling: false,
    filed: false,
    followupneeded: false,
    recurring: false,
    nextduedate: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/todo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/todo');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create todo');
      }
    } catch (err) {
      setError('An error occurred while creating the todo');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  return (
    <Container className="mt-4">
        <Row>
          <Col>
            <div className="d-flex align-items-center mb-4">
              <Link href="/todo" className="btn btn-outline-secondary me-3">
                ← Back to Todo List
              </Link>
              <h1>Create New Todo Task</h1>
            </div>
          </Col>
        </Row>

        <Row>
          <Col md={8}>
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
                        <Form.Label>Task Name *</Form.Label>
                        <Form.Control
                          type="text"
                          name="taskname"
                          value={formData.taskname}
                          onChange={handleChange}
                          required
                          placeholder="Enter task name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Category</Form.Label>
                        <Form.Select
                          name="category"
                          value={formData.category}
                          onChange={handleChange}
                        >
                          <option value="">Select Category</option>
                          <option value="Administrative">Administrative</option>
                          <option value="HR">HR</option>
                          <option value="Finance">Finance</option>
                          <option value="Operations">Operations</option>
                          <option value="IT">IT</option>
                          <option value="Other">Other</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Assigned To</Form.Label>
                        <Form.Control
                          type="text"
                          name="assignedto"
                          value={formData.assignedto}
                          onChange={handleChange}
                          placeholder="Enter assignee name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Status</Form.Label>
                        <Form.Select
                          name="status"
                          value={formData.status}
                          onChange={handleChange}
                        >
                          <option value="">Select Status</option>
                          <option value="Not Started">Not Started</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Pending">Pending</option>
                          <option value="Completed">Completed</option>
                          <option value="On Hold">On Hold</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>Trigger Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="triggerdate"
                          value={formData.triggerdate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>Internal Due Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="internalduedate"
                          value={formData.internalduedate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>Actual Due Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="actualduedate"
                          value={formData.actualduedate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Next Due Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="nextduedate"
                          value={formData.nextduedate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col>
                      <h6 className="mb-3">Task Options</h6>
                      <div className="row">
                        <div className="col-md-3">
                          <Form.Check
                            type="checkbox"
                            name="requiresfiling"
                            label="Requires Filing"
                            checked={formData.requiresfiling}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="col-md-3">
                          <Form.Check
                            type="checkbox"
                            name="filed"
                            label="Filed"
                            checked={formData.filed}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="col-md-3">
                          <Form.Check
                            type="checkbox"
                            name="followupneeded"
                            label="Follow-up Needed"
                            checked={formData.followupneeded}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="col-md-3">
                          <Form.Check
                            type="checkbox"
                            name="recurring"
                            label="Recurring Task"
                            checked={formData.recurring}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </Col>
                  </Row>

                  <hr className="my-4" />

                  <div className="d-flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading}
                    >
                      {loading ? 'Creating...' : 'Create Todo Task'}
                    </Button>
                    <Link href="/todo" className="btn btn-secondary">
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