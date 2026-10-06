import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from './AdminLayout';

import { UsersAdminPage } from './pages/UsersAdminPage';
import { TeamsAdminPage } from './pages/TeamsAdminPage';
import { WorkSitesAdminPage } from './pages/WorkSitesAdminPage';
import { PoliciesAdminPage } from './pages/PoliciesAdminPage';
import { OrganizationAdminPage } from './pages/OrganizationAdminPage';
import { SSOAdminPage } from './pages/SSOAdminPage';
import { AuditLogAdminPage } from './pages/AuditLogAdminPage';
import { SyncLogAdminPage } from './pages/SyncLogAdminPage';
import { GithubAdminPage } from './GithubAdminPage';

import { ProjectsAdminPage } from './pages/ProjectsAdminPage';
import { TasksAdminPage } from './pages/TasksAdminPage';



export function AdminLandingPage() {
    return (
        <Routes>

            <Route element={<AdminLayout />}>

                <Route
                    index
                    element={
                        <Navigate
                            to="organization"
                            replace
                        />
                    }
                />

                <Route
                    path="organization"
                    element={<OrganizationAdminPage />}
                />

                <Route
                    path="users"
                    element={<UsersAdminPage />}
                />

                <Route
                    path="teams"
                    element={<TeamsAdminPage />}
                />

                <Route
                    path="github"
                    element={<GithubAdminPage />}
                />

                <Route
                    path="sync-logs"
                    element={<SyncLogAdminPage />}
                />

                <Route
                    path="sso"
                    element={<SSOAdminPage />}
                />

                <Route
                    path="work-sites"
                    element={<WorkSitesAdminPage />}
                />

                <Route
                    path="policies"
                    element={<PoliciesAdminPage />}
                />

                <Route
                    path="audit"
                    element={<AuditLogAdminPage />}
                />
                <Route path="projects" element={<ProjectsAdminPage />} />
                <Route path="tasks" element={<TasksAdminPage />} />

            </Route>

        </Routes>
    );
}