import React from 'react';

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <div className="w-5 h-5 border-2 border-[#F27D26] border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-500">Loading...</span>
    </div>
  );
}
