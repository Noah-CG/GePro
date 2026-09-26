"use client";

import { useEffect, useState } from "react";
import { checkUsername, type UsernameCheck } from "@/actions/auth";
import { usernameFormatError } from "@/lib/usernames";

/** Délai après la dernière frappe avant d'interroger le serveur sur la disponibilité. */
const CHECK_DELAY_MS = 400;

export type UsernameStatus = { error: string | null; available: boolean; checking: boolean };

/**
 * Disponibilité d'un nom d'utilisateur, vérifiée pendant la saisie : le format côté client, puis
 * la disponibilité côté serveur. `current` : nom actuel du compte (toujours disponible pour lui).
 */
export function useUsernameCheck(username: string, current?: string | null): UsernameStatus {
  const [result, setResult] = useState<(UsernameCheck & { for: string }) | null>(null);
  const value = username.trim();
  const formatError = value ? usernameFormatError(value) : null;
  const isCurrent = Boolean(current) && value.toLowerCase() === current?.toLowerCase();
  const skip = !value || Boolean(formatError) || isCurrent;

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await checkUsername(value);
      if (!cancelled) setResult({ ...res, for: value });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, skip]);

  if (!value) return { error: null, available: false, checking: false };
  if (formatError) return { error: formatError, available: false, checking: false };
  if (isCurrent) return { error: null, available: true, checking: false };
  if (result?.for !== value) return { error: null, available: false, checking: true };
  return { error: result.error ?? null, available: result.available, checking: false };
}
