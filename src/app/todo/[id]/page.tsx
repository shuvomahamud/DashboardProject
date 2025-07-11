"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Container, Row, Col, Card, Button, Navbar, Nav, Alert, Badge } from 'react-bootstrap';
import Link from 'next/link';
import DateTime from '@/components/DateTime';
import BooleanBadge from '@/components/BooleanBadge';

export default function TodoDetailPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [todo, setTodo] = useState<any>(null);

  useEffect(() => {
    if (params.id) {
      fetchTodo();
    }
  }, [params.id]);

  const fetchTodo = async () => {
    try {
      const response = await fetch(`/api/todo/${params.id}`);
      if (response.ok) {
        const todoData = await response.json();
        setTodo(todoData);
      } else {
        setError('Todo not found');
      }
    } catch (err) {
      setError('Failed to load todo');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </Container>
    );
  }

  if (error || !todo) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">{error}</Alert>
        <Link href="/todo" className="btn btn-primary">Back to Todo List</Link>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
        <Row>
          <Col>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div className="d-flex align-items-center">
                <Link href="/todo" className="btn btn-outline-secondary me-3">
                  ← Back to Todo List
                </Link>
                <h1>Todo Task Details</h1>
              </div>
              <div className="d-flex gap-2">
                <Link href={`/todo/${todo.taskid}/edit`} className="btn btn-primary">
                  Edit Task
                </Link>
              </div>
            </div>
          </Col>
        </Row>

        <Row>
          <Col lg={8}>
            <Card>
              <Card.Header>
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">Task Information</h5>
                  <Badge bg="secondary">ID: {todo.taskid}</Badge>
                </div>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={6}>
                    <div className="mb-3">
                      <strong>Task Name:</strong>
                      <div className="mt-1">{todo.taskname || 'N/A'}</div>
                    </div>
                  </Col>
                  <Col md={6}>
                    <div className="mb-3">
                      <strong>Category:</strong>
                      <div className="mt-1">
                        {todo.category ? (
                          <Badge bg="info">{todo.category}</Badge>
                        ) : (
                          'N/A'
                        )}
                      </div>
                    </div>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <div className="mb-3">
                      <strong>Assigned To:</strong>
                      <div className="mt-1">{todo.assignedto || 'N/A'}</div>
                    </div>
                  </Col>
                  <Col md={6}>
                    <div className="mb-3">
                      <strong>Status:</strong>
                      <div className="mt-1">
                        {todo.status ? (
                          <Badge bg={
                            todo.status === 'Completed' ? 'success' :
                            todo.status === 'In Progress' ? 'warning' :
                            todo.status === 'On Hold' ? 'danger' :
                            'secondary'
                          }>
                            {todo.status}
                          </Badge>
                        ) : (
                          'N/A'
                        )}
                      </div>
                    </div>
                  </Col>
                </Row>

                <hr />

                <h6 className="mb-3">Important Dates</h6>
                <Row>
                  <Col md={4}>
                    <div className="mb-3">
                      <strong>Trigger Date:</strong>
                      <div className="mt-1"><DateTime value={todo.triggerdate} /></div>
                    </div>
                  </Col>
                  <Col md={4}>
                    <div className="mb-3">
                      <strong>Internal Due Date:</strong>
                      <div className="mt-1"><DateTime value={todo.internalduedate} /></div>
                    </div>
                  </Col>
                  <Col md={4}>
                    <div className="mb-3">
                      <strong>Actual Due Date:</strong>
                      <div className="mt-1"><DateTime value={todo.actualduedate} /></div>
                    </div>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <div className="mb-3">
                      <strong>Next Due Date:</strong>
                      <div className="mt-1"><DateTime value={todo.nextduedate} /></div>
                    </div>
                  </Col>
                </Row>

                <hr />

                <h6 className="mb-3">Task Options</h6>
                <Row>
                  <Col md={3}>
                    <div className="mb-3">
                      <strong>Requires Filing:</strong>
                      <div className="mt-1"><BooleanBadge value={todo.requiresfiling} /></div>
                    </div>
                  </Col>
                  <Col md={3}>
                    <div className="mb-3">
                      <strong>Filed:</strong>
                      <div className="mt-1"><BooleanBadge value={todo.filed} /></div>
                    </div>
                  </Col>
                  <Col md={3}>
                    <div className="mb-3">
                      <strong>Follow-up Needed:</strong>
                      <div className="mt-1"><BooleanBadge value={todo.followupneeded} /></div>
                    </div>
                  </Col>
                  <Col md={3}>
                    <div className="mb-3">
                      <strong>Recurring Task:</strong>
                      <div className="mt-1"><BooleanBadge value={todo.recurring} /></div>
                    </div>
                  </Col>
                </Row>

                {todo.note && (
                  <>
                    <hr />
                    <h6 className="mb-3">Notes</h6>
                    <div className="bg-light p-3 rounded">
                      <pre className="mb-0" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                        {todo.note}
                      </pre>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={4}>
            <Card>
              <Card.Header>
                <h6 className="mb-0">Quick Actions</h6>
              </Card.Header>
              <Card.Body>
                <div className="d-grid gap-2">
                  <Link href={`/todo/${todo.taskid}/edit`} className="btn btn-primary">
                    Edit This Task
                  </Link>
                  <hr />
                  <Link href="/todo/new" className="btn btn-success">
                    Create New Task
                  </Link>
                  <Link href="/todo" className="btn btn-outline-secondary">
                    View All Tasks
                  </Link>
                </div>
              </Card.Body>
            </Card>

            <Card className="mt-3">
              <Card.Header>
                <h6 className="mb-0">Task Summary</h6>
              </Card.Header>
              <Card.Body>
                <div className="small">
                  <div className="d-flex justify-content-between">
                    <span>Task ID:</span>
                    <strong>{todo.taskid}</strong>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Category:</span>
                    <strong>{todo.category || 'None'}</strong>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Status:</span>
                    <strong>{todo.status || 'None'}</strong>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Priority Tasks:</span>
                    <strong>
                      {[
                        todo.requiresfiling && 'Filing Required',
                        todo.followupneeded && 'Follow-up Needed',
                        todo.recurring && 'Recurring'
                      ].filter(Boolean).length || 'None'}
                    </strong>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
  );
} 