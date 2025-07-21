"use client";

import { Navbar, Nav, Container } from 'react-bootstrap';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTablePermit, useIsAdmin } from '@/lib/auth/useTablePermit';

export default function Navigation() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const canAccessTodo = useTablePermit('todo_list');
  const canAccessInterviews = useTablePermit('interviews');
  const canAccessAP = useTablePermit('ap_report');
  const canAccessOnboarding = useTablePermit('onboarding');

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  if (!session) return null;

  return (
    <Navbar bg="dark" variant="dark" className="mb-4">
      <Container>
        <Navbar.Brand as={Link} href="/dashboard">
          Dashboard
        </Navbar.Brand>
        
        <Nav className="ms-auto">
          {canAccessTodo && (
            <Nav.Link 
              as={Link} 
              href="/todo" 
              className={isActive('/todo') ? 'active' : ''}
            >
              Todo
            </Nav.Link>
          )}
          
          {canAccessInterviews && (
            <Nav.Link 
              as={Link} 
              href="/interviews" 
              className={isActive('/interviews') ? 'active' : ''}
            >
              Interviews
            </Nav.Link>
          )}
          
          {canAccessAP && (
            <Nav.Link 
              as={Link} 
              href="/accounts-payable" 
              className={isActive('/accounts-payable') ? 'active' : ''}
            >
              Accounts Payable
            </Nav.Link>
          )}
          
          {canAccessOnboarding && (
            <Nav.Link 
              as={Link} 
              href="/onboarding" 
              className={isActive('/onboarding') ? 'active' : ''}
            >
              Onboarding
            </Nav.Link>
          )}

          {isAdmin && (
            <>
              <Nav.Link 
                as={Link} 
                href="/csv-import" 
                className={isActive('/csv-import') ? 'active' : ''}
              >
                Data Loader
              </Nav.Link>
              
              <Nav.Link 
                as={Link} 
                href="/admin/users" 
                className={isActive('/admin/users') ? 'active' : ''}
              >
                User Management
              </Nav.Link>
            </>
          )}
          
          {isAdmin && (
            <Nav.Link 
              as={Link} 
              href="/sheet-sync" 
              className={isActive('/sheet-sync') ? 'active' : ''}
            >
              Sync Sheet
            </Nav.Link>
          )}
          
          <Nav.Link href="/api/auth/signout">
            Sign Out ({session.user?.email})
          </Nav.Link>
        </Nav>
      </Container>
    </Navbar>
  );
} 