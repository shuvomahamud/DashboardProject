"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Row, Col, Card, Form, Button, Navbar, Nav, Alert } from 'react-bootstrap';
import Link from 'next/link';

export default function NewAccountsPayablePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    startenddate: '',
    agency: '',
    taskordernumber: '',
    candidatename: '',
    region: '',
    jobtitle: '',
    skilllevel: '',
    totalhours: '',
    timesheetapprovaldate: '',
    hourlywagerate: '',
    vendorname: '',
    invoicenumber: '',
    invoicedate: '',
    paymentmode: '',
    paymentduedate: '',
    monthyear: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/accounts-payable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/accounts-payable');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create AP report');
      }
    } catch (err) {
      setError('An error occurred while creating the AP report');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <Container className="mt-4">
        <Row>
          <Col>
            <div className="d-flex align-items-center mb-4">
              <Link href="/accounts-payable" className="btn btn-outline-secondary me-3">
                ← Back to Accounts Payable
              </Link>
              <h1>Create New AP Report</h1>
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
                        <Form.Label>Start/End Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="startenddate"
                          value={formData.startenddate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Agency</Form.Label>
                        <Form.Control
                          type="text"
                          name="agency"
                          value={formData.agency}
                          onChange={handleChange}
                          placeholder="Enter agency name"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Task Order Number</Form.Label>
                        <Form.Control
                          type="text"
                          name="taskordernumber"
                          value={formData.taskordernumber}
                          onChange={handleChange}
                          placeholder="Enter task order number"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Candidate Name</Form.Label>
                        <Form.Control
                          type="text"
                          name="candidatename"
                          value={formData.candidatename}
                          onChange={handleChange}
                          placeholder="Enter candidate name"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Region</Form.Label>
                        <Form.Control
                          type="number"
                          name="region"
                          value={formData.region}
                          onChange={handleChange}
                          placeholder="Enter region number"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Job Title</Form.Label>
                        <Form.Control
                          type="text"
                          name="jobtitle"
                          value={formData.jobtitle}
                          onChange={handleChange}
                          placeholder="Enter job title"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Skill Level</Form.Label>
                        <Form.Control
                          type="number"
                          name="skilllevel"
                          value={formData.skilllevel}
                          onChange={handleChange}
                          placeholder="Enter skill level"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Total Hours</Form.Label>
                        <Form.Control
                          type="number"
                          step="0.01"
                          name="totalhours"
                          value={formData.totalhours}
                          onChange={handleChange}
                          placeholder="Enter total hours"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Timesheet Approval Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="timesheetapprovaldate"
                          value={formData.timesheetapprovaldate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Hourly Wage Rate</Form.Label>
                        <Form.Control
                          type="number"
                          step="0.01"
                          name="hourlywagerate"
                          value={formData.hourlywagerate}
                          onChange={handleChange}
                          placeholder="Enter hourly wage rate"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Vendor Name</Form.Label>
                        <Form.Control
                          type="text"
                          name="vendorname"
                          value={formData.vendorname}
                          onChange={handleChange}
                          placeholder="Enter vendor name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Invoice Number</Form.Label>
                        <Form.Control
                          type="text"
                          name="invoicenumber"
                          value={formData.invoicenumber}
                          onChange={handleChange}
                          placeholder="Enter invoice number"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Invoice Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="invoicedate"
                          value={formData.invoicedate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Payment Mode</Form.Label>
                        <Form.Select
                          name="paymentmode"
                          value={formData.paymentmode}
                          onChange={handleChange}
                        >
                          <option value="">Select Payment Mode</option>
                          <option value="Check">Check</option>
                          <option value="Wire Transfer">Wire Transfer</option>
                          <option value="ACH">ACH</option>
                          <option value="Credit Card">Credit Card</option>
                          <option value="Cash">Cash</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Payment Due Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="paymentduedate"
                          value={formData.paymentduedate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Month/Year</Form.Label>
                        <Form.Control
                          type="text"
                          name="monthyear"
                          value={formData.monthyear}
                          onChange={handleChange}
                          placeholder="MM/YYYY"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <hr className="my-4" />

                  <div className="d-flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading}
                    >
                      {loading ? 'Creating...' : 'Create AP Report'}
                    </Button>
                    <Link href="/accounts-payable" className="btn btn-secondary">
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