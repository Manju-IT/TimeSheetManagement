export interface Me {
    id: string;
    email: string;
    full_name: string;
    timezone: string | null;
    org_id: string;
    github_login: string | null;
    roles: string[];
    permissions: string[];
}

export interface AuthConfig {
    oidc_enabled: boolean;
    local_dev_auth: boolean;
    app_name: string;
}

export interface StartLogin {
    authorize_url: string;
    state: string;
}