import React from 'react';
import { Lock } from 'lucide-react';

export default function FutureFeatureCard({ title, description, className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100/80 ${className}`}>
      <div className="absolute inset-0 bg-white/35 backdrop-grayscale-[0.2]" />
      <div className="relative p-4 opacity-70 pointer-events-none select-none">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-gray-700">{title}</h3>
          <Lock size={16} className="text-gray-500" />
        </div>
        <p className="text-sm text-gray-500">{description}</p>
        <span className="inline-flex mt-3 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
          Próximamente
        </span>
      </div>
    </div>
  );
}
