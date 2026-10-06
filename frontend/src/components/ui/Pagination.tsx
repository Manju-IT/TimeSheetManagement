import { Button } from './Button';

export function Pagination({
    page,
    pageSize,
    total,
    hasNext,
    onPage,
}: {
    page: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
    onPage: (p: number) => void;
}) {
    const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);
    const pageCount = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="pagination">
            <span className="muted small num">
                {total === 0 ? 'No results' : `Showing ${first}–${last} of ${total}`}
                <span className="pagination-page"> · page {page} of {pageCount}</span>
            </span>
            <div className="pagination-controls">
                <Button variant="ghost" size="sm" iconLeft="chevron-left" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                    Prev
                </Button>
                <Button variant="ghost" size="sm" iconRight="chevron-right" disabled={!hasNext} onClick={() => onPage(page + 1)}>
                    Next
                </Button>
            </div>
        </div>
    );
}