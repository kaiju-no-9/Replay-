"use client";

interface ButtonProps {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "icon";
  className?: string;
  icon?: string;
  type?: "button" | "submit" | "reset";
  title?: string;
}

export default function Button({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  className = "",
  icon,
  type = "button",
  title,
}: ButtonProps) {
  const baseClasses =
    "px-1.5 py-0.5 transition-all duration-200 cursor-pointer select-none text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background font-medium";

  const variantClasses = {
    primary:
      "bg-primary/30 text-primary-foreground hover:bg-primary/50 disabled:bg-primary/20 disabled:hover:bg-primary/35 disabled:text-primary-foreground",
    secondary:
      "bg-secondary/30 text-secondary-foreground hover:bg-secondary/50 disabled:bg-secondary/15 disabled:hover:bg-secondary/25",
    ghost:
      "bg-accent/20 text-foreground hover:bg-accent/40 opacity-60 hover:opacity-100 disabled:bg-accent/10 disabled:hover:bg-accent/20",
    icon: "text-primary hover:bg-primary/40 disabled:hover:bg-primary/20 p-1",
  };

  const isIconOnly = variant === "icon" || (!children && icon);

  const content = (
    <>
      {icon && <span className={children ? "mr-1" : ""}>{icon}</span>}
      {children}
    </>
  );

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${className}`}
      aria-label={isIconOnly ? String(children) : undefined}
    >
      {variant === "secondary" ? <>[ {content} ]</> : content}
    </button>
  );
}

export { Button };
