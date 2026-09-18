import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Building2,
  CheckCircle2,
  LocateFixed,
  LockKeyhole,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { authService } from "../services/authService";
import { DEMO_MEMBER, DEMO_MODE, DEMO_USER } from "../config/env";

function LoginPage() {
  const navigate = useNavigate();
  const { authConfig, setUser } = useAuth();

  const [locationStatus, setLocationStatus] =
    useState("idle");
  const [email, setEmail] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState("");

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationStatus("granted");
      },
      () => {
        setLocationStatus("denied");
      }
    );
  }

  async function continueWithIMS() {
    setError("");
    setIsSigningIn(true);
    try {
      if (DEMO_MODE) {
        const normalizedEmail = (email || DEMO_USER.email).trim().toLowerCase();
        const demoUser = normalizedEmail === DEMO_MEMBER.email
          ? DEMO_MEMBER
          : { ...DEMO_USER, email: normalizedEmail };
        window.localStorage.setItem("timesheet_demo_user", JSON.stringify(demoUser));
        setUser(demoUser);
        navigate("/today");
        return;
      }

      if (authConfig?.local_dev_auth) {
        const result = await authService.devLogin(email);
        setUser(result);
        navigate("/today");
        return;
      }

      const result = await authService.startLogin(window.location.origin);
      window.location.assign(result.authorize_url);
    } catch (signInError) {
      setError(signInError.message);
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <section className="hidden w-1/2 flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-600 p-3">
            <Building2 />
          </div>

          <span className="text-xl font-semibold">
            Team Timesheet
          </span>
        </div>

        <div className="max-w-lg">
          <h1 className="text-4xl font-bold leading-tight">
            Track your work.
            <br />
            Keep your team aligned.
          </h1>

          <p className="mt-5 text-lg leading-8 text-slate-300">
            Manage attendance, projects, tasks and
            timesheets from one secure workspace.
          </p>
        </div>

        <p className="text-sm text-slate-500">
          Secure company access through IMS
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <h1 className="text-xl font-bold">
              Team Timesheet
            </h1>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-7">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <LockKeyhole size={24} />
              </div>

              <h2 className="text-2xl font-bold text-slate-900">
                Welcome back
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sign in using your organization's IMS
                account to access your timesheet.
              </p>
            </div>

            <button
              onClick={continueWithIMS}
              disabled={isSigningIn || (authConfig?.local_dev_auth && !email)}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSigningIn ? "Connecting..." : DEMO_MODE || authConfig?.local_dev_auth ? "Sign in locally" : "Continue with IMS"}
            </button>

            {(DEMO_MODE || authConfig?.local_dev_auth) && (
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                aria-label="Temporary login email"
                placeholder="you@company.com"
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="my-7 border-t border-slate-200" />

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex gap-3">
                <LocateFixed
                  className="mt-0.5 shrink-0 text-slate-600"
                  size={20}
                />

                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Location permission
                  </h3>

                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Your location is recorded during
                    check-in and check-out only.
                  </p>

                  {locationStatus === "granted" ? (
                    <div className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-600">
                      <CheckCircle2 size={17} />
                      Location enabled
                    </div>
                  ) : (
                    <button
                      onClick={requestLocation}
                      className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      Allow location
                    </button>
                  )}

                  {locationStatus === "denied" && (
                    <p className="mt-2 text-xs text-amber-600">
                      Location permission was denied.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LoginPage; 