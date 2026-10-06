import { Icon } from './Icon';
import { Button } from './Button';

export function ErrorState({
    title = 'Something went wrong',
    message,
    onRetry,
    retryLabel = 'Try again',
}: {
    title?: string;
    message?: string;
    onRetry?: () => void;
    retryLabel?: string;
}) {
    return (
        <div className="state state-error">
            <div className="state-icon"><Icon name="alert-triangle" size={26} /></div>
            <div className="state-title">{title}</div>
            {message && <div className="state-msg">{message}</div>}
            {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry} iconLeft="refresh">
                    {retryLabel}
                </Button>
            )}
        </div>
    );
}

export function PermissionDenied({
    title = 'Access denied',
    message = 'You do not have permission to view this page. If you believe this is a mistake, contact an administrator.',
}: {
    title?: string;
    message?: string;
}) {
    return (
        <div className="state state-denied">
            <div className="state-icon"><Icon name="lock" size={26} /></div>
            <div className="state-title">{title}</div>
            <div className="state-msg">{message}</div>
        </div>
    );
}

export function NotFound({
    title = 'Page not found',
    message = 'The page you are looking for does not exist or has been moved.',
}: {
    title?: string;
    message?: string;
}) {
    return (
        <div className="state state-404">
            <div className="state-icon"><Icon name="search" size={26} /></div>
            <div className="state-title">{title}</div>
            <div className="state-msg">{message}</div>
            <a href="/" className="btn btn-secondary btn-sm">Go home</a>
        </div>
    );
}