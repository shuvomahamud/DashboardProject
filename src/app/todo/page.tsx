"use client";

import { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Navbar, Nav } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DataTable from '@/components/DataTable';
import DateTime from '@/components/DateTime';
import BooleanBadge from '@/components/BooleanBadge';
import Link from 'next/link';

export default function TodoPage() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const response = await fetch('/api/todo');
      const data = await response.json();
      setTodos(data);
    } catch (error) {
      console.error('Error fetching todos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this todo?')) {
      try {
        await fetch(`/api/todo/${id}`, { method: 'DELETE' });
        fetchTodos();
      } catch (error) {
        console.error('Error deleting todo:', error);
      }
    }
  };

  const columns = [
    { 
      name: 'ID', 
      selector: (row: any) => row.taskid, 
      sortable: true,
      width: '80px'
    },
    { 
      name: 'Task', 
      selector: (row: any) => row.taskname, 
      sortable: true,
      wrap: true
    },
    { 
      name: 'Category', 
      selector: (row: any) => row.category, 
      sortable: true 
    },
    { 
      name: 'Status', 
      selector: (row: any) => row.status, 
      sortable: true 
    },
    { 
      name: 'Due Date', 
      selector: (row: any) => row.internalduedate, 
      sortable: true,
      cell: (row: any) => <DateTime value={row.internalduedate} />
    },
    { 
      name: 'Assigned To', 
      selector: (row: any) => row.assignedto, 
      sortable: true 
    },
    { 
      name: 'Filed', 
      cell: (row: any) => <BooleanBadge value={row.filed} />
    },
    { 
      name: 'Note', 
      cell: (row: any) => (
        row.note ? (
          <span className="badge bg-info" title={row.note}>
            📝 Note
          </span>
        ) : (
          <span className="text-muted">-</span>
        )
      ),
      width: '80px'
    },
    { 
      name: 'Actions', 
      cell: (row: any) => (
        <div className="d-flex gap-2">
          <Link 
            href={`/todo/${row.taskid}`}
            className="btn btn-sm btn-primary"
          >
            View
          </Link>
          <Link 
            href={`/todo/${row.taskid}/edit`}
            className="btn btn-sm btn-outline-primary"
          >
            Edit
          </Link>
          <Button
            size="sm"
            variant="outline-danger"
            onClick={() => handleDelete(row.taskid)}
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
    <>


      <Container>
        <Row>
          <Col>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h1>Todo Tasks</h1>
              <Link href="/todo/new" className="btn btn-success">
                Add New Task
              </Link>
            </div>
          </Col>
        </Row>

        <Row>
          <Col>
            <DataTable 
              columns={columns} 
              data={todos}
              pagination={true}
              paginationPerPage={10}
            />
          </Col>
        </Row>
      </Container>
    </>
  );
} 