"use client";

import { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Card } from 'react-bootstrap';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import DateTime from '@/components/DateTime';

export default function OnboardingDetailPage() {
  const [onboarding, setOnboarding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    if (params.id) {
      fetchOnboarding();
    }
  }, [params.id]);

  const fetchOnboarding = async () => {
    try {
      const response = await fetch(`/api/onboarding/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setOnboarding(data);
      } else {
        console.error('Error fetching onboarding:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this onboarding record?')) {
      try {
        await fetch(`/api/onboarding/${params.id}`, { method: 'DELETE' });
        router.push('/onboarding');
      } catch (error) {
        console.error('Error deleting onboarding:', error);
      }
    }
  };

  if (loading) {
    return <div className="d-flex justify-content-center align-items-center min-vh-100">Loading...</div>;
  }

  if (!onboarding) {
    return <div className="text-center mt-5">Onboarding record not found</div>;
  }

  const FieldRow = ({ label, value }: { label: string, value: any }) => {
    // Handle date values - check for ISO date string pattern
    const isDateString = (typeof value === 'string' && 
      value.includes('T') && value.includes('-') && value.includes(':') &&
      value.length > 10); // Basic ISO date string should be longer than 10 chars
    
    if (value instanceof Date || isDateString) {
      return (
        <div className="row mb-2">
          <div className="col-sm-4"><strong>{label}:</strong></div>
          <div className="col-sm-8">
            <DateTime value={value} />
          </div>
        </div>
      );
    }
    
    // Handle other values - only show N/A for null/undefined
    let displayValue;
    if (value === null || value === undefined) {
      displayValue = 'N/A';
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
    } else if (typeof value === 'number') {
      displayValue = value.toString();
    } else if (typeof value === 'string') {
      displayValue = value.trim() === '' ? 'N/A' : value;
    } else {
      displayValue = value.toString();
    }
    
    return (
      <div className="row mb-2">
        <div className="col-sm-4"><strong>{label}:</strong></div>
        <div className="col-sm-8">{displayValue}</div>
      </div>
    );
  };

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h1>Onboarding Details</h1>
            <div>
              <Link href={`/onboarding/${params.id}/edit`} className="btn btn-primary me-2">
                Edit
              </Link>
              <Button variant="outline-danger" onClick={handleDelete}>
                Delete
              </Button>
              <Link href="/onboarding" className="btn btn-outline-secondary ms-2">
                Back to List
              </Link>
            </div>
          </div>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Basic Information</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="ID" value={onboarding.onboardingid} />
              <FieldRow label="Task Order" value={onboarding.taskOrder} />
              <FieldRow label="Client Agency Name" value={onboarding.clientAgencyName} />
              <FieldRow label="Agency Name from Form1" value={onboarding.agencyNameFromForm1} />
              <FieldRow label="Recruiter Name" value={onboarding.recruiterName} />
              <FieldRow label="Created Date" value={onboarding.createddate} />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Consultant Details</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="Consultant Name" value={onboarding.consultantName} />
              <FieldRow label="Current Location" value={onboarding.currentLocation} />
              <FieldRow label="Phone" value={onboarding.consultantPhone} />
              <FieldRow label="Email" value={onboarding.consultantEmail} />
              <FieldRow label="Mailing Address" value={onboarding.consultantMailingAddress} />
              <FieldRow label="Hiring Term" value={onboarding.hiringTerm} />
              <FieldRow label="Date of Birth" value={onboarding.dob} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Dates & Timeline</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="Date of Confirmation" value={onboarding.dateOfConfirmation} />
              <FieldRow label="Expected Onboarding Date" value={onboarding.expectedOnboardingDate} />
              <FieldRow label="Actual Start Date" value={onboarding.actualStartDate} />
              <FieldRow label="End Date" value={onboarding.endDate} />
              <FieldRow label="Actual End Date" value={onboarding.actualEndDate} />
              <FieldRow label="Engagement Length (Months)" value={onboarding.engagementLengthMonths} />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Financial Information</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="Bill Rate from Client" value={onboarding.billRateFromClient} />
              <FieldRow label="Pay Rate to Vendor" value={onboarding.payRateToVendor} />
              <FieldRow label="Billing Terms" value={onboarding.billingTerms} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Vendor Information</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="Vendor Name" value={onboarding.vendorName} />
              <FieldRow label="Vendor POC Phone" value={onboarding.vendorPocPhone} />
              <FieldRow label="Vendor POC Email" value={onboarding.vendorPocEmail} />
              <FieldRow label="Vendor Address" value={onboarding.vendorAddress} />
              <FieldRow label="Vendor Fed ID" value={onboarding.vendorFedId} />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Forms & Documentation</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="Form 2/Form B" value={onboarding.form2FormB} />
              <FieldRow label="Resume and Form1/Form B" value={onboarding.resumeAndForm1FormB} />
              <FieldRow label="Core Form" value={onboarding.coreForm} />
              <FieldRow label="Onboarding Letter Received" value={onboarding.onboardingLetterReceived} />
              <FieldRow label="MSA Employment Letter" value={onboarding.msaEmploymentLetter} />
              <FieldRow label="Work Order" value={onboarding.workOrder} />
              <FieldRow label="W9" value={onboarding.w9} />
              <FieldRow label="COI" value={onboarding.coi} />
              <FieldRow label="Offer Letter" value={onboarding.offerLetter} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Requirements & Compliance</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="Fingerprinting Required" value={onboarding.fingerPrintingRequired} />
              <FieldRow label="Background Check Required" value={onboarding.backgroundCheckRequired} />
              <FieldRow label="ID Docs Required" value={onboarding.idDocsRequired} />
              <FieldRow label="Non-Compete Agreement" value={onboarding.nonCompeteAgreement} />
              <FieldRow label="Track Submission" value={onboarding.trackSubmission} />
              <FieldRow label="Remote Login Credentials" value={onboarding.remoteLoginCredentials} />
              <FieldRow label="Telecommuting" value={onboarding.telecommuting} />
              <FieldRow label="Softcopy Before Mail" value={onboarding.softcopyBeforeMail} />
              <FieldRow label="Employer Name Consistency" value={onboarding.employerNameConsistency} />
              <FieldRow label="Employer Name Match MSA" value={onboarding.employerNameMatchMsa} />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Email Communications</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="Onboarding Email to Candidate" value={onboarding.onboardingEmailToCandidate} />
              <FieldRow label="Onboarding Email to Vendor" value={onboarding.onboardingEmailToVendor} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Onboarding Process</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="First Day Instructions" value={onboarding.firstDayInstructions} />
              <FieldRow label="Complete I9" value={onboarding.completeI9} />
              <FieldRow label="Create Account ADP" value={onboarding.createAccountAdp} />
              <FieldRow label="Simple IRA Inclusion" value={onboarding.simpleIraInclusion} />
              <FieldRow label="Upload Payroll Info Ceipal" value={onboarding.uploadPayrollInfoCeipal} />
              <FieldRow label="Timesheets" value={onboarding.timesheets} />
              <FieldRow label="Tracking Arrival Details" value={onboarding.trackingArrivalDetails} />
              <FieldRow label="All Verifications Done" value={onboarding.allVerificationsDone} />
              <FieldRow label="All Files Uploaded" value={onboarding.allFilesUploaded} />
              <FieldRow label="Post Onboarding Vendor BGC" value={onboarding.postOnboardingVendorBGC} />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <Card.Title>Offboarding Process</Card.Title>
            </Card.Header>
            <Card.Body>
              <FieldRow label="Notice Period" value={onboarding.noticePeriod} />
              <FieldRow label="Return of Assets" value={onboarding.returnOfAssets} />
              <FieldRow label="Refund Deposit" value={onboarding.refundDeposit} />
              <FieldRow label="Close Simple IRA" value={onboarding.closeSimpleIra} />
              <FieldRow label="Terminate Employment ADP" value={onboarding.terminateEmploymentAdp} />
              <FieldRow label="Exit Interview" value={onboarding.exitInterview} />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
} 