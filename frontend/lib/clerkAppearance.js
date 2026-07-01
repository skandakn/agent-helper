export const authAppearance = {
  variables: {
    colorPrimary: "#ff7a33",
    colorBackground: "#111827",
    colorText: "#f8fafc",
    colorTextSecondary: "#cbd5e1",
    colorInputBackground: "#080b14",
    colorInputText: "#f8fafc",
    colorNeutral: "#f8fafc",
    borderRadius: "8px",
    fontFamily: '"Inter", "Noto Sans", system-ui, sans-serif',
  },
  elements: {
    card: {
      background: "linear-gradient(180deg, rgba(19, 26, 46, 0.98), rgba(12, 16, 32, 0.98))",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      boxShadow: "0 26px 90px rgba(0, 0, 0, 0.5)",
    },
    headerTitle: {
      color: "#ffffff",
      fontWeight: 800,
    },
    headerSubtitle: {
      color: "#cbd5e1",
    },
    socialButtonsBlockButton: {
      backgroundColor: "#ffffff",
      border: "1px solid rgba(255, 255, 255, 0.92)",
      boxShadow: "0 10px 26px rgba(15, 23, 42, 0.28)",
      color: "#111827",
      minHeight: "44px",
    },
    socialButtonsBlockButtonText: {
      color: "#111827",
      fontWeight: 800,
    },
    formButtonPrimary: {
      background: "linear-gradient(135deg, #ff7a33, #e84393)",
      boxShadow: "0 12px 30px rgba(255, 122, 51, 0.35)",
      color: "#ffffff",
      fontWeight: 800,
      minHeight: "46px",
    },
    formFieldInput: {
      backgroundColor: "#080b14",
      border: "1px solid rgba(148, 163, 184, 0.26)",
      color: "#f8fafc",
    },
    footerActionLink: {
      color: "#ff9a5c",
      fontWeight: 800,
    },
  },
};
