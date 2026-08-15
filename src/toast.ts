export interface ToastData {
  id: number;
  title: string;
  message: string;
}

export const TOAST_EVENT = "sismografo:toast";

let toastSeq = 0;

export function toast(title: string, message: string) {
  window.dispatchEvent(
    new CustomEvent<ToastData>(TOAST_EVENT, {
      detail: { id: ++toastSeq, title, message },
    }),
  );
}
