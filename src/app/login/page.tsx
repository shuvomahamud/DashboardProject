"use client";

import { useState } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Container, Row, Col, Card, Form, Button, Alert } from 'react-bootstrap';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log("📝 LOGIN-DEBUG: Form submitted");
    console.log("📝 LOGIN-DEBUG: Email:", email);
    console.log("📝 LOGIN-DEBUG: Password length:", password.length);
    console.log("📝 LOGIN-DEBUG: Password provided:", !!password);

    try {
      console.log("📝 LOGIN-DEBUG: Calling signIn with credentials...");
      
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      console.log("📝 LOGIN-DEBUG: SignIn result:", result);
      console.log("📝 LOGIN-DEBUG: Has error:", !!result?.error);
      console.log("📝 LOGIN-DEBUG: Error message:", result?.error);
      console.log("📝 LOGIN-DEBUG: Is ok:", result?.ok);

      if (result?.error) {
        console.log("📝 LOGIN-DEBUG: ❌ Login failed:", result.error);
        setError('Invalid credentials');
      } else {
        console.log("📝 LOGIN-DEBUG: ✅ Login successful, checking session...");
        
        // Check if user is approved
        const session = await getSession();
        console.log("📝 LOGIN-DEBUG: Session:", session);
        console.log("📝 LOGIN-DEBUG: User approved:", session?.user?.isApproved);
        
        if (session?.user?.isApproved) {
          console.log("📝 LOGIN-DEBUG: ✅ User approved, redirecting to dashboard");
          router.push('/dashboard');
        } else {
          console.log("📝 LOGIN-DEBUG: ❌ User not approved");
          setError('Your account is pending approval. Please contact an administrator.');
        }
      }
    } catch (err) {
      console.error("📝 LOGIN-DEBUG: ❌ Exception during login:", err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="d-flex align-items-center justify-content-center min-vh-100">
      <Row className="w-100">
        <Col md={6} lg={4} className="mx-auto">
          <Card>
            <Card.Body className="p-4">
              <div className="text-center mb-4">
                <h2 className="mb-0">Dashboard Login</h2>
                <p className="text-muted">Sign in to your account</p>
              </div>

              {error && (
                <Alert variant="danger" className="mb-3">
                  {error}
                </Alert>
              )}

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Enter your email"
                  />
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                  />
                </Form.Group>

                <Button
                  variant="primary"
                  type="submit"
                  className="w-100"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </Form>
              
              <div className="mt-3 text-center">
                <small className="text-muted">
                  Test with: test@example.com / TestPassword123!<br/>
                  (After running the test script)
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
} 