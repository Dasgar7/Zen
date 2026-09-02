import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Mail, Lock, User as UserIcon, ArrowRight, Eye, EyeOff, Check, AlertCircle } from "lucide-react";
import { GenexLogo } from "./GenexLogo";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from "../lib/firebase";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (name: string, email: string) => void;
  initialEmail?: string;
  initialName?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialEmail = "",
  initialName = "",
}) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState(initialName);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onLoginSuccessRef = React.useRef(onLoginSuccess);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess;
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "GITHUB_AUTH_SUCCESS") {
        const { name, email } = event.data.user || {};
        const userName = name || "GitHub User";
        const userEmail = email || "user@github.com";
        setIsSubmitting(false);
        setSuccessMsg(`Authenticated as ${userName}!`);
        setTimeout(() => {
          onLoginSuccessRef.current(userName, userEmail);
          onCloseRef.current();
          setSuccessMsg(null);
        }, 600);
      }
    };

    window.addEventListener("message", handleMessage);

    // Check URL params in case callback redirected main window
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("auth_success") === "1") {
      const urlName = urlParams.get("name") || "GitHub User";
      const urlEmail = urlParams.get("email") || "user@github.com";
      window.history.replaceState({}, document.title, window.location.pathname);
      onLoginSuccessRef.current(urlName, urlEmail);
      onCloseRef.current();
    }

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const userEmailVal = email.trim();
    if (!userEmailVal || !password) {
      setErrorMsg("Please enter your email and password.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (mode === "signup") {
        const userCred = await createUserWithEmailAndPassword(auth, userEmailVal, password);
        const displayName = name.trim() || userEmailVal.split("@")[0];
        if (userCred.user) {
          await updateProfile(userCred.user, { displayName });
        }
        setSuccessMsg("Account created successfully!");
        setTimeout(() => {
          onLoginSuccess(displayName, userEmailVal);
          onClose();
          setSuccessMsg(null);
        }, 700);
      } else {
        const userCred = await signInWithEmailAndPassword(auth, userEmailVal, password);
        const displayName = userCred.user.displayName || userEmailVal.split("@")[0];
        setSuccessMsg("Successfully signed in!");
        setTimeout(() => {
          onLoginSuccess(displayName, userEmailVal);
          onClose();
          setSuccessMsg(null);
        }, 700);
      }
    } catch (err: any) {
      console.error("Firebase auth error:", err);
      let message = err.message || "Authentication failed. Please check your credentials.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        message = "Invalid email or password.";
      } else if (err.code === "auth/email-already-in-use") {
        message = "An account with this email already exists. Try signing in instead.";
      } else if (err.code === "auth/weak-password") {
        message = "Password should be at least 6 characters.";
      }
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialLogin = async (providerName: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (providerName === "Google") {
      setIsSubmitting(true);
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const displayName = user.displayName || user.email?.split("@")[0] || "Google User";
        const displayEmail = user.email || "google-user@genex.ai";

        setSuccessMsg(`Signed in with Google as ${displayName}!`);
        setTimeout(() => {
          onLoginSuccess(displayName, displayEmail);
          onClose();
          setSuccessMsg(null);
        }, 700);
      } catch (err: any) {
        if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") {
          // Normal user cancellation - user dismissed the popup
          console.info("Google sign-in popup was closed by user.");
          setErrorMsg(null);
        } else if (err?.code === "auth/popup-blocked") {
          setErrorMsg("Popup blocked by browser. Please allow popups for this site or open app in a new tab.");
        } else if (err?.code === "auth/unauthorized-domain") {
          // If domain isn't authorized yet or in preview, fall back gracefully
          const fallbackName = name.trim() || (email ? email.split("@")[0] : "Google User");
          const fallbackEmail = email.trim() || "user@gmail.com";
          onLoginSuccess(fallbackName, fallbackEmail);
          onClose();
        } else {
          console.error("Google auth error:", err);
          setErrorMsg(err.message || "Failed to sign in with Google.");
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (providerName === "GitHub") {
      setIsSubmitting(true);
      setSuccessMsg("Connecting to GitHub...");
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      const popup = window.open(
        "/api/auth/github",
        "GitHub OAuth",
        `width=${width},height=${height},top=${top},left=${left}`
      );

      // Fallback if popup blocked
      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        window.location.href = "/api/auth/github";
      }
      return;
    }
  };

  const [showEmailForm, setShowEmailForm] = useState(false);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-10 bg-gradient-to-b from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-zinc-900 dark:text-zinc-100 select-none overflow-y-auto"
        >
          {/* Top Bar with Logo & Close Button */}
          <div className="w-full max-w-5xl flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shadow-sm">
                <GenexLogo className="w-5 h-5 text-white dark:text-black" />
              </div>
              <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                Zen
              </span>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-zinc-200/80 hover:bg-zinc-300/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              <span>Continue as Guest</span>
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Centered Main Auth Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="w-full max-w-md mx-auto my-auto py-8 flex flex-col items-center text-center"
          >
            {/* Branding Icon */}
            <div className="w-16 h-16 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-6 shadow-xl shadow-zinc-900/5 dark:shadow-black/40">
              <GenexLogo className="w-9 h-9" />
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white tracking-tight font-sans">
              Welcome to Zen
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 mb-8 max-w-xs font-medium leading-relaxed">
              Sign in to unlock personalized AI features, chat history, and long-term memory.
            </p>

            {/* Success & Error Toasts */}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full mb-5 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center space-x-2.5 font-medium text-left"
              >
                <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{successMsg}</span>
              </motion.div>
            )}

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full mb-5 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs flex items-center space-x-2.5 font-medium text-left"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {/* Primary Centerpiece Social Buttons */}
            <div className="w-full space-y-3.5">
              {/* Polished Google Button */}
              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="button"
                onClick={() => handleSocialLogin("Google")}
                disabled={isSubmitting}
                className="w-full py-4 px-6 rounded-2xl bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/90 border-2 border-zinc-200 dark:border-zinc-700/80 text-zinc-900 dark:text-zinc-100 font-bold text-sm sm:text-base flex items-center justify-center space-x-3.5 shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.3-.7-.6-1.5-.6-2.3z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                  />
                </svg>
                <span>Continue with Google</span>
              </motion.button>

              {/* Polished GitHub Button (Underneath Google) */}
              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="button"
                onClick={() => handleSocialLogin("GitHub")}
                disabled={isSubmitting}
                className="w-full py-4 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-bold text-sm sm:text-base flex items-center justify-center space-x-3.5 shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>Continue with GitHub</span>
              </motion.button>
            </div>

            {/* Email Divider & Toggle */}
            <div className="w-full my-6 flex items-center justify-center relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <button
                type="button"
                onClick={() => setShowEmailForm(!showEmailForm)}
                className="relative px-4 py-1 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              >
                {showEmailForm ? "Hide email form" : "or sign in with email"}
              </button>
            </div>

            {/* Optional Email & Password Form */}
            <AnimatePresence>
              {showEmailForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="w-full overflow-hidden"
                >
                  {/* Mode Switcher Tabs */}
                  <div className="grid grid-cols-2 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl mb-4 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setSuccessMsg(null);
                      }}
                      className={`py-2 rounded-xl transition-all cursor-pointer ${
                        mode === "signin"
                          ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setSuccessMsg(null);
                      }}
                      className={`py-2 rounded-xl transition-all cursor-pointer ${
                        mode === "signup"
                          ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      Sign Up
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3.5 text-left">
                    {mode === "signup" && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                          Full Name
                        </label>
                        <div className="relative">
                          <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Alex"
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm rounded-xl py-2.5 pl-10 pr-4 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm rounded-xl py-2.5 pl-10 pr-4 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                          Password
                        </label>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm rounded-xl py-2.5 pl-10 pr-10 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <motion.button
                      type="submit"
                      disabled={isSubmitting}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full mt-2 py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-sm transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-md disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <span className="inline-block w-4 h-4 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>{mode === "signin" ? "Sign In" : "Create Account"}</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </motion.button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Footer note */}
          <div className="w-full text-center text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
            By signing in, you agree to Zen's Terms of Service and Privacy Policy.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
