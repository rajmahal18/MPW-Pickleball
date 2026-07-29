export default function FlashMessage({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return <div className={`mb-5 border p-3 text-sm font-bold ${error ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>{error || success}</div>;
}
