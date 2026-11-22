"use client";

import { useRef, type ReactNode } from "react";

/**
 * A form that saves itself: text and number fields on blur (only if changed),
 * drop-downs and dates as soon as they change. No save button, like editing a sheet.
 */
export function AutoForm({
  action,
  className,
  children,
}: {
  action: (form: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={action}
      className={className}
      onBlur={(e) => {
        const el = e.target;
        if (el instanceof HTMLInputElement && el.type !== "date" && el.value !== el.defaultValue) {
          ref.current?.requestSubmit();
        }
      }}
      onChange={(e) => {
        const el = e.target;
        if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "date")) {
          ref.current?.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
