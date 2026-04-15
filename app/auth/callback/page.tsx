"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Processing invitation...");

  useEffect(() => {
    async function handleCallback() {
      // Supabase puts tokens in the URL hash: #access_token=...&type=invite
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const type = params.get("type");

      if (type === "invite" || type === "recovery") {
        // Supabase client auto-detects the hash and sets up the session
        // Wait briefly for onAuthStateChange to process the token
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // Session established from hash — redirect to set password
          router.replace("/?set_password=true");
        } else {
          // Session not yet ready — wait for auth state change
          setStatus("Setting up your account...");
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
              subscription.unsubscribe();
              router.replace("/?set_password=true");
            }
          });
          // Timeout fallback
          setTimeout(() => {
            subscription.unsubscribe();
            setStatus("Something went wrong. Please try the link again or contact your admin.");
          }, 10000);
        }
      } else {
        // Not an invite — just redirect to app
        router.replace("/");
      }
    }

    handleCallback();
  }, [router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>Archigent</div>
        <p style={{ color: "#666" }}>{status}</p>
      </div>
    </div>
  );
}
