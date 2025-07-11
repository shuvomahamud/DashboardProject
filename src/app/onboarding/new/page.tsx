"use client";

import { useState } from 'react';
import { Container, Row, Col, Button, Form, Card, Alert } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function NewOnboardingPage() {
  const [formData, setFormData] = useState({
    // Basic Information
    taskOrder: '',
    clientAgencyName: '',
    agencyNameFromForm1: '',
    recruiterName: '',
    
    // Consultant Details
    consultantName: '',
    currentLocation: '',
    consultantPhone: '',
    consultantEmail: '',
    consultantMailingAddress: '',
    hiringTerm: '',
    dob: '',
    
    // Dates & Timeline
    dateOfConfirmation: '',
    expectedOnboardingDate: '',
    actualStartDate: '',
    endDate: '',
    actualEndDate: '',
    engagementLengthMonths: '',
    
    // Financial Information
    billRateFromClient: '',
    payRateToVendor: '',
    billingTerms: '',
    
    // Vendor Information
    vendorName: '',
    vendorPocPhone: '',
    vendorPocEmail: '',
    vendorAddress: '',
    vendorFedId: '',
    
    // Forms & Documentation
    form2FormB: '',
    resumeAndForm1FormB: '',
    coreForm: '',
    onboardingLetterReceived: '',
    msaEmploymentLetter: '',
    workOrder: '',
    w9: '',
    coi: '',
    offerLetter: '',
    
    // Requirements & Compliance
    fingerPrintingRequired: '',
    backgroundCheckRequired: '',
    idDocsRequired: '',
    nonCompeteAgreement: '',
    trackSubmission: '',
    remoteLoginCredentials: '',
    telecommuting: '',
    softcopyBeforeMail: '',
    employerNameConsistency: '',
    employerNameMatchMsa: '',
    
    // Email Communications
    onboardingEmailToCandidate: '',
    onboardingEmailToVendor: '',
    
    // Onboarding Process
    firstDayInstructions: '',
    completeI9: '',
    createAccountAdp: '',
    simpleIraInclusion: '',
    uploadPayrollInfoCeipal: '',
    timesheets: '',
    trackingArrivalDetails: '',
    allVerificationsDone: '',
    allFilesUploaded: '',
    postOnboardingVendorBGC: '',
    
    // Offboarding Process
    noticePeriod: '',
    returnOfAssets: '',
    refundDeposit: '',
    closeSimpleIra: '',
    terminateEmploymentAdp: '',
    exitInterview: ''
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { data: session } = useSession();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const newRecord = await response.json();
        setSuccess('Onboarding record created successfully!');
        setTimeout(() => {
          router.push(`/onboarding/${newRecord.onboardingid}`);
        }, 2000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create onboarding record');
      }
    } catch (error) {
      setError('Error creating onboarding record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h1>Create New Onboarding Record</h1>
            <Link href="/onboarding" className="btn btn-outline-secondary">
              Back to List
            </Link>
          </div>
        </Col>
      </Row>

      {error && (
        <Row>
          <Col>
            <Alert variant="danger">{error}</Alert>
          </Col>
        </Row>
      )}

      {success && (
        <Row>
          <Col>
            <Alert variant="success">{success}</Alert>
          </Col>
        </Row>
      )}

      <Form onSubmit={handleSubmit}>
        {/* Basic Information */}
        <Row>
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Basic Information</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Task Order</Form.Label>
                  <Form.Control
                    type="text"
                    name="taskOrder"
                    value={formData.taskOrder}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Client Agency Name</Form.Label>
                  <Form.Control
                    type="text"
                    name="clientAgencyName"
                    value={formData.clientAgencyName}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Agency Name from Form1</Form.Label>
                  <Form.Control
                    type="text"
                    name="agencyNameFromForm1"
                    value={formData.agencyNameFromForm1}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Recruiter Name</Form.Label>
                  <Form.Control
                    type="text"
                    name="recruiterName"
                    value={formData.recruiterName}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>

          {/* Consultant Details */}
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Consultant Details</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Consultant Name *</Form.Label>
                  <Form.Control
                    type="text"
                    name="consultantName"
                    value={formData.consultantName}
                    onChange={handleChange}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Current Location</Form.Label>
                  <Form.Control
                    type="text"
                    name="currentLocation"
                    value={formData.currentLocation}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Phone</Form.Label>
                  <Form.Control
                    type="tel"
                    name="consultantPhone"
                    value={formData.consultantPhone}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    name="consultantEmail"
                    value={formData.consultantEmail}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Additional sections would follow the same pattern as the edit form */}
        {/* For brevity, I'll include key sections but this would mirror the edit form exactly */}

        {/* Dates & Timeline */}
        <Row>
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Dates & Timeline</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Date of Birth</Form.Label>
                  <Form.Control
                    type="date"
                    name="dob"
                    value={formData.dob}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Date of Confirmation</Form.Label>
                  <Form.Control
                    type="date"
                    name="dateOfConfirmation"
                    value={formData.dateOfConfirmation}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Expected Onboarding Date</Form.Label>
                  <Form.Control
                    type="date"
                    name="expectedOnboardingDate"
                    value={formData.expectedOnboardingDate}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Actual Start Date</Form.Label>
                  <Form.Control
                    type="date"
                    name="actualStartDate"
                    value={formData.actualStartDate}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>End Date</Form.Label>
                  <Form.Control
                    type="date"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Actual End Date</Form.Label>
                  <Form.Control
                    type="date"
                    name="actualEndDate"
                    value={formData.actualEndDate}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Engagement Length (Months)</Form.Label>
                  <Form.Control
                    type="text"
                    name="engagementLengthMonths"
                    value={formData.engagementLengthMonths}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>

          {/* Financial Information */}
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Additional Consultant Info & Financial</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Mailing Address</Form.Label>
                  <Form.Control
                    as="textarea"
                    name="consultantMailingAddress"
                    value={formData.consultantMailingAddress}
                    onChange={handleChange}
                    rows={3}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Hiring Term</Form.Label>
                  <Form.Control
                    type="text"
                    name="hiringTerm"
                    value={formData.hiringTerm}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Bill Rate from Client</Form.Label>
                  <Form.Control
                    type="text"
                    name="billRateFromClient"
                    value={formData.billRateFromClient}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Pay Rate to Vendor</Form.Label>
                  <Form.Control
                    type="text"
                    name="payRateToVendor"
                    value={formData.payRateToVendor}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Billing Terms</Form.Label>
                  <Form.Control
                    type="text"
                    name="billingTerms"
                    value={formData.billingTerms}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Vendor Information */}
        <Row>
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Vendor Information</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Vendor Name</Form.Label>
                  <Form.Control
                    type="text"
                    name="vendorName"
                    value={formData.vendorName}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Vendor POC Phone</Form.Label>
                  <Form.Control
                    type="tel"
                    name="vendorPocPhone"
                    value={formData.vendorPocPhone}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Vendor POC Email</Form.Label>
                  <Form.Control
                    type="email"
                    name="vendorPocEmail"
                    value={formData.vendorPocEmail}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Vendor Fed ID</Form.Label>
                  <Form.Control
                    type="text"
                    name="vendorFedId"
                    value={formData.vendorFedId}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Vendor Address</Form.Label>
                  <Form.Control
                    as="textarea"
                    name="vendorAddress"
                    value={formData.vendorAddress}
                    onChange={handleChange}
                    rows={3}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>

          {/* Forms & Documentation */}
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Forms & Documentation</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Form 2/Form B</Form.Label>
                  <Form.Control
                    type="text"
                    name="form2FormB"
                    value={formData.form2FormB}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Resume and Form1/Form B</Form.Label>
                  <Form.Control
                    type="text"
                    name="resumeAndForm1FormB"
                    value={formData.resumeAndForm1FormB}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Core Form</Form.Label>
                  <Form.Control
                    type="text"
                    name="coreForm"
                    value={formData.coreForm}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Onboarding Letter Received</Form.Label>
                  <Form.Control
                    type="text"
                    name="onboardingLetterReceived"
                    value={formData.onboardingLetterReceived}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>MSA Employment Letter</Form.Label>
                  <Form.Control
                    type="text"
                    name="msaEmploymentLetter"
                    value={formData.msaEmploymentLetter}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* More Forms & Documentation */}
        <Row>
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Additional Documentation</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Work Order</Form.Label>
                  <Form.Control
                    type="text"
                    name="workOrder"
                    value={formData.workOrder}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>W9</Form.Label>
                  <Form.Control
                    type="text"
                    name="w9"
                    value={formData.w9}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>COI</Form.Label>
                  <Form.Control
                    type="text"
                    name="coi"
                    value={formData.coi}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Offer Letter</Form.Label>
                  <Form.Control
                    type="text"
                    name="offerLetter"
                    value={formData.offerLetter}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>

          {/* Requirements & Compliance */}
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Requirements & Compliance</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Fingerprinting Required</Form.Label>
                  <Form.Control
                    type="text"
                    name="fingerPrintingRequired"
                    value={formData.fingerPrintingRequired}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Background Check Required</Form.Label>
                  <Form.Control
                    type="text"
                    name="backgroundCheckRequired"
                    value={formData.backgroundCheckRequired}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>ID Docs Required</Form.Label>
                  <Form.Control
                    type="text"
                    name="idDocsRequired"
                    value={formData.idDocsRequired}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Non-Compete Agreement</Form.Label>
                  <Form.Control
                    type="text"
                    name="nonCompeteAgreement"
                    value={formData.nonCompeteAgreement}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Track Submission</Form.Label>
                  <Form.Control
                    type="text"
                    name="trackSubmission"
                    value={formData.trackSubmission}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Additional Compliance */}
        <Row>
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Additional Compliance</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Remote Login Credentials</Form.Label>
                  <Form.Control
                    type="text"
                    name="remoteLoginCredentials"
                    value={formData.remoteLoginCredentials}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Telecommuting</Form.Label>
                  <Form.Control
                    type="text"
                    name="telecommuting"
                    value={formData.telecommuting}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Softcopy Before Mail</Form.Label>
                  <Form.Control
                    type="text"
                    name="softcopyBeforeMail"
                    value={formData.softcopyBeforeMail}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Employer Name Consistency</Form.Label>
                  <Form.Control
                    type="text"
                    name="employerNameConsistency"
                    value={formData.employerNameConsistency}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Employer Name Match MSA</Form.Label>
                  <Form.Control
                    type="text"
                    name="employerNameMatchMsa"
                    value={formData.employerNameMatchMsa}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>

          {/* Email Communications */}
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Email Communications</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Onboarding Email to Candidate</Form.Label>
                  <Form.Control
                    type="text"
                    name="onboardingEmailToCandidate"
                    value={formData.onboardingEmailToCandidate}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Onboarding Email to Vendor</Form.Label>
                  <Form.Control
                    type="text"
                    name="onboardingEmailToVendor"
                    value={formData.onboardingEmailToVendor}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Onboarding Process */}
        <Row>
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Onboarding Process</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>First Day Instructions</Form.Label>
                  <Form.Control
                    type="text"
                    name="firstDayInstructions"
                    value={formData.firstDayInstructions}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Complete I9</Form.Label>
                  <Form.Control
                    type="text"
                    name="completeI9"
                    value={formData.completeI9}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Create Account ADP</Form.Label>
                  <Form.Control
                    type="text"
                    name="createAccountAdp"
                    value={formData.createAccountAdp}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Simple IRA Inclusion</Form.Label>
                  <Form.Control
                    type="text"
                    name="simpleIraInclusion"
                    value={formData.simpleIraInclusion}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Upload Payroll Info Ceipal</Form.Label>
                  <Form.Control
                    type="text"
                    name="uploadPayrollInfoCeipal"
                    value={formData.uploadPayrollInfoCeipal}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>

          {/* Onboarding Process (Continued) */}
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Onboarding Process (Continued)</Card.Title>
              </Card.Header>
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Timesheets</Form.Label>
                  <Form.Control
                    type="text"
                    name="timesheets"
                    value={formData.timesheets}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Tracking Arrival Details</Form.Label>
                  <Form.Control
                    type="text"
                    name="trackingArrivalDetails"
                    value={formData.trackingArrivalDetails}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>All Verifications Done</Form.Label>
                  <Form.Control
                    type="text"
                    name="allVerificationsDone"
                    value={formData.allVerificationsDone}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>All Files Uploaded</Form.Label>
                  <Form.Control
                    type="text"
                    name="allFilesUploaded"
                    value={formData.allFilesUploaded}
                    onChange={handleChange}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Post Onboarding Vendor BGC</Form.Label>
                  <Form.Control
                    type="text"
                    name="postOnboardingVendorBGC"
                    value={formData.postOnboardingVendorBGC}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Offboarding Process */}
        <Row>
          <Col md={12}>
            <Card className="mb-4">
              <Card.Header>
                <Card.Title>Offboarding Process</Card.Title>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Notice Period</Form.Label>
                      <Form.Control
                        type="text"
                        name="noticePeriod"
                        value={formData.noticePeriod}
                        onChange={handleChange}
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Return of Assets</Form.Label>
                      <Form.Control
                        type="text"
                        name="returnOfAssets"
                        value={formData.returnOfAssets}
                        onChange={handleChange}
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Refund Deposit</Form.Label>
                      <Form.Control
                        type="text"
                        name="refundDeposit"
                        value={formData.refundDeposit}
                        onChange={handleChange}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Close Simple IRA</Form.Label>
                      <Form.Control
                        type="text"
                        name="closeSimpleIra"
                        value={formData.closeSimpleIra}
                        onChange={handleChange}
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Terminate Employment ADP</Form.Label>
                      <Form.Control
                        type="text"
                        name="terminateEmploymentAdp"
                        value={formData.terminateEmploymentAdp}
                        onChange={handleChange}
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Exit Interview</Form.Label>
                      <Form.Control
                        type="text"
                        name="exitInterview"
                        value={formData.exitInterview}
                        onChange={handleChange}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Row>
          <Col>
            <div className="d-flex justify-content-end gap-2">
              <Link href="/onboarding" className="btn btn-outline-secondary">
                Cancel
              </Link>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Creating...' : 'Create Onboarding Record'}
              </Button>
            </div>
          </Col>
        </Row>
      </Form>
    </Container>
  );
} 