import { Loader2 } from "lucide-react";

interface FieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}

export function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs tracking-[0.16em] text-stone-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-stone-50 outline-none transition placeholder:text-stone-600 focus:border-ember/60"
      />
    </label>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p className="rounded-md border border-short/30 bg-short/10 px-3 py-2 text-sm text-red-100">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="rounded-md border border-long/30 bg-long/10 px-3 py-2 text-sm text-emerald-100">
        {success}
      </p>
    );
  }
  return null;
}

export function SubmitButton({
  loading,
  children
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-ember/40 bg-ember/15 px-4 py-2.5 text-sm font-medium text-ember transition hover:bg-ember/25 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
