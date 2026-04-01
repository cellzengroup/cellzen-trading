import { forwardRef } from 'react';

const Input = forwardRef(({
  label,
  error,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="form-label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`input-field ${error ? 'input-error' : ''} ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;

