import { AuthGuard } from "@/components/auth/AuthGuard";
import { UnderConstruction } from "@/components/nav/UnderConstruction";

export default function BeginnerPage() {
  return (
    <AuthGuard>
      <UnderConstruction title="新手專區" iconKey="learn" />
    </AuthGuard>
  );
}
