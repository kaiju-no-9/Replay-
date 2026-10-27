"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "primary" | "secondary" | "destructive" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: string;
  className?: string;
}

export default function Badge({
  children,
  variant = "default",
  size = "md",
  icon,
  className = "",
}: BadgeProps) {
  const baseClasses =
    "inline-flex items-center gap-1 font-medium transition-colors tabular-nums select-none";

  const sizeClasses = {
    sm: "px-1 text-xs",
    md: "px-1.5 text-xs",
    lg: "px-2 text-sm",
  };

  const variantStyles = {
    default: "bg-muted/40 text-muted-foreground",
    primary: "bg-primary text-primary-foreground font-bold",
    secondary: "bg-secondary/40 text-secondary-foreground",
    destructive: "bg-destructive/20 text-destructive",
    outline: "bg-background/50 text-foreground",
  };

  return (
    <span
      className={`${baseClasses} ${sizeClasses[size]} ${variantStyles[variant]} ${className}`}
    >
      {icon && <span>{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export { Badge };
