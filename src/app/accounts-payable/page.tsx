"use client";

import { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Navbar, Nav } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DataTable from '@/components/DataTable';
import DateTime from '@/components/DateTime';
import Link from 'next/link';

export default function AccountsPayablePage() {
  const [apReports, setApReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    fetchApReports();
  }, []);

  const fetchApReports = async () => {
    try {
      const response = await fetch('/api/accounts-payable');
      const data = await response.json();
      setApReports(data);
    } catch (error) {
      console.error('Error fetching AP reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this AP report?')) {
      try {
        await fetch(`/api/accounts-payable/${id}`, { method: 'DELETE' });
        fetchApReports();
      } catch (error) {
        console.error('Error deleting AP report:', error);
      }
    }
  };

  const columns = [
    { 
      name: 'ID', 
      selector: (row: any) => row.ap_id, 
      sortable: true,
      width: '80px'
    },
    { 
      name: 'Agency', 
      selector: (row: any) => row.agency, 
      sortable: true,
      wrap: true
    },
    { 
      name: 'Candidate', 
      selector: (row: any) => row.consultantname, 
      sortable: true,
      wrap: true
    },
    { 
      name: 'Job Title', 
      selector: (row: any) => row.jobtitle, 
      sortable: true,
      wrap: true
    },
    { 
      name: 'Total Hours', 
      selector: (row: any) => row.totalhours, 
      sortable: true,
      width: '120px'
    },
    { 
      name: 'Hourly Rate', 
      selector: (row: any) => row.hourlywagerate, 
      sortable: true,
      width: '120px',
      cell: (row: any) => row.hourlywagerate ? `$${row.hourlywagerate}` : ''
    },
    { 
      name: 'Invoice Date', 
      selector: (row: any) => row.invoicedate, 
      sortable: true,
      cell: (row: any) => <DateTime value={row.invoicedate} />
    },
    { 
      name: 'Month/Year', 
      selector: (row: any) => row.monthyear, 
      sortable: true,
      width: '100px'
    },
    { 
      name: 'Actions', 
      cell: (row: any) => (
        <div className="d-flex gap-2">
          <Link 
            href={`/accounts-payable/${row.ap_id}`}
            className="btn btn-sm btn-primary"
          >
            View
          </Link>
          <Link 
            href={`/accounts-payable/${row.ap_id}/edit`}
            className="btn btn-sm btn-outline-primary"
          >
            Edit
          </Link>
          <Button
            size="sm"
            variant="outline-danger"
            onClick={() => handleDelete(row.ap_id)}
          >
            Delete
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
              <h1>Accounts Payable</h1>
              <Link href="/accounts-payable/new" className="btn btn-success">
                Create New AP Report
              </Link>
            </div>
          </Col>
        </Row>

        <Row>
          <Col>
            <DataTable 
              columns={columns} 
              data={apReports}
              pagination={true}
              paginationPerPage={10}
            />
          </Col>
        </Row>
      </Container>
  );
} 