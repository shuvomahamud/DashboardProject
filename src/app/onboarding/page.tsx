"use client";

import { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Navbar, Nav } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DataTable from '@/components/DataTable';
import DateTime from '@/components/DateTime';
import Link from 'next/link';

export default function OnboardingPage() {
  const [onboardings, setOnboardings] = useState([]);
  const [loading, setLoading] = useState(true);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    fetchOnboardings();
  }, []);

  const fetchOnboardings = async () => {
    try {
      const response = await fetch('/api/onboarding');
      const data = await response.json();
      setOnboardings(data);
    } catch (error) {
      console.error('Error fetching onboardings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this onboarding record?')) {
      try {
        await fetch(`/api/onboarding/${id}`, { method: 'DELETE' });
        fetchOnboardings();
      } catch (error) {
        console.error('Error deleting onboarding:', error);
      }
    }
  };

  const columns = [
    { 
      name: 'ID', 
      selector: (row: any) => row.onboardingid, 
      sortable: true,
      width: '80px'
    },
    { 
      name: 'Consultant Name', 
      selector: (row: any) => row.consultantName, 
      sortable: true,
      wrap: true
    },
    { 
      name: 'Created Date', 
      selector: (row: any) => row.createddate, 
      sortable: true,
      cell: (row: any) => <DateTime value={row.createddate} />
    },
    { 
      name: 'Client Agency', 
      selector: (row: any) => row.clientAgencyName || 'N/A', 
      sortable: true,
      wrap: true
    },
    { 
      name: 'Actions', 
      cell: (row: any) => (
        <div className="d-flex gap-2">
          <Link 
            href={`/onboarding/${row.onboardingid}`}
            className="btn btn-sm btn-primary d-flex align-items-center"
            title="View Details"
          >
            <i className="bi bi-eye"></i>
          </Link>
          <Link 
            href={`/onboarding/${row.onboardingid}/edit`}
            className="btn btn-sm btn-outline-secondary d-flex align-items-center"
            title="Edit Onboarding"
          >
            <i className="bi bi-pencil"></i>
          </Link>
          <Button
            size="sm"
            variant="outline-danger"
            onClick={() => handleDelete(row.onboardingid)}
            className="d-flex align-items-center"
            title="Delete Onboarding"
          >
            <i className="bi bi-trash"></i>
          </Button>
        </div>
      ),
      ignoreRowClick: true
    }
  ];

  if (loading) {
    return <div className="d-flex justify-content-center align-items-center min-vh-100">Loading...</div>;
  }

  return (
    <Container className="mt-4">
        <Row>
          <Col>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h1>Onboarding</h1>
              <Link href="/onboarding/new" className="btn btn-success">
                Create New Onboarding
              </Link>
            </div>
          </Col>
        </Row>

        <Row>
          <Col>
            <DataTable 
              columns={columns} 
              data={onboardings}
              pagination={true}
              paginationPerPage={10}
            />
          </Col>
        </Row>
      </Container>
  );
} 