import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  variant?: "single" | "double";
  pattern?: "default" | "dots" | "dense" | "none";
  title?: string;
  footer?: ReactNode;
  className?: string;
}

interface CardSubComponentProps {
  children: ReactNode;
  className?: string;
}

export default function Card({
  children,
  variant = "single",
  pattern = "default",
  title,
  footer,
  className = "",
}: CardProps) {
  const patternChars = {
    default: "░",
    dots: "·",
    dense: "▒",
    none: "",
  };

  const patternChar = patternChars[pattern];

  return (
    <div
      className={`relative overflow-hidden bg-background ${
        variant === "double" ? "border-2 border-border" : "border border-border"
      } ${className}`}
    >
      {pattern !== "none" && (
        <div
          className="absolute inset-0 text-muted-foreground pointer-events-none select-none overflow-hidden opacity-10"
          style={{
            fontSize: "0.5rem",
            lineHeight: "0.5rem",
            wordBreak: "break-all",
            zIndex: 0,
          }}
          aria-hidden="true"
        >
          {patternChar.repeat(400)}
        </div>
      )}

      <div className="relative z-10">
        {title && (
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
        )}
        {children}
        {footer && (
          <div className="border-t border-border px-4 py-3">
            {typeof footer === "boolean" ? (
              <div className="text-xs text-muted-foreground">
                press [esc] to close
              </div>
            ) : (
              footer
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: CardSubComponentProps) {
  return (
    <div className={`border-b border-border px-4 py-3 space-y-1 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "" }: CardSubComponentProps) {
  return <h3 className={`text-sm font-medium ${className}`}>{children}</h3>;
}

export function CardDescription({
  children,
  className = "",
}: CardSubComponentProps) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>{children}</p>
  );
}

export function CardContent({
  children,
  className = "",
}: CardSubComponentProps) {
  return <div className={`px-4 py-3 ${className}`}>{children}</div>;
}

export function CardFooter({
  children,
  className = "",
}: CardSubComponentProps) {
  return (
    <div
      className={`border-t border-border px-4 py-3 flex items-center gap-2 ${className}`}
    >
      {children}
    </div>
  );
}

export { Card };
