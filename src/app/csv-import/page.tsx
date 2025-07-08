"use client";

import { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Navbar, Nav, Alert, Table } from 'react-bootstrap';
import Link from 'next/link';

export default function CsvImportPage() {
  const [selectedEntity, setSelectedEntity] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  const entities = [
    { value: 'todo', label: 'Todo Tasks', endpoint: '/api/todo/import' },
    { value: 'interviews', label: 'Interviews', endpoint: '/api/interviews/import' },
    { value: 'accounts-payable', label: 'Accounts Payable', endpoint: '/api/accounts-payable/import' },
    { value: 'onboarding', label: 'Onboarding', endpoint: '/api/onboarding/import' }
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setError('');
    } else {
      setError('Please select a valid CSV file');
      setFile(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEntity || !file) {
      setError('Please select both an entity type and a CSV file');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const entity = entities.find(e => e.value === selectedEntity);
      const response = await fetch(entity!.endpoint, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setResults(result);
      } else {
        setError(result.error || 'Failed to import CSV');
      }
    } catch (err) {
      setError('An error occurred while importing the CSV');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    let csvContent = '';
    let filename = '';

    switch (selectedEntity) {
      case 'todo':
        csvContent = 'category,taskname,triggerdate,assignedto,internalduedate,actualduedate,status,requiresfiling,filed,followupneeded,recurring,nextduedate\n';
        csvContent += 'Administrative,Sample Task,2024-01-15,John Doe,2024-01-20,2024-01-25,In Progress,true,false,true,false,2024-02-15\n';
        filename = 'todo_template.csv';
        break;
      case 'interviews':
        csvContent = 'hbits_no,position,level,mailreceiveddate,consultantname,clientsuggesteddates,maileddatestoconsultant,interviewtimeoptedfor,interviewscheduledmailedtomr,interviewconfirmedbyclient,timeofinterview,thrurecruiter,consultantcontactno,consultantemail,vendorpocname,vendornumber,vendoremailid,candidateselected,monthyear\n';
        csvContent += 'HBITS123,Software Developer,3,2024-01-15,Jane Smith,"Jan 20, Jan 21",2024-01-16,10:00 AM,true,2024-01-18,2024-01-20 10:00,ABC Recruiter,555-1234,jane@example.com,Vendor POC,555-5678,vendor@example.com,Pending,01/2024\n';
        filename = 'interviews_template.csv';
        break;
      case 'accounts-payable':
        csvContent = 'startenddate,agency,taskordernumber,candidatename,region,jobtitle,skilllevel,totalhours,timesheetapprovaldate,hourlywagerate,vendorname,invoicenumber,invoicedate,paymentmode,paymentduedate,monthyear\n';
        csvContent += '2024-01-01,ABC Agency,TO123,John Doe,1,Software Developer,3,40,2024-01-05,75.00,XYZ Vendor,INV001,2024-01-10,Check,2024-01-30,01/2024\n';
        filename = 'accounts_payable_template.csv';
        break;
      case 'onboarding':
        csvContent = 'candidatename,fieldname,detailsvalue,owner,notes,dateutc\n';
        csvContent += 'John Doe,Background Check,Completed,HR Team,All clear,2024-01-15T10:00:00Z\n';
        csvContent += 'John Doe,Equipment Setup,In Progress,IT Team,Laptop ordered,2024-01-16T14:30:00Z\n';
        filename = 'onboarding_template.csv';
        break;
      default:
        return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Container className="mt-4">
        <Row>
          <Col>
            <div className="d-flex align-items-center mb-4">
              <Link href="/dashboard" className="btn btn-outline-secondary me-3">
                ← Back to Dashboard
              </Link>
              <h1>CSV Import</h1>
            </div>
          </Col>
        </Row>

        <Row>
          <Col md={8}>
            <Card>
              <Card.Body>
                <h5>Import CSV Data</h5>
                <p className="text-muted">
                  Upload CSV files to import data into the system. Select the entity type and upload a properly formatted CSV file.
                </p>

                {error && (
                  <Alert variant="danger" className="mb-3">
                    {error}
                  </Alert>
                )}

                <Form onSubmit={handleSubmit}>
                  <Form.Group className="mb-3">
                    <Form.Label>Entity Type</Form.Label>
                    <Form.Select
                      value={selectedEntity}
                      onChange={(e) => setSelectedEntity(e.target.value)}
                      required
                    >
                      <option value="">Select entity type...</option>
                      {entities.map(entity => (
                        <option key={entity.value} value={entity.value}>
                          {entity.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>CSV File</Form.Label>
                    <Form.Control
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      required
                    />
                    <Form.Text className="text-muted">
                      Select a CSV file to import. The file must match the expected format for the selected entity type.
                    </Form.Text>
                  </Form.Group>

                  <div className="d-flex gap-2 mb-4">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading || !selectedEntity || !file}
                    >
                      {loading ? 'Importing...' : 'Import CSV'}
                    </Button>
                    
                    {selectedEntity && (
                      <Button
                        type="button"
                        variant="outline-secondary"
                        onClick={downloadTemplate}
                      >
                        Download Template
                      </Button>
                    )}
                  </div>
                </Form>

                {results && (
                  <Alert variant="success">
                    <h6>Import Results</h6>
                    <p>Successfully imported {results.imported} records</p>
                    {results.errors && results.errors.length > 0 && (
                      <div>
                        <strong>Errors:</strong>
                        <ul className="mt-2 mb-0">
                          {results.errors.map((error: string, index: number) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Alert>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col md={4}>
            <Card>
              <Card.Body>
                <h6>CSV Format Guidelines</h6>
                <ul className="small">
                  <li>First row must contain column headers</li>
                  <li>Date fields should be in YYYY-MM-DD format</li>
                  <li>DateTime fields should be in ISO format</li>
                  <li>Boolean fields should be true/false</li>
                  <li>Numeric fields should not contain currency symbols</li>
                  <li>Text fields with commas should be quoted</li>
                </ul>

                <hr />

                <h6>Supported Entities</h6>
                <ul className="small">
                  <li><strong>Todo Tasks:</strong> Task management data</li>
                  <li><strong>Interviews:</strong> Interview scheduling data</li>
                  <li><strong>Accounts Payable:</strong> Financial and billing data</li>
                  <li><strong>Onboarding:</strong> Candidate onboarding data</li>
                </ul>

                <hr />

                <div className="text-center">
                  <Button variant="outline-primary" size="sm">
                    <Link href="/dashboard" className="text-decoration-none">
                      Back to Dashboard
                    </Link>
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
  );
} 