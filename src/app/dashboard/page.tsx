"use client";

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Container, Row, Col, Card, Button, Navbar, Nav } from 'react-bootstrap';
import { useEffect } from 'react';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <div className="d-flex justify-content-center align-items-center min-vh-100">Loading...</div>;
  }

  if (!session) {
    return null;
  }

  return (
      <Container className="mt-4">
        <Row>
          <Col>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h1>Welcome, {session.user?.name || session.user?.email}!</h1>
              <div className="d-flex gap-2 align-items-center">
                <Button 
                  variant="outline-success" 
                  onClick={() => router.push('/csv-import')}
                >
                  📊 CSV Import
                </Button>
                {session.user?.role === 'admin' && (
                  <span className="badge bg-primary">Administrator</span>
                )}
              </div>
            </div>
          </Col>
        </Row>

        <Row>
          <Col md={6} lg={3} className="mb-4">
            <Card>
              <Card.Body>
                <Card.Title>Todo Tasks</Card.Title>
                <Card.Text>
                  Manage your todo tasks and track progress.
                </Card.Text>
                <Button 
                  variant="primary" 
                  onClick={() => router.push('/todo')}
                >
                  View Tasks
                </Button>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6} lg={3} className="mb-4">
            <Card>
              <Card.Body>
                <Card.Title>Interviews</Card.Title>
                <Card.Text>
                  Track interview schedules and candidate information.
                </Card.Text>
                <Button 
                  variant="primary" 
                  onClick={() => router.push('/interviews')}
                >
                  View Interviews
                </Button>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6} lg={3} className="mb-4">
            <Card>
              <Card.Body>
                <Card.Title>Accounts Payable</Card.Title>
                <Card.Text>
                  Manage accounts payable reports and invoices.
                </Card.Text>
                <Button 
                  variant="primary" 
                  onClick={() => router.push('/accounts-payable')}
                >
                  View Reports
                </Button>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6} lg={3} className="mb-4">
            <Card>
              <Card.Body>
                <Card.Title>Onboarding</Card.Title>
                <Card.Text>
                  Track candidate onboarding process and data.
                </Card.Text>
                <Button 
                  variant="primary" 
                  onClick={() => router.push('/onboarding')}
                >
                  View Onboarding
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
              </Container>
  );
} 