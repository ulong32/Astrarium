import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => {
    const baseClasses =
      "inline-flex items-center justify-center rounded-full font-bold transition-all duration-300 ease-in-out hover:scale-105 active:scale-95";

    const variants = {
      primary:
        "bg-[#ff528a] text-white hover:bg-[#ff528a]/90 shadow-[0_0_15px_rgba(255,82,138,0.5)] hover:shadow-[0_0_25px_rgba(255,82,138,0.8)]",
      secondary:
        "bg-[#5ae0fe] text-black hover:bg-[#5ae0fe]/90 shadow-[0_0_15px_rgba(90,224,254,0.5)] hover:shadow-[0_0_25px_rgba(90,224,254,0.8)]",
      tertiary:
        "bg-[#9d52ff] text-white hover:bg-[#9d52ff]/90 shadow-[0_0_15px_rgba(157,82,255,0.5)] hover:shadow-[0_0_25px_rgba(157,82,255,0.8)]",
    };

    const sizes = {
      sm: "px-4 py-2 text-sm",
      md: "px-6 py-3 text-base",
      lg: "px-8 py-4 text-lg",
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
