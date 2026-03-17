"use client";

import { useState, useEffect, useCallback } from "react";
import { SURVEYS } from "@/lib/surveys";
import type { SurveyQuestion } from "@/lib/surveys";
import { trackEArcadeSurveyStarted, trackEArcadeSurveyCompleted } from "@/lib/himetrica";

const ACCENT = "#c8e64a";
const SURVEY_ID = "earcade_v1";
const survey = SURVEYS[SURVEY_ID];

interface EArcadeCardProps {
  onClose: () => void;
  onEnter: () => void;
  session: unknown;
  onSignIn?: () => void;
}

export default function EArcadeCard({ onClose, session, onSignIn }: EArcadeCardProps) {
  const [step, setStep] = useState(0); // 0 = intro, 1..N = questions, N+1 = thanks, -1 = error
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [alreadyAnswered, setAlreadyAnswered] = useState<boolean | null>(null); // null = loading
  const [submitting, setSubmitting] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);

  // Check if user already answered
  useEffect(() => {
    if (!session) { setAlreadyAnswered(false); return; }
    fetch(`/api/survey?id=${SURVEY_ID}`)
      .then((r) => r.json())
      .then((d) => setAlreadyAnswered(!!d.answered))
      .catch(() => setAlreadyAnswered(false));
  }, [session]);

  const selectAnswer = useCallback(
    (questionKey: string, value: string) => {
      const newAnswers = { ...answers, [questionKey]: value };
      setAnswers(newAnswers);

      const nextStep = step + 1;
      const isLastQuestion = nextStep > survey.questions.length;

      if (isLastQuestion) {
        setSubmitting(true);
        fetch("/api/survey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ surveyId: SURVEY_ID, answers: newAnswers }),
        })
          .then((r) => {
            if (!r.ok) throw new Error("submit failed");
            return r.json();
          })
          .then((d) => {
            trackEArcadeSurveyCompleted();
            setXpEarned(d.xp ?? 0);
            setStep(nextStep);
          })
          .catch(() => setStep(-1)) // error state
          .finally(() => setSubmitting(false));
      } else {
        setStep(nextStep);
      }
    },
    [answers, step],
  );

  const currentQuestion: SurveyQuestion | null =
    step >= 1 && step <= survey.questions.length ? survey.questions[step - 1] : null;

  const showThanks = step > survey.questions.length;

  return (
    <>
      {/* Nav hints */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-30 hidden text-right text-[9px] leading-loose text-muted sm:block">
        <div><span style={{ color: ACCENT }}>ESC</span> close</div>
      </div>

      {/* Card */}
      <div className="pointer-events-auto fixed z-40
        bottom-0 left-0 right-0
        sm:bottom-auto sm:left-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2"
      >
        <div className="relative border-t-[3px] border-border bg-bg-raised/95 backdrop-blur-sm
          w-full max-h-[50vh] overflow-y-auto sm:w-[320px] sm:border-[3px] sm:max-h-[85vh]
          animate-[slide-up_0.2s_ease-out] sm:animate-none"
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-2 right-3 text-[10px] text-muted transition-colors hover:text-cream z-10"
          >
            ESC
          </button>

          {/* Drag handle */}
          <div className="flex justify-center py-2 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          {/* Header (always visible) */}
          <div className="px-4 pb-3 sm:pt-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center border-2"
                style={{ borderColor: ACCENT, backgroundColor: ACCENT + "11" }}
              >
                <span className="text-lg" style={{ color: ACCENT }}>E.</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: ACCENT }}>
                  E.Arcade
                </p>
                <p className="text-[10px] text-muted">The city&apos;s office.</p>
              </div>
            </div>
          </div>

          <div className="mx-4 h-px bg-border" />

          {/* ── Loading state ── */}
          {step === 0 && alreadyAnswered === null && (
            <div className="px-4 py-4 text-center">
              <span className="text-[9px] text-muted">Loading...</span>
            </div>
          )}

          {/* ── Intro state ── */}
          {step === 0 && alreadyAnswered === false && (
            <div className="px-4 py-3 space-y-3">
              <p className="text-[10px] text-muted leading-relaxed">
                A shared space for developers. Play games, meet others, explore floors.
              </p>

              <div className="flex items-center gap-1.5">
                <div
                  className="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT }}
                />
                <span className="text-[9px] text-muted">Coming soon</span>
              </div>

              <div className="mx-0 h-px bg-border" />

              {session ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-cream">
                    Help us decide what to build.
                  </p>
                  <p className="text-[9px] text-muted">
                    {survey.questions.length} questions. Earn {survey.xpReward} XP.
                  </p>
                  <button
                    onClick={() => { trackEArcadeSurveyStarted(); setStep(1); }}
                    className="w-full py-2 text-[10px] font-bold uppercase tracking-wider border-2 transition-all hover:brightness-125"
                    style={{ borderColor: ACCENT, color: ACCENT }}
                  >
                    Start
                  </button>
                </div>
              ) : (
                <button
                  onClick={onSignIn}
                  className="w-full py-2 text-[10px] font-bold uppercase tracking-wider border-2 transition-all hover:brightness-125"
                  style={{ borderColor: ACCENT, color: ACCENT }}
                >
                  Sign in to enter
                </button>
              )}
            </div>
          )}

          {/* ── Already answered state ── */}
          {step === 0 && alreadyAnswered === true && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-[10px] text-muted leading-relaxed">
                A shared space for developers. Play games, meet others, explore floors.
              </p>
              <div className="flex items-center gap-1.5">
                <div
                  className="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT }}
                />
                <span className="text-[9px] text-muted">Coming soon</span>
              </div>
              <div className="mx-0 h-px bg-border" />
              <p className="text-[10px] text-cream">
                Thanks for your feedback!
              </p>
            </div>
          )}

          {/* ── Question state ── */}
          {currentQuestion && (
            <div className="px-4 py-3 space-y-3">
              {/* Progress */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted">
                  {step} / {survey.questions.length}
                </span>
                <div className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(step / survey.questions.length) * 100}%`,
                      backgroundColor: ACCENT,
                    }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-cream font-bold">
                {currentQuestion.title}
              </p>

              <div className="space-y-1.5">
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => selectAnswer(currentQuestion.key, opt.value)}
                    disabled={submitting}
                    className="w-full text-left px-3 py-2.5 text-[10px] border transition-all hover:brightness-125 disabled:opacity-50"
                    style={{
                      borderColor: ACCENT + "33",
                      color: "#e8dcc8",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = ACCENT;
                      e.currentTarget.style.backgroundColor = ACCENT + "11";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = ACCENT + "33";
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Error state ── */}
          {step === -1 && (
            <div className="px-4 py-4 space-y-3 text-center">
              <p className="text-[11px] text-red-400 font-bold">
                Something went wrong.
              </p>
              <p className="text-[9px] text-muted">
                Your answers were not saved.
              </p>
              <button
                onClick={() => {
                  // Retry: go back to last question
                  setStep(survey.questions.length);
                }}
                className="w-full py-2 text-[10px] font-bold uppercase tracking-wider border-2 transition-all hover:brightness-125"
                style={{ borderColor: ACCENT, color: ACCENT }}
              >
                Try again
              </button>
            </div>
          )}

          {/* ── Thanks state ── */}
          {showThanks && (
            <div className="px-4 py-4 space-y-3 text-center">
              <p className="text-[11px] text-cream font-bold">
                Thanks for your input!
              </p>
              {xpEarned > 0 && (
                <p className="text-[10px]" style={{ color: ACCENT }}>
                  +{xpEarned} XP earned
                </p>
              )}
              <p className="text-[9px] text-muted">
                Your answers will shape what we build next.
              </p>
              <button
                onClick={onClose}
                className="w-full py-2 text-[10px] font-bold uppercase tracking-wider border-2 transition-all hover:brightness-125"
                style={{ borderColor: ACCENT + "66", color: ACCENT }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
