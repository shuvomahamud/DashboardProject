"use client";

import { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Navbar, Nav } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DataTable from '@/components/DataTable';
import DateTime from '@/components/DateTime';
import BooleanBadge from '@/components/BooleanBadge';
import Link from 'next/link';

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    try {
      const response = await fetch('/api/interviews');
      const data = await response.json();
      setInterviews(data);
    } catch (error) {
      console.error('Error fetching interviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this interview?')) {
      try {
        await fetch(`/api/interviews/${id}`, { method: 'DELETE' });
        fetchInterviews();
      } catch (error) {
        console.error('Error deleting interview:', error);
      }
    }
  };

  const columns = [
    { 
      name: 'ID', 
      selector: (row: any) => row.interviewid, 
      sortable: true,
      width: '80px'
    },
    { 
      name: 'HBITS No', 
      selector: (row: any) => row.hbits_no, 
      sortable: true,
      wrap: true
    },
    { 
      name: 'Position', 
      selector: (row: any) => row.position, 
      sortable: true 
    },
    { 
      name: 'Consultant', 
      selector: (row: any) => row.consultantname, 
      sortable: true,
      wrap: true
    },
    { 
      name: 'Interview Time', 
      selector: (row: any) => row.timeofinterview, 
      sortable: true,
      cell: (row: any) => <DateTime value={row.timeofinterview} />
    },
    { 
      name: 'Level', 
      selector: (row: any) => row.level, 
      sortable: true,
      width: '80px'
    },
    { 
      name: 'Selected', 
      selector: (row: any) => row.candidateselected, 
      sortable: true,
      width: '100px'
    },
    { 
      name: 'Actions', 
      cell: (row: any) => (
        <div className="d-flex gap-2">
          <Link 
            href={`/interviews/${row.interviewid}`}
            className="btn btn-sm btn-primary"
          >
            View
          </Link>
          <Link 
            href={`/interviews/${row.interviewid}/edit`}
            className="btn btn-sm btn-outline-primary"
          >
            Edit
          </Link>
          <Button
            size="sm"
            variant="outline-danger"
            onClick={() => handleDelete(row.interviewid)}
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
              <h1>Interviews</h1>
              <Link href="/interviews/new" className="btn btn-success">
                Schedule New Interview
              </Link>
            </div>
          </Col>
        </Row>

        <Row>
          <Col>
            <DataTable 
              columns={columns} 
              data={interviews}
              pagination={true}
              paginationPerPage={10}
            />
          </Col>
        </Row>
      </Container>
  );
} 