import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const PLACEHOLDER_MARKERS = ["your_", "replace_", "pk_test_your", "sk_test_your"];
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/login(.*)", "/signup(.*)", "/register(.*)"]);

function hasUsableSecret(value) {
  if (!value || typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

const clerkGate = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export default function middleware(req, event) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!hasUsableSecret(publishableKey) || !hasUsableSecret(secretKey)) {
    return NextResponse.next();
  }

  return clerkGate(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
