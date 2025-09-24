'use client';

import { useState, useEffect } from 'react';
import { Container, Row, Col, Table, Button, Modal, Form, Alert, Badge, Spinner } from 'react-bootstrap';
import { useIsAdmin } from '@/lib/auth/useTablePermit';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  emailConfirmed: boolean;
  isApproved?: boolean;
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

  // Edit user state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserType, setEditUserType] = useState<'user' | 'admin' | ''>('');
  const [editSelectedTables, setEditSelectedTables] = useState<string[]>([]);
  const [editUserApproved, setEditUserApproved] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Delete user state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // View user state
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);

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

  const handleEditTableToggle = (tableKey: string) => {
    setEditSelectedTables(prev => 
      prev.includes(tableKey) 
        ? prev.filter(key => key !== tableKey)
        : [...prev, tableKey]
    );
  };

  const handleViewUser = (user: User) => {
    setViewingUser(user);
    setShowViewModal(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditUserEmail(user.email);
    setEditUserType(user.roles.includes('Admin') ? 'admin' : 'user');
    setEditSelectedTables(user.tables.filter(table => table !== '*'));
    setEditUserApproved(user.isApproved ?? true);
    setNewPassword('');
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    setUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingUser.id,
          email: editUserEmail,
          userType: editUserType,
          tables: editSelectedTables,
          isApproved: editUserApproved,
        }),
      });

      if (response.ok) {
        const updatedUser = await response.json();
        setUsers(users.map(user => user.id === editingUser.id ? updatedUser : user));
        setSuccess('User updated successfully!');
        setShowEditModal(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update user');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      setError('Error updating user');
    } finally {
      setUpdating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingUser || !newPassword) return;
    
    setResettingPassword(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/users/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: editingUser.id,
          newPassword: newPassword,
        }),
      });

      if (response.ok) {
        setSuccess('Password updated successfully!');
        setNewPassword('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update password');
      }
    } catch (error) {
      console.error('Error updating password:', error);
      setError('Error updating password');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users?id=${userToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setUsers(users.filter(user => user.id !== userToDelete.id));
        setSuccess('User deleted successfully!');
        setShowDeleteModal(false);
        setUserToDelete(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Error deleting user');
    } finally {
      setDeleting(false);
    }
  };

  const availableTables = [
    { key: 'ap_report', label: 'AP Reports', description: 'Accounts Payable reports management' },
    { key: 'interviews', label: 'Interviews', description: 'Interview scheduling and tracking' },
    { key: 'onboarding', label: 'Onboarding', description: 'Employee onboarding process' },
    { key: 'todo_list', label: 'Todo List', description: 'Task management and tracking' },
    { key: 'jobs', label: 'Jobs', description: 'Job postings and applications management' }
  ];

  const getTableBadgeVariant = (table: string) => {
    switch (table) {
      case '*': return 'danger';
      case 'ap_report': return 'primary';
      case 'todo_list': return 'success';
      case 'interviews': return 'info';
      case 'onboarding': return 'warning';
      case 'jobs': return 'dark';
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
      case 'jobs': return 'Jobs';
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
      case 'Jobs_RW': return 'Jobs';
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
                  <th>Actions</th>
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
                    <td>
                      <div className="d-flex gap-1">
                        <Button
                          variant="outline-info"
                          size="sm"
                          onClick={() => handleViewUser(user)}
                          title="View Details"
                        >
                          View
                        </Button>
                        <Button
                          variant="outline-warning"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          title="Edit User"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDeleteUser(user)}
                          title="Delete User"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
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

          {/* View User Modal */}
          <Modal show={showViewModal} onHide={() => setShowViewModal(false)} size="lg">
            <Modal.Header closeButton>
              <Modal.Title>User Details</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {viewingUser && (
                <div>
                  <div className="mb-3">
                    <strong>Email:</strong> {viewingUser.email}
                  </div>
                  <div className="mb-3">
                    <strong>Status:</strong>{' '}
                    <Badge bg={viewingUser.emailConfirmed ? 'success' : 'warning'}>
                      {viewingUser.emailConfirmed ? 'Email Confirmed' : 'Email Pending'}
                    </Badge>
                    {viewingUser.isApproved !== undefined && (
                      <>
                        {' '}
                        <Badge bg={viewingUser.isApproved ? 'success' : 'danger'}>
                          {viewingUser.isApproved ? 'Approved' : 'Not Approved'}
                        </Badge>
                      </>
                    )}
                  </div>
                  <div className="mb-3">
                    <strong>Roles:</strong>
                    <div>
                      {viewingUser.roles.map((role) => (
                        <Badge key={role} bg="info" className="me-1">
                          {getRoleDisplayName(role)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="mb-3">
                    <strong>Table Permissions:</strong>
                    <div>
                      {viewingUser.tables.map((table) => (
                        <Badge 
                          key={table} 
                          bg={getTableBadgeVariant(table)} 
                          className="me-1"
                        >
                          {getTableDisplayName(table)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="mb-3">
                    <strong>Created:</strong> {new Date(viewingUser.createdAt).toLocaleString()}
                  </div>
                  <div className="mb-3">
                    <strong>Updated:</strong> {new Date(viewingUser.updatedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowViewModal(false)}>
                Close
              </Button>
            </Modal.Footer>
          </Modal>

          {/* Edit User Modal */}
          <Modal show={showEditModal} onHide={() => setShowEditModal(false)} size="lg">
            <Modal.Header closeButton>
              <Modal.Title>Edit User</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleUpdateUser}>
              <Modal.Body>
                <Form.Group className="mb-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={editUserEmail}
                    onChange={(e) => setEditUserEmail(e.target.value)}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Check
                    type="checkbox"
                    id="edit-user-approved"
                    label="User Approved"
                    checked={editUserApproved}
                    onChange={(e) => setEditUserApproved(e.target.checked)}
                  />
                  <Form.Text className="text-muted">
                    Unchecked users cannot log in to the system
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>User Type</Form.Label>
                  <div className="border rounded p-3">
                    <Form.Check
                      type="radio"
                      id="edit-user-type-admin"
                      name="editUserType"
                      label={
                        <div>
                          <strong>Admin</strong>
                          <div className="text-muted small">
                            Full access to all features
                          </div>
                        </div>
                      }
                      checked={editUserType === 'admin'}
                      onChange={() => {
                        setEditUserType('admin');
                        setEditSelectedTables([]);
                      }}
                    />
                    <Form.Check
                      type="radio"
                      id="edit-user-type-user"
                      name="editUserType"
                      label={
                        <div>
                          <strong>User</strong>
                          <div className="text-muted small">
                            Limited access to selected tables
                          </div>
                        </div>
                      }
                      checked={editUserType === 'user'}
                      onChange={() => setEditUserType('user')}
                      className="mt-2"
                    />
                  </div>
                </Form.Group>

                {editUserType === 'user' && (
                  <Form.Group className="mb-3">
                    <Form.Label>Table Access Permissions</Form.Label>
                    <div className="border rounded p-3">
                      {availableTables.map((table) => (
                        <Form.Check
                          key={table.key}
                          type="checkbox"
                          id={`edit-table-${table.key}`}
                          label={
                            <div>
                              <strong>{table.label}</strong>
                              <div className="text-muted small">
                                {table.description}
                              </div>
                            </div>
                          }
                          checked={editSelectedTables.includes(table.key)}
                          onChange={() => handleEditTableToggle(table.key)}
                          className="mb-2"
                        />
                      ))}
                    </div>
                  </Form.Group>
                )}

                <hr />
                <h6>Password Reset</h6>
                <Form.Group className="mb-3">
                  <Form.Label>New Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (leave blank to keep current)"
                    minLength={6}
                  />
                  <Form.Text className="text-muted">
                    Minimum 6 characters. Leave blank to keep current password.
                  </Form.Text>
                </Form.Group>
                {newPassword && (
                  <Button
                    variant="outline-primary"
                    onClick={handleResetPassword}
                    disabled={resettingPassword || newPassword.length < 6}
                    className="mb-3"
                  >
                    {resettingPassword ? 'Saving Password...' : 'Save Password'}
                  </Button>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  type="submit" 
                  disabled={updating || (editUserType === 'user' && editSelectedTables.length === 0)}
                >
                  {updating ? 'Updating...' : 'Update User'}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal>

          {/* Delete Confirmation Modal */}
          <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
            <Modal.Header closeButton>
              <Modal.Title>Confirm Delete</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {userToDelete && (
                <div>
                  <p>Are you sure you want to delete this user?</p>
                  <div className="alert alert-warning">
                    <strong>Email:</strong> {userToDelete.email}<br />
                    <strong>Roles:</strong> {userToDelete.roles.join(', ')}
                  </div>
                  <p className="text-danger">
                    <strong>Warning:</strong> This action cannot be undone. The user will be permanently removed from the system.
                  </p>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button 
                variant="danger" 
                onClick={confirmDeleteUser}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete User'}
              </Button>
            </Modal.Footer>
          </Modal>
        </Col>
      </Row>
    </Container>
  );
} 