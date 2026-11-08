// Shared toast queue. Islands call `toast.success(...)`; the single <ToastHost> in AdminLayout renders it.
import { reactive } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Success and info toasts disappear on their own; errors stay until closed (DESIGN §8). */
export const TOAST_TIMEOUT_MS = 4000;

export const toasts = reactive<ToastItem[]>([]);

let nextId = 1;

export function dismissToast(id: number): void {
  const index = toasts.findIndex((t) => t.id === id);
  if (index !== -1) toasts.splice(index, 1);
}

function push(kind: ToastKind, message: string): number {
  const id = nextId++;
  toasts.push({ id, kind, message });
  if (kind !== 'error') setTimeout(() => dismissToast(id), TOAST_TIMEOUT_MS);
  return id;
}

export const toast = {
  success: (message: string) => push('success', message),
  info: (message: string) => push('info', message),
  error: (message: string) => push('error', message),
};
