import { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function CareDisclosure({ label, children, icon: Icon, caption, keepMounted = false }) {
  const [opened, setOpened] = useState(false);
  const [visited, setVisited] = useState(false);
  return <details className="group min-w-0 rounded-xl border border-slate-200 bg-white"
    onToggle={event => {
      const open = event.currentTarget.open;
      setOpened(open);
      if (open) setVisited(true);
    }}>
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700 [&::-webkit-details-marker]:hidden">
      {Icon && <Icon size={20} aria-hidden="true" className="shrink-0 text-teal-800" />}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {caption && <span className="block text-sm text-slate-600">{caption}</span>}
      </span>
      <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-slate-500 group-open:rotate-180" />
    </summary>
    <div className="space-y-3 border-t border-slate-100 px-4 py-4">{(opened || (keepMounted && visited)) && children}</div>
  </details>;
}

export function SensitiveAction({ label, description, disabled, onConfirm }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  return <>
    <button ref={trigger} type="button" className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
      disabled={disabled} onClick={() => dialog.current.showModal()}>{label}</button>
    <dialog ref={dialog} aria-labelledby={id} aria-describedby={id + '-description'}
      className="w-[min(28rem,calc(100%-2rem))] rounded-2xl p-5 text-slate-950 shadow-xl backdrop:bg-slate-950/55 sm:p-6"
      onClose={() => trigger.current?.focus()}>
      <h3 id={id} className="text-lg font-bold">{label}</h3>
      <p id={id + '-description'} className="mt-2 text-slate-700">{description}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button autoFocus type="button" className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold"
          onClick={() => dialog.current.close()}>Volver</button>
        <button type="button" className="min-h-11 rounded-lg bg-red-800 px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={disabled} onClick={() => { dialog.current.close(); onConfirm(); }}>Confirmar</button>
      </div>
    </dialog>
  </>;
}
