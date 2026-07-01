import { SignUp } from "@clerk/nextjs";
import AuthSetupNotice from "../../components/AuthSetupNotice";
import { authAppearance } from "../../lib/clerkAppearance";
import { clerkFrontendConfigured } from "../../lib/auth";

export default function SignUpPage() {
  if (!clerkFrontendConfigured) {
    return <AuthSetupNotice mode="sign-up" />;
  }

  return (
    <main className="auth-page">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" appearance={authAppearance} />
    </main>
  );
}

SignUpPage.authPage = true;
SignUpPage.publicPage = true;
