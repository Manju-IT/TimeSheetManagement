import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table({ children, className = '', ...rest }: HTMLAttributes<HTMLTableElement>) {
    return (
        <div className="table-wrap">
            <table className={`table ${className}`.trim()} {...rest}>
                {children}
            </table>
        </div>
    );
}

export function THead({ children }: { children: ReactNode }) {
    return <thead>{children}</thead>;
}
export function TBody({ children }: { children: ReactNode }) {
    return <tbody>{children}</tbody>;
}
export function TH({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
    return <th className={className} {...rest}>{children}</th>;
}
export function TD({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
    return <td className={className} {...rest}>{children}</td>;
}