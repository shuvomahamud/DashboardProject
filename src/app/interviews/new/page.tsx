"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Row, Col, Card, Form, Button, Navbar, Nav, Alert } from 'react-bootstrap';
import Link from 'next/link';

export default function NewInterviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    hbits_no: '',
    position: '',
    level: '',
    mailreceiveddate: '',
    consultantname: '',
    clientsuggesteddates: '',
    maileddatestoconsultant: '',
    interviewtimeoptedfor: '',
    interviewscheduledmailedtomr: false,
    interviewconfirmedbyclient: '',
    timeofinterview: '',
    thrurecruiter: '',
    consultantcontactno: '',
    consultantemail: '',
    vendorpocname: '',
    vendornumber: '',
    vendoremailid: '',
    candidateselected: '',
    monthyear: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/interviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/interviews');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create interview');
      }
    } catch (err) {
      setError('An error occurred while creating the interview');
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
              <Link href="/interviews" className="btn btn-outline-secondary me-3">
                ← Back to Interviews
              </Link>
              <h1>Schedule New Interview</h1>
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
                        <Form.Label>HBITS Number</Form.Label>
                        <Form.Control
                          type="text"
                          name="hbits_no"
                          value={formData.hbits_no}
                          onChange={handleChange}
                          placeholder="Enter HBITS number"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Position</Form.Label>
                        <Form.Control
                          type="text"
                          name="position"
                          value={formData.position}
                          onChange={handleChange}
                          placeholder="Enter position"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Consultant Name</Form.Label>
                        <Form.Control
                          type="text"
                          name="consultantname"
                          value={formData.consultantname}
                          onChange={handleChange}
                          placeholder="Enter consultant name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Level</Form.Label>
                        <Form.Control
                          type="number"
                          name="level"
                          value={formData.level}
                          onChange={handleChange}
                          placeholder="Enter level"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Mail Received Date</Form.Label>
                        <Form.Control
                          type="date"
                          name="mailreceiveddate"
                          value={formData.mailreceiveddate}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Mailed Dates to Consultant</Form.Label>
                        <Form.Control
                          type="date"
                          name="maileddatestoconsultant"
                          value={formData.maileddatestoconsultant}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Time of Interview</Form.Label>
                        <Form.Control
                          type="datetime-local"
                          name="timeofinterview"
                          value={formData.timeofinterview}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Interview Confirmed by Client</Form.Label>
                        <Form.Control
                          type="date"
                          name="interviewconfirmedbyclient"
                          value={formData.interviewconfirmedbyclient}
                          onChange={handleChange}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Client Suggested Dates</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          name="clientsuggesteddates"
                          value={formData.clientsuggesteddates}
                          onChange={handleChange}
                          placeholder="Enter client suggested dates..."
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Interview Time Opted For</Form.Label>
                        <Form.Control
                          type="text"
                          name="interviewtimeoptedfor"
                          value={formData.interviewtimeoptedfor}
                          onChange={handleChange}
                          placeholder="Enter preferred interview time"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Through Recruiter</Form.Label>
                        <Form.Control
                          type="text"
                          name="thrurecruiter"
                          value={formData.thrurecruiter}
                          onChange={handleChange}
                          placeholder="Enter recruiter name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Consultant Contact Number</Form.Label>
                        <Form.Control
                          type="text"
                          name="consultantcontactno"
                          value={formData.consultantcontactno}
                          onChange={handleChange}
                          placeholder="Enter contact number"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Consultant Email</Form.Label>
                        <Form.Control
                          type="email"
                          name="consultantemail"
                          value={formData.consultantemail}
                          onChange={handleChange}
                          placeholder="Enter consultant email"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Vendor POC Name</Form.Label>
                        <Form.Control
                          type="text"
                          name="vendorpocname"
                          value={formData.vendorpocname}
                          onChange={handleChange}
                          placeholder="Enter vendor POC name"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Vendor Number</Form.Label>
                        <Form.Control
                          type="text"
                          name="vendornumber"
                          value={formData.vendornumber}
                          onChange={handleChange}
                          placeholder="Enter vendor number"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Vendor Email ID</Form.Label>
                        <Form.Control
                          type="email"
                          name="vendoremailid"
                          value={formData.vendoremailid}
                          onChange={handleChange}
                          placeholder="Enter vendor email"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Candidate Selected</Form.Label>
                        <Form.Select
                          name="candidateselected"
                          value={formData.candidateselected}
                          onChange={handleChange}
                        >
                          <option value="">Select Status</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                          <option value="Pending">Pending</option>
                        </Form.Select>
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

                  <Row>
                    <Col>
                      <Form.Group className="mb-3">
                        <Form.Check
                          type="checkbox"
                          name="interviewscheduledmailedtomr"
                          label="Interview Scheduled and Mailed to MR"
                          checked={formData.interviewscheduledmailedtomr}
                          onChange={handleChange}
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
                      {loading ? 'Creating...' : 'Create Interview'}
                    </Button>
                    <Link href="/interviews" className="btn btn-secondary">
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