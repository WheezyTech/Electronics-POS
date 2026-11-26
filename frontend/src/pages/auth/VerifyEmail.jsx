import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import webLogo from "../../../assets/branding/Electronics POS Web logo.png";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [email, setEmail] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const uid = searchParams.get("uid");
  const token = searchParams.get("token");

  useEffect(() => {
    let active = true;

    if (!uid || !token) {
      return undefined;
    }

    api.post("/auth/email-verification/", { uid, token })
      .then(() => {
        if (active) setStatus("verified");
      })
      .catch(() => {
        if (active) setStatus("invalid");
      });

    return () => {
      active = false;
    };
  }, [uid, token]);

  const handleRequest = async (event) => {
    event.preventDefault();
    setRequestError("");
    setRequesting(true);
    try {
      await api.post("/auth/email-verification/request/", { email });
      setStatus("sent");
    } catch (error) {
      setRequestError(
        error.response?.data?.detail ||
          "Unable to request an email verification link."
      );
    } finally {
      setRequesting(false);
    }
  };

  const handleOtpVerification = async (event) => {
    event.preventDefault();
    setRequestError("");
    setVerifyingOtp(true);
    try {
      await api.post("/auth/email-verification/otp/", { email, otp });
      setStatus("verified");
    } catch (error) {
      setRequestError(
        error.response?.data?.detail ||
          "Unable to verify the email OTP."
      );
    } finally {
      setVerifyingOtp(false);
    }
  };

  const messages = {
    verifying: "Verifying your email address...",
    verified: "Your email is verified. You can now use password reset.",
    invalid: "This verification link is invalid or has expired.",
    request: "Enter the email address on your account to request a verification link.",
    sent: "If an active account with an unverified email exists, a verification link has been sent.",
  };
  const pageStatus = !uid && !token
    ? status === "sent" ? "sent" : "request"
    : !uid || !token
      ? "invalid"
      : status;

  return (
    <div className="login-page flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <img
          src={webLogo}
          alt="Electronics POS"
          className="mx-auto mb-6 w-64 max-w-full object-contain"
        />
        <h1 className="mb-3 text-xl font-bold text-slate-900">
          Email verification
        </h1>
        <p
          role={pageStatus === "invalid" || requestError ? "alert" : "status"}
          className={pageStatus === "invalid" ? "text-sm text-red-700" : "text-sm text-slate-600"}
        >
          {messages[pageStatus]}
        </p>
        {requestError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {requestError}
          </p>
        )}
        {pageStatus === "request" && (
          <div className="mt-5 space-y-5 text-left">
            <form onSubmit={handleRequest} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border p-3"
                />
              </label>
              <button
                type="submit"
                disabled={requesting}
                className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {requesting ? "Sending..." : "Send verification link"}
              </button>
            </form>

            <form onSubmit={handleOtpVerification} className="space-y-3 border-t pt-5">
              <label className="block text-sm font-medium text-slate-700">
                Verification OTP
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="mt-1 w-full rounded-lg border p-3"
                  placeholder="Enter 6-digit OTP"
                />
              </label>
              <button
                type="submit"
                disabled={verifyingOtp}
                className="w-full rounded-lg border border-blue-600 py-3 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
              >
                {verifyingOtp ? "Verifying..." : "Verify OTP"}
              </button>
            </form>
          </div>
        )}
        <Link
          to="/login"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
