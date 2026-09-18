import { NavLink, Routes, Route, Navigate } from 'react-router-dom';

export function AdminLandingPage() {
    return (
        <div className="page">
            <header className="page-header">
                <h1>Admin</h1>
            </header>
            <nav className="admin-tabs">
                <NavLink to="/admin/users" className="admin-tab">Users & Roles</NavLink>
                <NavLink to="/admin/teams" className="admin-tab">Teams</NavLink>
                <NavLink to="/admin/audit" className="admin-tab">Audit Log</NavLink>
                <NavLink to="/admin/github" className="admin-tab">GitHub</NavLink>
                <NavLink to="/admin/sites" className="admin-tab">Work Sites</NavLink>
                <NavLink to="/admin/policies" className="admin-tab">Policies</NavLink>
            </nav>
            <div className="card">
                <Routes>
                    <Route index element={<Navigate to="users" replace />} />
                    <Route path="users" element={<Stub name="Users & Roles" phase="4" />} />
                    <Route path="teams" element={<Stub name="Teams" phase="4" />} />
                    <Route path="audit" element={<Stub name="Audit Log" phase="4" />} />
                    <Route path="github" element={<Stub name="GitHub Integration" phase="7" />} />
                    <Route path="sites" element={<Stub name="Work Sites" phase="4" />} />
                    <Route path="policies" element={<Stub name="Policies" phase="4" />} />
                </Routes>
            </div>
        </div>
    );
}

function Stub({ name, phase }: { name: string; phase: string }) {
    return (
        <div>
            <h2 style={{ fontSize: 14, marginTop: 0 }}>{name}</h2>
            <p className="muted">
                Admin surface will be implemented in Phase {phase}. Backend endpoints are already
                live and authorized.
            </p>
        </div>
    );
}