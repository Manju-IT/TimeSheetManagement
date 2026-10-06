import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import { Icon } from './Icon';

interface FieldShellProps {
    label?: string;
    hint?: ReactNode;
    error?: string | null;
    required?: boolean;
    children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldShellProps) {
    const id = useId();
    return (
        <div className={`field ${error ? 'has-error' : ''}`}>
            {label && (
                <label htmlFor={id} className="field-label">
                    {label}
                    {required && <span className="field-req">*</span>}
                </label>
            )}
            {children(id)}
            {error ? (
                <div className="field-error" role="alert">
                    <Icon name="alert-circle" size={12} />
                    <span>{error}</span>
                </div>
            ) : hint ? (
                <div className="field-hint">{hint}</div>
            ) : null}
        </div>
    );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    function Input(props, ref) {
        return <input ref={ref} className="input" {...props} />;
    },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
    function Textarea(props, ref) {
        return <textarea ref={ref} className="input textarea" {...props} />;
    },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
    function Select({ children, ...props }, ref) {
        return (
            <select ref={ref} className="input select" {...props}>
                {children}
            </select>
        );
    },
);