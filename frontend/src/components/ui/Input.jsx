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
        <label className="block text-sm font-medium text-cz-ink mb-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`block w-full px-3 py-2 border rounded-md shadow-sm placeholder-cz-ink/40 transition-colors duration-200 ${error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-cz-ink/20 focus:outline-none focus:ring-cz-main focus:border-cz-main'} ${className}`}
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
