import { AuthGuard } from "@/components/auth/AuthGuard";
import { UnderConstruction } from "@/components/nav/UnderConstruction";

export default function IndicatorsPage() {
  return (
    <AuthGuard>
      <UnderConstruction title="指標專區" iconKey="chart" />
    </AuthGuard>
  );
}
