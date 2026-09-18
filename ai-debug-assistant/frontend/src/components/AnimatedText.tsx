"use client";
import React from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

interface AnimatedTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}

const letterVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
    rotateX: -40,
    filter: "blur(4px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      damping: 14,
      stiffness: 180,
    },
  },
};

export default function AnimatedText({
  text,
  className = "",
  delay = 0.1,
  stagger = 0.035,
}: AnimatedTextProps) {
  const words = text.split(" ");

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };

  return (
    <motion.span
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      style={{ display: "inline-flex", flexWrap: "wrap", whiteSpace: "pre-wrap" }}
    >
      {words.map((word, wordIndex) => (
        <span
          key={wordIndex}
          style={{ display: "inline-flex", overflow: "hidden", whiteSpace: "nowrap" }}
        >
          {Array.from(word).map((char, charIndex) => (
            <motion.span
              key={charIndex}
              variants={letterVariants}
              style={{ display: "inline-block", transformOrigin: "bottom" }}
            >
              {char}
            </motion.span>
          ))}
          {/* Space between words */}
          {wordIndex < words.length - 1 && <span>&nbsp;</span>}
        </span>
      ))}
    </motion.span>
  );
}
