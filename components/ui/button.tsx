import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "default" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-ink text-white hover:bg-slate-800",
  secondary: "bg-teal-50 text-teal-700 hover:bg-teal-100",
  outline: "border border-line bg-white text-ink hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-ink"
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  default: "h-11 px-4 text-sm",
  icon: "h-10 w-10 p-0"
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold transition disabled:pointer-events-none disabled:opacity-60",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
