"use client";

export default function PrintButton() {
  return <button onClick={() => window.print()} className="btn-ghost" type="button">Print code sheet</button>;
}
