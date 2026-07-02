import "../styles/globals.css";
import { useEffect } from "react";
import { ClerkProvider, RedirectToSignIn, SignedIn, SignedOut, useAuth } from "@clerk/nextjs";
import { EventProvider } from "../store/event";
import { LanguageProvider } from "../lib/i18n/context";
import Layout from "../components/Layout";
import { clerkFrontendConfigured, clerkPublishableKey } from "../lib/auth";
import { setApiClientScope, setAuthTokenProvider } from "../services/api";

function AppProviders({ children, userKey }) {
  return (
    <LanguageProvider>
      <EventProvider userKey={userKey}>{children}</EventProvider>
    </LanguageProvider>
  );
}

function PageShell({ Component, pageProps }) {
  if (Component.authPage) {
    return <Component {...pageProps} />;
  }

  const page = (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );

  if (!clerkFrontendConfigured || Component.publicPage) {
    return page;
  }

  return (
    <>
      <SignedIn>{page}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function ClerkTokenBridge({ Component, pageProps }) {
  const { getToken, isLoaded, userId } = useAuth();

  useEffect(() => {
    setApiClientScope(isLoaded && userId ? `clerk:${userId}` : "signed-out");
    setAuthTokenProvider(async () => {
      if (!isLoaded) return null;
      return getToken();
    });

    return () => {
      setApiClientScope("anonymous");
      setAuthTokenProvider(null);
    };
  }, [getToken, isLoaded, userId]);

  return (
    <AppProviders userKey={isLoaded && userId ? userId : "signed-out"}>
      <PageShell Component={Component} pageProps={pageProps} />
    </AppProviders>
  );
}

export default function App({ Component, pageProps }) {
  if (!clerkFrontendConfigured) {
    return (
      <AppProviders>
        <PageShell Component={Component} pageProps={pageProps} />
      </AppProviders>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkTokenBridge Component={Component} pageProps={pageProps} />
    </ClerkProvider>
  );
}
