export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cat?: string; error?: string }>;
}) {
  const params = await searchParams;
  const success = params.success === "true";
  const category = params.cat ?? "all";
  const error = params.error;

  const categoryLabels: Record<string, string> = {
    all: "all emails",
    social: "social notifications",
    digest: "digest emails",
    marketing: "marketing emails",
    streak_reminders: "streak reminders",
    transactional: "transactional emails",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#060a14",
        fontFamily: "monospace",
        color: "#e0d8cc",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          textAlign: "center",
          background: "#0a0f1e",
          padding: "40px 32px",
          border: "1px solid #1a1f2e",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            letterSpacing: 4,
            color: "#c8e64a",
            marginTop: 0,
          }}
        >
          GIT CITY
        </h1>

        <div
          style={{
            height: 2,
            background: "linear-gradient(90deg, transparent, #c8e64a, transparent)",
            margin: "20px 0",
          }}
        />

        {error ? (
          <>
            <p style={{ fontSize: 18, color: "#ff6b6b" }}>Invalid or expired link</p>
            <p style={{ color: "#666", fontSize: 14 }}>
              This unsubscribe link may have expired or is invalid.
              You can manage your notifications from your Git City settings.
            </p>
          </>
        ) : success ? (
          <>
            <p style={{ fontSize: 18 }}>
              You&apos;ve been unsubscribed from{" "}
              <strong style={{ color: "#c8e64a" }}>
                {categoryLabels[category] ?? category}
              </strong>
              .
            </p>
            <p style={{ color: "#666", fontSize: 14 }}>
              You can re-enable notifications anytime from your Git City settings.
            </p>
          </>
        ) : (
          <p style={{ color: "#666", fontSize: 14 }}>
            Use the link in your email to manage your notification preferences.
          </p>
        )}

        <div
          style={{
            height: 2,
            background: "linear-gradient(90deg, transparent, #222, transparent)",
            margin: "20px 0",
          }}
        />

        <a
          href="https://thegitcity.com"
          style={{ color: "#c8e64a", fontSize: 14, textDecoration: "underline" }}
        >
          Back to Git City
        </a>
      </div>
    </div>
  );
}
