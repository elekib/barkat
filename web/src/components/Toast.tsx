"use client";

// A short notification banner (top right, 3 s), as a context.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Notify = (message: string, type?: "success" | "error") => void;

const ToastContext = createContext<Notify>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback<Notify>((message, type = "success") => {
    setNote({ message, type });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 3500);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {note && (
        <div
          role={note.type === "error" ? "alert" : "status"}
          className={`fixed right-4 top-4 z-[100] max-w-[90vw] rounded-lg px-4 py-3 text-sm font-medium shadow-lg md:max-w-sm ${
            note.type === "success" ? "bg-good text-white" : "bg-bad text-white"
          }`}
        >
          {note.message}
        </div>
      )}
      {children}
    </ToastContext.Provider>
  );
}
