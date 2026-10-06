export type TaskSource = 'manual' | 'github';
export type SyncState = 'synced' | 'pending_push' | 'syncing' | 'conflict' | 'error';
export interface Task {
    id: string;
    project_id: string;
    title: string;
    description: string;
    status: string;
    assignee_user_id: string | null;
    source: TaskSource;
    gh_item_node_id: string | null;
    gh_content_type: 'issue' | 'pull_request' | 'draft' | null;
    gh_issue_number: number | null;
    gh_repo: string | null;
    gh_url: string | null;
    gh_updated_at: string | null;
    local_updated_at: string;
    sync_state: SyncState;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    sync_last_error_code: string | null;
    conflict_remote_updated_at: string | null;
    conflict_detected_at: string | null;
}