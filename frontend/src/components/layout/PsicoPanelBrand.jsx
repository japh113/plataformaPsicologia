import React from 'react';
import { Sparkles } from 'lucide-react';

export default function PsicoPanelBrand() {
  return (
    <div className="flex items-center gap-2 text-lg font-black tracking-tight text-gray-900 md:text-2xl">
      <Sparkles className="shrink-0 text-indigo-600" size={24} aria-hidden="true" />
      <span>Psico<span className="text-indigo-600">Panel</span></span>
    </div>
  );
}
