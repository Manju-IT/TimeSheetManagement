export interface AdminUser {
    id: string;
    email: string;
    full_name: string;
    status: 'active' | 'disabled';
    timezone: string | null;
    github_login: string | null;
    roles: ('member' | 'manager' | 'admin')[];
    created_at: string;
    updated_at: string;
}

export interface WorkSite {
    id: string;
    org_id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_m: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface Policy {
    org_id: string;
    workday_hours: number;
    variance_threshold_minutes: number;
    auto_logout_minutes: number;
    allow_login_without_location: boolean;
    location_retention_days: number;
    updated_at: string;
}

export interface Organization {
    id: string;
    name: string;
    default_timezone: string;
    workday_cutoff: string | null;
    created_at: string;
    updated_at: string;
}

export interface SSOConfig {
    enabled: boolean;
    group_claim: string;
    group_to_role_admin: string | null;
    group_to_role_manager: string | null;
    group_to_role_member: string | null;
    allowed_embed_origins: string[];
    env_oidc_enabled: boolean;
    env_issuer: string | null;
    env_client_id: string | null;
    env_redirect_uri: string | null;
    env_scopes: string;
}

export interface AuditLog {
    id: string;
    actor_user_id: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    ip: string | null;
    created_at: string;
}

export interface SyncLog {
    id: string;
    direction: 'pull' | 'push';
    entity: 'project' | 'task';
    entity_id: string | null;
    gh_node_id: string | null;
    trigger: 'webhook' | 'schedule' | 'manual' | 'user_edit';
    status: 'success' | 'failed' | 'skipped' | 'conflict';
    error_message: string | null;
    created_at: string;
}

export interface Page<T> {
    data: T[];
    pagination: { page: number; page_size: number; total: number; has_next: boolean };
}