import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * AppShell — root layout wrapper.
 * Enforces dark mode, full-height, mobile-first centering.
 */
export function AppShell({ children, className }: AppShellProps) {
  return (
    <div
      className={cn(
        "dark min-h-screen w-full bg-background text-white",
        "flex flex-col antialiased",
        className
      )}
    >
      {children}
    </div>
  );
}
