"use client";

export function PrintToolbar() {
  return (
    <div className="bs-toolbar bs-print-hide">
      <button type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
