const PLACEHOLDER_MARKERS = ["your_", "replace_", "pk_test_your", "sk_test_your"];

export function hasUsableSecret(value) {
  if (!value || typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

export const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
export const clerkFrontendConfigured = hasUsableSecret(clerkPublishableKey);
