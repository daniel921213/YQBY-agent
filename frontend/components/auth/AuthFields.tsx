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
      <span className="mb-1.5 block text-xs tracking-[0.16em] text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-white/10 bg-obsidian/60 px-3 py-2.5 text-sm text-slate-50 outline-none transition placeholder:text-slate-600 focus:border-ember/70 focus:shadow-[0_0_0_3px_rgba(76,194,255,0.14),0_0_20px_rgba(76,194,255,0.20)]"
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
      className="glow-sweep inline-flex w-full items-center justify-center gap-2 rounded-md border border-ember/50 bg-gradient-to-r from-[#2f9fe8] via-[#4cc2ff] to-[#2f9fe8] px-4 py-2.5 text-sm font-semibold text-[#03101e] shadow-[0_8px_30px_rgba(76,194,255,0.35)] transition hover:brightness-110 hover:shadow-[0_8px_42px_rgba(76,194,255,0.55)] disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
