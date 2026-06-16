// App-wide overlays: toasts (action feedback) and a branded confirm dialog
// (replaces native window.confirm). Tiny external stores so any module can call
// toast()/confirmDialog() without prop-drilling; <Overlays/> renders them once.

import { useSyncExternalStore } from "react";

// ---------- toasts ----------
export type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  type: ToastType;
  msg: string;
}
let toastList: ToastItem[] = [];
let toastSeq = 1;
const toastSubs = new Set<() => void>();
const emitToasts = () => toastSubs.forEach((f) => f());

export function toast(msg: string, type: ToastType = "info") {
  const id = toastSeq++;
  toastList = [...toastList, { id, type, msg }];
  emitToasts();
  setTimeout(() => {
    toastList = toastList.filter((t) => t.id !== id);
    emitToasts();
  }, 4200);
}

function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      toastSubs.add(cb);
      return () => toastSubs.delete(cb);
    },
    () => toastList,
  );
}

// ---------- confirm dialog ----------
interface ConfirmReq {
  id: number;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}
let confirmReq: ConfirmReq | null = null;
const confirmSubs = new Set<() => void>();
const emitConfirm = () => confirmSubs.forEach((f) => f());

export function confirmDialog(opts: Omit<ConfirmReq, "id" | "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = { ...opts, id: Date.now(), resolve };
    emitConfirm();
  });
}

function useConfirm() {
  return useSyncExternalStore(
    (cb) => {
      confirmSubs.add(cb);
      return () => confirmSubs.delete(cb);
    },
    () => confirmReq,
  );
}

function closeConfirm(v: boolean) {
  confirmReq?.resolve(v);
  confirmReq = null;
  emitConfirm();
}

// ---------- host (rendered once at app root) ----------
export function Overlays() {
  const toasts = useToasts();
  const req = useConfirm();
  return (
    <>
      <div className="toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-dot" />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
      {req ? (
        <div className="modal-scrim" onClick={() => closeConfirm(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-t">{req.title}</div>
            {req.body ? <div className="modal-b">{req.body}</div> : null}
            <div className="modal-actions">
              <button className="btn" onClick={() => closeConfirm(false)}>
                {req.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={`btn ${req.danger ? "btn-danger" : "btn-solid"}`}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {req.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
