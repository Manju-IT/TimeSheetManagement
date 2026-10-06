export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type CodeLinkType =
    | 'commit'
    | 'pull_request'
    | 'branch'
    | 'file'
    | 'compare'
    | 'other';

export interface CodeLink {
    id: string;
    url: string;
    link_type: CodeLinkType;
    repo: string | null;
    ref: string | null;
    number: string | null;
    note: string | null;
}

export interface TimeEntry {
    id: string;
    user_id: string;
    work_date: string;
    project_id: string;
    task_id: string | null;
    task_title_snapshot: string | null;
    description: string;
    started_at: string | null;
    ended_at: string | null;
    duration_minutes: number;
    billable: boolean;
    status: TimeEntryStatus;
    version: number;
    code_links: CodeLink[];
    created_at: string;
    updated_at: string;
}

export interface CodeLinkPreview {
    url: string;
    link_type: CodeLinkType;
    repo: string | null;
    ref: string | null;
    number: string | null;
    is_github: boolean;
}