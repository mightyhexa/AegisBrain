"use client";

import { useSyncExternalStore } from "react";
import type { Credential } from "./api";

// The workspace lives in memory only. API keys are never written to
// localStorage, sessionStorage or cookies: a refresh clears them, on purpose.
// Client-side navigation (router.push) keeps them.

export type Workspace = {
  mode: "registered" | "demo";
  company: string;
  contact: string;
  email: string;
  registrationId?: string;
  tenantId?: string;
  seededPolicies?: number;
  credentials: Credential[];
  acceptedAt: string;
};

let current: Workspace | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const workspace = {
  get: () => current,
  set(w: Workspace) {
    current = w;
    emit();
  },
  clear() {
    current = null;
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useWorkspace(): Workspace | null {
  return useSyncExternalStore(workspace.subscribe, workspace.get, () => null);
}

export function demoWorkspace(): Workspace {
  return {
    mode: "demo",
    company: "Demo workspace",
    contact: "You",
    email: "",
    credentials: [],
    acceptedAt: new Date().toISOString(),
  };
}
