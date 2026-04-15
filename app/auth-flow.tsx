"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LoginScreen, RegistrationScreen, SetPasswordScreen } from "../components/ui/auth-screens";

export default function AuthFlow({ children }: { children: React.ReactNode }) {
  const [showLogin, setShowLogin] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [needsPasswordSet, setNeedsPasswordSet] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  useEffect(() => {
    // Check if redirected from invite callback with ?set_password=true
    const params = new URLSearchParams(window.location.search);
    if (params.get("set_password") === "true") {
      setNeedsPasswordSet(true);
      // Clean up the URL param
      window.history.replaceState({}, "", window.location.pathname);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!needsPasswordSet) setAuthed(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setNeedsPasswordSet(true);
        setAuthed(false);
      } else if (!needsPasswordSet) {
        setAuthed(!!session);
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show set-password screen for invited users
  if (needsPasswordSet) {
    return (
      <div className="auth-flow">
        <SetPasswordScreen
          onComplete={() => {
            setNeedsPasswordSet(false);
            setAuthed(true);
          }}
        />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="auth-flow">
        {showLogin ? (
          <>
            {registrationSuccess && (
              <div style={{ textAlign: "center", marginBottom: "1rem", padding: "0.75rem 1rem", backgroundColor: "#ecfdf5", color: "#065f46", borderRadius: "0.5rem", fontSize: "0.875rem" }}>
                Account created successfully! Please sign in.
              </div>
            )}
            <LoginScreen onLogin={() => setAuthed(true)} onRegisterLink={() => { setShowLogin(false); setRegistrationSuccess(false); }} />
          </>
        ) : (
          <RegistrationScreen onRegister={() => { setShowLogin(true); setRegistrationSuccess(true); }} onLoginLink={() => setShowLogin(true)} />
        )}
      </div>
    );
  }
  return <>{children}</>;
}
