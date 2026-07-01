import { SignIn } from "@clerk/nextjs";
import AuthSetupNotice from "../../components/AuthSetupNotice";
import { authAppearance } from "../../lib/clerkAppearance";
import { clerkFrontendConfigured } from "../../lib/auth";

export default function SignInPage() {
  if (!clerkFrontendConfigured) {
    return <AuthSetupNotice mode="sign-in" />;
  }

  return (
    <main className="auth-page">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" appearance={authAppearance} />
    </main>
  );
}

SignInPage.authPage = true;
SignInPage.publicPage = true;
