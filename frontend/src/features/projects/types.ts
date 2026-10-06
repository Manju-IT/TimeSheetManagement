export type ProjectSource = 'manual' | 'github';

export interface Project {
    id: string;
    org_id: string;
    name: string;
    code: string | null;
    source: ProjectSource;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}