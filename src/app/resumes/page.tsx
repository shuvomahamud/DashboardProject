"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  InputGroup,
  Form,
  Spinner
} from "react-bootstrap";
import DataTable from "@/components/DataTable";

type ResumeRow = {
  id: number;
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  skills: string | null;
  experience: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    applications: number;
  };
};

type ApiResponse = {
  resumes: ResumeRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

const ResumesPage = () => {
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const loadResumes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize)
      });
      if (searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const response = await fetch(`/api/resumes?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to load candidates");
      }
      const data: ApiResponse = await response.json();
      setRows(data.resumes || []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadResumes();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadResumes]);

  const clearSearch = () => {
    setSearchTerm("");
    setPage(1);
  };

  const columns = useMemo(
    () => [
      {
        id: "candidate",
        name: "Candidate",
        selector: (row: ResumeRow) => row.candidateName || "Unknown",
        sortable: true,
        cell: (row: ResumeRow) => (
          <div>
            <Link href={`/resumes/${row.id}`} className="fw-semibold">
              {row.candidateName || "Unknown"}
            </Link>
            {row.email && (
              <>
                <br />
                <small className="text-muted">{row.email}</small>
              </>
            )}
            {row.phone && (
              <>
                <br />
                <small className="text-muted">{row.phone}</small>
              </>
            )}
          </div>
        ),
        minWidth: "220px",
        grow: 1
      },
      {
        id: "applications",
        name: "Applications",
        selector: (row: ResumeRow) => row._count?.applications ?? 0,
        sortable: true,
        width: "140px",
        cell: (row: ResumeRow) => row._count?.applications ?? 0
      },
      {
        id: "skills",
        name: "Skills",
        selector: (row: ResumeRow) => row.skills || "",
        sortable: false,
        grow: 2,
        cell: (row: ResumeRow) =>
          row.skills ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{row.skills}</div>
          ) : (
            "—"
          )
      },
      {
        id: "experience",
        name: "Experience",
        selector: (row: ResumeRow) => row.experience || "",
        sortable: false,
        grow: 2,
        cell: (row: ResumeRow) =>
          row.experience ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{row.experience}</div>
          ) : (
            "—"
          )
      },
      {
        id: "createdAt",
        name: "Created",
        selector: (row: ResumeRow) => row.createdAt,
        sortable: true,
        width: "170px",
        cell: (row: ResumeRow) =>
          new Date(row.createdAt).toLocaleString()
      },
      {
        id: "updatedAt",
        name: "Updated",
        selector: (row: ResumeRow) => row.updatedAt,
        sortable: true,
        width: "170px",
        cell: (row: ResumeRow) =>
          new Date(row.updatedAt).toLocaleString()
      },
      {
        id: "actions",
        name: "Actions",
        cell: (row: ResumeRow) => (
          <Button
            variant="outline-primary"
            size="sm"
            as={Link}
            href={`/resumes/${row.id}`}
          >
            View
          </Button>
        ),
        width: "100px",
        ignoreRowClick: true,
        button: true
      }
    ],
    []
  );

  return (
    <div className="container-fluid mt-4" style={{ maxWidth: "1200px" }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 fw-bold mb-1">Candidates</h1>
          <p className="text-muted mb-0">Browse all parsed resumes.</p>
        </div>
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body>
          <div className="d-flex flex-wrap gap-3 align-items-center mb-3">
            <InputGroup style={{ maxWidth: "320px" }}>
              <InputGroup.Text>
                <i className="bi bi-search" />
              </InputGroup.Text>
              <Form.Control
                placeholder="Search candidates..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
              />
              {searchTerm && (
                <Button variant="outline-secondary" onClick={clearSearch}>
                  Clear
                </Button>
              )}
            </InputGroup>

            {total > 0 && (
              <div className="text-muted">
                {total} candidate{total !== 1 ? "s" : ""} found
              </div>
            )}
          </div>

          {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}

          {rows.length === 0 && !loading ? (
            <div className="text-center py-5">
              <i className="bi bi-people display-4 text-muted"></i>
              <p className="mt-3 text-muted mb-0">No candidates found.</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              progressPending={loading}
              pagination
              paginationServer
              paginationPerPage={pageSize}
              paginationTotalRows={total}
              onChangePage={(newPage: number) => setPage(newPage)}
              onChangeRowsPerPage={(newPageSize: number) => {
                setPageSize(newPageSize);
                setPage(1);
              }}
            />
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default ResumesPage;
