import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const toneClasses = {
  error: {
    wrapper: 'border-red-200 bg-red-50 text-red-900',
    icon: 'text-red-600',
    hint: 'text-red-700/90',
    button: 'border-red-200/70 text-red-700 hover:bg-red-100',
  },
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: 'text-emerald-600',
    hint: 'text-emerald-700/90',
    button: 'border-emerald-200/70 text-emerald-700 hover:bg-emerald-100',
  },
  info: {
    wrapper: 'border-sky-200 bg-sky-50 text-sky-900',
    icon: 'text-sky-600',
    hint: 'text-sky-700/90',
    button: 'border-sky-200/70 text-sky-700 hover:bg-sky-100',
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: 'text-amber-600',
    hint: 'text-amber-700/90',
    button: 'border-amber-200/70 text-amber-700 hover:bg-amber-100',
  },
};

const iconByTone = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
  warning: Info,
};

export default function InlineNotice({
  tone = 'info',
  title,
  message,
  hint,
  onDismiss,
  className = '',
}) {
  if (!title && !message) {
    return null;
  }

  const palette = toneClasses[tone] || toneClasses.info;
  const Icon = iconByTone[tone] || iconByTone.info;

  return (
    <div className={`rounded-2xl border px-4 py-3 ${palette.wrapper} ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Icon size={18} className={`mt-0.5 shrink-0 ${palette.icon}`} />
          <div className="min-w-0">
            {title && <p className="text-sm font-semibold">{title}</p>}
            {message && <p className={`text-sm leading-6 ${title ? 'mt-1' : ''}`}>{message}</p>}
            {hint && <p className={`mt-2 text-xs leading-5 ${palette.hint}`}>{hint}</p>}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${palette.button}`}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
