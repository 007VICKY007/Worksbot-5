"use client";
import React, { useState, useEffect } from "react";

interface TypewriterHeroProps {
  line1?: string;
  line2?: string;
  speed?: number;       // typing delay ms
  deleteSpeed?: number; // backspacing delay ms
  pauseMs?: number;     // pause after typing full sentence
}

export default function TypewriterHero({
  line1 = "AI Software",
  line2 = "Debugging Assistant",
  speed = 70,
  deleteSpeed = 35,
  pauseMs = 3500,
}: TypewriterHeroProps) {
  const totalChars = line1.length + line2.length;
  const [charCount, setCharCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (!isDeleting) {
      if (charCount < totalChars) {
        timer = setTimeout(() => {
          setCharCount((prev) => prev + 1);
        }, speed);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, pauseMs);
      }
    } else {
      if (charCount > 0) {
        timer = setTimeout(() => {
          setCharCount((prev) => prev - 1);
        }, deleteSpeed);
      } else {
        setIsDeleting(false);
      }
    }

    return () => clearTimeout(timer);
  }, [charCount, isDeleting, totalChars, speed, deleteSpeed, pauseMs]);

  const displayedLine1 = line1.slice(0, Math.min(charCount, line1.length));
  const displayedLine2 = charCount > line1.length ? line2.slice(0, charCount - line1.length) : "";
  const cursorOnLine1 = charCount <= line1.length;

  return (
    <span style={{ display: "inline-block", textAlign: "center", minHeight: "2.3em" }}>
      {/* Line 1: AI Software (Charcoal) */}
      <span style={{ display: "block", color: "#111827", fontWeight: 800 }}>
        {displayedLine1}
        {cursorOnLine1 && (
          <span
            style={{
              display: "inline-block",
              marginLeft: "4px",
              fontWeight: 400,
              color: "#167a5b",
              animation: "twBlink 0.85s infinite",
            }}
          >
            |
          </span>
        )}
      </span>

      {/* Line 2: Debugging Assistant (Vibrant Emerald) */}
      <span
        style={{
          display: "block",
          color: "#167a5b",
          fontWeight: 800,
          marginTop: "6px",
          minHeight: "1.15em",
        }}
      >
        {displayedLine2}
        {!cursorOnLine1 && (
          <span
            style={{
              display: "inline-block",
              marginLeft: "4px",
              fontWeight: 400,
              color: "#167a5b",
              animation: "twBlink 0.85s infinite",
            }}
          >
            |
          </span>
        )}
      </span>

      <style jsx>{`
        @keyframes twBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </span>
  );
}
