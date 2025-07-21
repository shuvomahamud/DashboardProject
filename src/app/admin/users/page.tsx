'use client';

import { useState, useEffect } from 'react';
import { Container, Row, Col, Table, Button, Modal, Form, Alert, Badge, Spinner } from 'react-bootstrap';
import { useIsAdmin } from '@/lib/auth/useTablePermit';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  emailConfirmed: boolean;
  roles: string[];
  tables: string[];
  createdAt: string;
  updatedAt: string;
}


export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [selectedUserType, setSelectedUserType] = useState<'user' | 'admin' | ''>('');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  const isAdmin = useIsAdmin();
  const router = useRouter();

  // Redirect if not admin
  useEffect(() => {
    if (!isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, router]);

  // Fetch data
  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        setError('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setError('Error fetching users');
    } finally {
      setLoading(false);
    }
  };


  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          userType: selectedUserType,
          tables: selectedTables,
        }),
      });

      if (response.ok) {
        const newUser = await response.json();
        setUsers([...users, newUser]);
        setSuccess('User created successfully!');
        setShowCreateModal(false);
        setNewUserEmail('');
        setNewUserPassword('');
        setSelectedUserType('');
        setSelectedTables([]);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      setError('Error creating user');
    } finally {
      setCreating(false);
    }
  };

  const handleUserTypeChange = (userType: 'user' | 'admin') => {
    setSelectedUserType(userType);
    if (userType === 'admin') {
      setSelectedTables([]); // Admin doesn't need table selection
    }
  };

  const handleTableToggle = (tableKey: string) => {
    setSelectedTables(prev => 
      prev.includes(tableKey) 
        ? prev.filter(key => key !== tableKey)
        : [...prev, tableKey]
    );
  };

  const availableTables = [
    { key: 'ap_report', label: 'AP Reports', description: 'Accounts Payable reports management' },
    { key: 'interviews', label: 'Interviews', description: 'Interview scheduling and tracking' },
    { key: 'onboarding', label: 'Onboarding', description: 'Employee onboarding process' },
    { key: 'todo_list', label: 'Todo List', description: 'Task management and tracking' }
  ];

  const getTableBadgeVariant = (table: string) => {
    switch (table) {
      case '*': return 'danger';
      case 'ap_report': return 'primary';
      case 'todo_list': return 'success';
      case 'interviews': return 'info';
      case 'onboarding': return 'warning';
      default: return 'secondary';
    }
  };

  const getTableDisplayName = (table: string) => {
    switch (table) {
      case '*': return 'All Tables (Admin)';
      case 'ap_report': return 'AP Reports';
      case 'todo_list': return 'Todo List';
      case 'interviews': return 'Interviews';
      case 'onboarding': return 'Onboarding';
      case 'interview_information': return 'Interview Information';
      default: return table;
    }
  };

  const getRoleDisplayName = (roleName: string) => {
    switch (roleName) {
      case 'Admin': return 'Admin';
      case 'AP_Report_RW': return 'AP Reports';
      case 'Todo_RW': return 'Todo List';
      case 'Interviews_RW': return 'Interviews';
      case 'Onboarding_RW': return 'Onboarding';
      default: return roleName;
    }
  };

  if (!isAdmin) {
    return <div>Access denied</div>;
  }

  return (
    <Container fluid>
      <Row>
        <Col>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h1>User Management</h1>
            <Button 
              variant="primary" 
              onClick={() => setShowCreateModal(true)}
            >
              Create New User
            </Button>
          </div>

          {error && (
            <Alert variant="danger" onClose={() => setError(null)} dismissible>
              {error}
            </Alert>
          )}

          {success && (
            <Alert variant="success" onClose={() => setSuccess(null)} dismissible>
              {success}
            </Alert>
          )}

          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
            </div>
          ) : (
            <Table responsive striped bordered hover>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Table Permissions</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>
                      <Badge bg={user.emailConfirmed ? 'success' : 'warning'}>
                        {user.emailConfirmed ? 'Confirmed' : 'Pending'}
                      </Badge>
                    </td>
                    <td>
                      {user.roles.map((role) => (
                        <Badge key={role} bg="info" className="me-1">
                          {getRoleDisplayName(role)}
                        </Badge>
                      ))}
                    </td>
                    <td>
                      {user.tables.map((table) => (
                        <Badge 
                          key={table} 
                          bg={getTableBadgeVariant(table)} 
                          className="me-1"
                        >
                          {getTableDisplayName(table)}
                        </Badge>
                      ))}
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {/* Create User Modal */}
          <Modal 
            show={showCreateModal} 
            onHide={() => setShowCreateModal(false)}
            size="lg"
          >
            <Modal.Header closeButton>
              <Modal.Title>Create New User</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleCreateUser}>
              <Modal.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>User Type</Form.Label>
                  <div className="border rounded p-3">
                    <Form.Check
                      type="radio"
                      id="user-type-admin"
                      name="userType"
                      label={
                        <div>
                          <strong>Admin</strong>
                          <div className="text-muted small">
                            Full access to all features including Sync Sheet, User Management, and Data Loader
                          </div>
                        </div>
                      }
                      checked={selectedUserType === 'admin'}
                      onChange={() => handleUserTypeChange('admin')}
                    />
                    <Form.Check
                      type="radio"
                      id="user-type-user"
                      name="userType"
                      label={
                        <div>
                          <strong>User</strong>
                          <div className="text-muted small">
                            Limited access to selected tables with full CRUD operations on those tables
                          </div>
                        </div>
                      }
                      checked={selectedUserType === 'user'}
                      onChange={() => handleUserTypeChange('user')}
                      className="mt-2"
                    />
                  </div>
                </Form.Group>

                {selectedUserType === 'user' && (
                  <Form.Group className="mb-3">
                    <Form.Label>Table Access Permissions</Form.Label>
                    <div className="text-muted small mb-2">
                      Select which tables this user can access. Users will have full CRUD operations on selected tables.
                    </div>
                    <div className="border rounded p-3">
                      {availableTables.map((table) => (
                        <Form.Check
                          key={table.key}
                          type="checkbox"
                          id={`table-${table.key}`}
                          label={
                            <div>
                              <strong>{table.label}</strong>
                              <div className="text-muted small">
                                {table.description}
                              </div>
                            </div>
                          }
                          checked={selectedTables.includes(table.key)}
                          onChange={() => handleTableToggle(table.key)}
                          className="mb-2"
                        />
                      ))}
                    </div>
                    {selectedTables.length === 0 && selectedUserType === 'user' && (
                      <div className="text-warning small mt-1">
                        Please select at least one table for user access
                      </div>
                    )}
                  </Form.Group>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  type="submit" 
                  disabled={creating || !selectedUserType || (selectedUserType === 'user' && selectedTables.length === 0)}
                >
                  {creating ? 'Creating...' : 'Create User'}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal>
        </Col>
      </Row>
    </Container>
  );
} 