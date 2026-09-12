import React from "react";

export interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  subtitle?: string;
}

export const Header = React.forwardRef<HTMLElement, HeaderProps>(
  ({ title, subtitle, className = "", ...props }, ref) => {
    return (
      <header
        ref={ref}
        className={`w-full py-6 px-8 bg-black/40 backdrop-blur-md border-b border-white/10 flex flex-col gap-1 shadow-[0_4px_30px_rgba(0,0,0,0.5)] ${className}`}
        {...props}
      >
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-primary via-tertiary to-secondary drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
          {title}
        </h1>
        {subtitle && <p className="text-sm font-medium text-white/70">{subtitle}</p>}
      </header>
    );
  },
);
Header.displayName = "Header";
