"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "double";
  error?: boolean;
  label?: string;
  icon?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = "default",
      error = false,
      label,
      icon,
      className = "",
      disabled = false,
      ...props
    },
    ref
  ) => {
    const baseClasses =
      "w-full bg-transparent px-3 py-2 text-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

    const variantClasses = {
      default:
        "border border-input focus:border-ring focus:ring-1 focus:ring-ring hover:border-ring/50",
      double:
        "border-2 border-input focus:border-ring focus:ring-2 focus:ring-ring hover:border-ring/50",
    };

    const errorClasses = error
      ? "border-destructive focus:border-destructive focus:ring-destructive"
      : "";

    return (
      <div className="w-full">
        {label && (
          <label className="mb-1.5 block text-sm text-muted-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={`${baseClasses} ${
              variantClasses[variant]
            } ${errorClasses} ${icon ? "pl-8" : ""} ${className}`}
            {...props}
          />
        </div>
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
export default Input;
