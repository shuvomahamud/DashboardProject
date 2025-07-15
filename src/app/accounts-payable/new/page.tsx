"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Row, Col, Card, Form, Button, Alert } from 'react-bootstrap';
import Link from 'next/link';

export default function NewAccountsPayablePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    StartDate: '',
    EndDate: '',
    AgencyAuthorizedUser: '',
    TaskOrderNumber: '',
    CandidateName: '',
    Region: '',
    JobTitle: '',
    SkillLevel: '',
    TotalHours: '',
    TimesheetApprovalDate: '',
    HourlyWageRateBase: '',
    MarkUpPercent: '',
    HourlyWageRateWithMarkup: '',
    TotalBilledOGSClient: '',
    PaidToVendor: '',
    VendorName: '',
    VendorHours: '',
    HoursMatchInvoice: false,
    InvoiceNumber: '',
    VendorInvoiceRemarks: '',
    VendorInvoiceDate: '',
    TimesheetsApproved: false,
    Remark: '',
    PaymentTermNet: '',
    PaymentMode: '',
    PaymentDueDate: '',
    Check: ''
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
                      <Form.Label>Start Date</Form.Label>
                      <Form.Control
                        type="date"
                        name="StartDate"
                        value={formData.StartDate}
                        onChange={handleChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>End Date</Form.Label>
                      <Form.Control
                        type="date"
                        name="EndDate"
                        value={formData.EndDate}
                        onChange={handleChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Agency / Authorized User</Form.Label>
                      <Form.Control
                        type="text"
                        name="AgencyAuthorizedUser"
                        value={formData.AgencyAuthorizedUser}
                        onChange={handleChange}
                        placeholder="Enter agency/authorized user"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Task Order Number</Form.Label>
                      <Form.Control
                        type="text"
                        name="TaskOrderNumber"
                        value={formData.TaskOrderNumber}
                        onChange={handleChange}
                        placeholder="Enter task order number"
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Candidate Name</Form.Label>
                      <Form.Control
                        type="text"
                        name="CandidateName"
                        value={formData.CandidateName}
                        onChange={handleChange}
                        placeholder="Enter candidate name"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Region</Form.Label>
                      <Form.Control
                        type="number"
                        name="Region"
                        value={formData.Region}
                        onChange={handleChange}
                        placeholder="Enter region"
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Job Title</Form.Label>
                      <Form.Control
                        type="text"
                        name="JobTitle"
                        value={formData.JobTitle}
                        onChange={handleChange}
                        placeholder="Enter job title"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Skill Level</Form.Label>
                      <Form.Control
                        type="number"
                        name="SkillLevel"
                        value={formData.SkillLevel}
                        onChange={handleChange}
                        placeholder="Enter skill level"
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Total Hours</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        name="TotalHours"
                        value={formData.TotalHours}
                        onChange={handleChange}
                        placeholder="Enter total hours"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Timesheet Approval Date</Form.Label>
                      <Form.Control
                        type="date"
                        name="TimesheetApprovalDate"
                        value={formData.TimesheetApprovalDate}
                        onChange={handleChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Hourly Wage Rate (Base)</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        name="HourlyWageRateBase"
                        value={formData.HourlyWageRateBase}
                        onChange={handleChange}
                        placeholder="Enter hourly wage rate"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Mark-up %</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        name="MarkUpPercent"
                        value={formData.MarkUpPercent}
                        onChange={handleChange}
                        placeholder="Enter mark-up percentage"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Hourly Wage Rate (+ Mark-up)</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        name="HourlyWageRateWithMarkup"
                        value={formData.HourlyWageRateWithMarkup}
                        onChange={handleChange}
                        placeholder="Enter rate with markup"
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Total Billed to OGS / Client</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        name="TotalBilledOGSClient"
                        value={formData.TotalBilledOGSClient}
                        onChange={handleChange}
                        placeholder="Enter total billed amount"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Paid to Vendor</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        name="PaidToVendor"
                        value={formData.PaidToVendor}
                        onChange={handleChange}
                        placeholder="Enter amount paid to vendor"
                        required
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
                        name="VendorName"
                        value={formData.VendorName}
                        onChange={handleChange}
                        placeholder="Enter vendor name"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Hours on Vendor Invoice</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        name="VendorHours"
                        value={formData.VendorHours}
                        onChange={handleChange}
                        placeholder="Enter hours on vendor invoice"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Check
                        type="checkbox"
                        name="HoursMatchInvoice"
                        checked={formData.HoursMatchInvoice}
                        onChange={handleChange}
                        label="Hours Match Invoice"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Invoice Number</Form.Label>
                      <Form.Control
                        type="text"
                        name="InvoiceNumber"
                        value={formData.InvoiceNumber}
                        onChange={handleChange}
                        placeholder="Enter invoice number"
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Vendor Invoice Remarks</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        name="VendorInvoiceRemarks"
                        value={formData.VendorInvoiceRemarks}
                        onChange={handleChange}
                        placeholder="Enter vendor invoice remarks"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Vendor Invoice Date</Form.Label>
                      <Form.Control
                        type="date"
                        name="VendorInvoiceDate"
                        value={formData.VendorInvoiceDate}
                        onChange={handleChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Check
                        type="checkbox"
                        name="TimesheetsApproved"
                        checked={formData.TimesheetsApproved}
                        onChange={handleChange}
                        label="Timesheets Approved"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Remark</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        name="Remark"
                        value={formData.Remark}
                        onChange={handleChange}
                        placeholder="Enter remarks"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Payment Term Net</Form.Label>
                      <Form.Control
                        type="number"
                        name="PaymentTermNet"
                        value={formData.PaymentTermNet}
                        onChange={handleChange}
                        placeholder="Enter payment term net"
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Payment Mode</Form.Label>
                      <Form.Select
                        name="PaymentMode"
                        value={formData.PaymentMode}
                        onChange={handleChange}
                        required
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
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Payment Due Date</Form.Label>
                      <Form.Control
                        type="date"
                        name="PaymentDueDate"
                        value={formData.PaymentDueDate}
                        onChange={handleChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Check #</Form.Label>
                      <Form.Control
                        type="text"
                        name="Check"
                        value={formData.Check}
                        onChange={handleChange}
                        placeholder="Enter check number"
                        maxLength={20}
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