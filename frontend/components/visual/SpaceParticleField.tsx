interface SpaceParticleFieldProps {
  variant?: "dashboard" | "auth";
}

export function SpaceParticleField({ variant = "dashboard" }: SpaceParticleFieldProps) {
  return (
    <div
      aria-hidden
      className={`space-particle-field ${variant === "auth" ? "space-particle-auth" : ""}`}
    >
      <div className="space-nebula space-nebula-a" />
      <div className="space-nebula space-nebula-b" />
      <div className="space-stars space-stars-far" />
      <div className="space-stars space-stars-near" />
      <div className="space-stars space-stars-twinkle" />
      <div className="space-drift-particles" />
      <div className="space-grid" />
      <div className="space-scanline" />
    </div>
  );
}
