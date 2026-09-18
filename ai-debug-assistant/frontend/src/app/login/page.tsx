"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { login, registerUser, fetchRegisteredUsers, UserRecord } from "@/lib/api";
import { saveSession, isLoggedIn } from "@/lib/auth";
import AnimatedText from "@/components/AnimatedText";
import TypewriterHero from "@/components/TypewriterHero";
import styles from "./login.module.css";

export default function LandingAndLoginPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode]           = useState<"login" | "register">("login");

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole]         = useState("developer");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  // Interactive accordion state for FAQ cards (all closed by default)
  const [openFaq, setOpenFaq]   = useState<Record<number, boolean>>({});

  // Collapsible state for Developer profile card (closed by default)
  const [devExpanded, setDevExpanded] = useState<boolean>(false);

  const toggleFaq = (idx: number) => {
    setOpenFaq(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // If already authenticated, redirect straight into dashboard
  useEffect(() => {
    if (isLoggedIn()) window.location.href = "/";
  }, []);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (authMode === "login") {
        const result = await login(username.trim(), password);
        saveSession(result.token, result.username);
        window.location.href = "/";
      } else {
        const reg = await registerUser(username.trim(), password, role);
        saveSession(reg.token, reg.user.username);
        setSuccess(`User '${reg.user.username}' registered successfully! Redirecting…`);
        setTimeout(() => {
          window.location.href = "/";
        }, 800);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.landingRoot}>
      {/* ── Decorative 3D Glass Orbs (Matching Reference UI media_1789101606020.png) ── */}
      <div className={styles.orbContainerLeft} aria-hidden="true">
        <div className={styles.torusRingLeft} />
        <div className={styles.glassOrbLeft}>
          <div className={styles.orbSpecular} />
          <div className={styles.orbBadge}>
            <span className={styles.orbBadgeDot} />
            DEBUG FASTER
          </div>
        </div>
      </div>

      <div className={styles.orbContainerRight} aria-hidden="true">
        <div className={styles.torusRingRight} />
        <div className={styles.glassOrbRight}>
          <div className={styles.orbSpecular} />
          <div className={styles.orbBadge}>
            <span className={styles.orbBadgeDot} />
            BUILD BETTER
          </div>
        </div>
      </div>

      {/* ── Top Navigation Bar with Menu & Sign In ── */}
      <header className={styles.navbar}>
        <div className={styles.navInner}>
          <div className={styles.brand}>
            <div className={styles.brandLogo}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <span className={styles.brandTitle}>
              Mindora <span className={styles.brandAccent}>Debug</span>
            </span>
          </div>

          <nav className={styles.navLinks}>
            <a href="#overview" className={`${styles.navItem} ${styles.navItemActive}`}>Overview</a>
            <a href="#capabilities" className={styles.navItem}>Features</a>
            <a href="#architecture" className={styles.navItem}>Architecture</a>
            <a href="#docs" className={styles.navItem}>Q&A Docs</a>
            <a href="#developer" className={styles.navItem}>Developer</a>
          </nav>

          <div className={styles.navRight}>
            <button className={styles.langBtn} title="Global Edition">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </button>
            <button
              className={styles.signInPillBtn}
              onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Presentation Section ── */}
      <main className={styles.heroSection}>
        <div className={styles.heroBadge}>
          <span className={styles.badgeDot} />
          Autonomous Code Intelligence
        </div>

        <h1 className={styles.heroHeading}>
          <TypewriterHero line1="AI Software" line2="Debugging Assistant" speed={65} deleteSpeed={30} pauseMs={3800} />
        </h1>

        <p className={styles.heroSub}>
          An automated Python debugging system that performs comprehensive directory-wide static analysis, detects runtime traps and syntax faults, and delivers precision AI root-cause reasoning with corrected code.
        </p>

        <div className={styles.heroActions}>
          <button
            className={styles.ctaPrimary}
            onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
          >
            Launch Debug Console
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
          <button
            className={styles.ctaSecondary}
            onClick={() => { setAuthMode("register"); setShowAuthModal(true); }}
          >
            Register Account
          </button>
        </div>

        {/* ── Core Value Cards (100% Match to Reference) ── */}
        <div id="capabilities" className={styles.featureGrid}>
          <div className={styles.glassFeatureCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardIconBox}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <button
                className={styles.cardCornerBtn}
                aria-label="Explore Full Directory Scans"
                onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
            <h3 className={styles.featureCardTitle}>Full Directory Scans</h3>
            <p className={styles.featureCardDesc}>
              Traverses your entire project hierarchy recursively without limits, catching syntax anomalies, mutable defaults, bare exceptions, and unused dependencies.
            </p>
            <button
              className={styles.cardActionPill}
              onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
            >
              Explore
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          <div className={styles.glassFeatureCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardIconBox}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <button
                className={styles.cardCornerBtn}
                aria-label="See How AI Root-Cause Diagnosis Works"
                onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
            <h3 className={styles.featureCardTitle}>AI Root-Cause Diagnosis</h3>
            <p className={styles.featureCardDesc}>
              Integrates GPT-4o intelligence to reason about code logic, providing human-readable explanations of why bugs occur and step-by-step resolution breakdowns.
            </p>
            <button
              className={styles.cardActionPill}
              onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
            >
              See How It Works
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          <div className={styles.glassFeatureCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardIconBox}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>
              </div>
              <button
                className={styles.cardCornerBtn}
                aria-label="Try Instant Corrected Code Now"
                onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
            <h3 className={styles.featureCardTitle}>Instant Corrected Code</h3>
            <p className={styles.featureCardDesc}>
              Generates clean, production-ready replacement scripts with syntax highlighting, line tracking, and single-click clipboard exports.
            </p>
            <button
              className={styles.cardActionPill}
              onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
            >
              Try It Now
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Architecture Overview ── */}
        <div id="architecture" className={styles.previewBox}>
          <div className={styles.previewHeader}>
            <div className={styles.previewDotGroup}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            <span className={styles.previewTitle}>Pipeline Architecture</span>
          </div>
          <div className={styles.pipelineFlow}>
            <div className={styles.step}>
              <span className={styles.stepNum}>1</span>
              <span className={styles.stepTitle}>Folder Ingestion</span>
              <span className={styles.stepDesc}>Recursive AST parser inspects every source module</span>
            </div>
            <div className={styles.flowArrow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <span className={styles.stepTitle}>Static Verification</span>
              <span className={styles.stepDesc}>Detects syntax failures, runtime hazards, and bad patterns</span>
            </div>
            <div className={styles.flowArrow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <span className={styles.stepTitle}>AI Neural Diagnosis</span>
              <span className={styles.stepDesc}>Synthesizes error stack with code context to generate safe fixes</span>
            </div>
          </div>
        </div>

        {/* ── Interactive Q&A Documentation ── */}
        <section id="docs" className={styles.docSection}>
          <div className={styles.sectionBadge}>
            <span className={styles.badgeDot} />
            Knowledge Base &amp; Documentation
          </div>
          <h2 className={styles.sectionHeading}>Frequently Asked Questions &amp; Usage Guide</h2>
          <p className={styles.sectionSub}>Everything you need to know about why this tool exists, how it operates, and how to use it.</p>

          <div className={styles.faqList}>
            {[
              {
                q: "Why do we need this AI Software Debugging Assistant?",
                a: (
                  <>
                    <p className={styles.faqLead}>
                      Traditional debugging forces developers to spend hours deciphering cryptic error logs and manually tracing complex stack traces. This tool automates the entire loop from directory inspection to verified, production-ready remediation:
                    </p>
                    <div className={styles.faqGrid}>
                      <div className={styles.faqMiniCard}>
                        <div className={styles.faqMiniCardTitle}>
                          Automated Root-Cause Analysis
                          <span className="badge">GPT-4o</span>
                        </div>
                        <p className={styles.faqMiniCardDesc}>
                          Pinpoints the exact architectural flaw with deep LLM reasoning rather than surface-level warning codes.
                        </p>
                      </div>

                      <div className={styles.faqMiniCard}>
                        <div className={styles.faqMiniCardTitle}>
                          Zero-Latency Local AST Scans
                          <span className="badge">Offline</span>
                        </div>
                        <p className={styles.faqMiniCardDesc}>
                          Recursively inspects your entire Python project hierarchy in milliseconds using Python&apos;s standard library.
                        </p>
                      </div>

                      <div className={styles.faqMiniCard}>
                        <div className={styles.faqMiniCardTitle}>
                          Production-Ready Code Replacements
                          <span className="badge">Verified</span>
                        </div>
                        <p className={styles.faqMiniCardDesc}>
                          Generates complete, syntax-highlighted replacement files with 1-click clipboard and download capabilities.
                        </p>
                      </div>

                      <div className={styles.faqMiniCard}>
                        <div className={styles.faqMiniCardTitle}>
                          Official Certified Audit Reports
                          <span className="badge">Print/PDF</span>
                        </div>
                        <p className={styles.faqMiniCardDesc}>
                          Outputs branded Mindora Intelligence diagnostic statements with dynamic reference IDs and security audit attribution.
                        </p>
                      </div>
                    </div>
                  </>
                ),
              },
              {
                q: "How does user authentication and credential storage work?",
                a: (
                  <>
                    <p className={styles.faqLead}>
                      Enterprise security is built-in with zero plain-text storage, cryptographic salting, and stateless token authorization:
                    </p>
                    <ul className={styles.faqBulletList}>
                      <li className={styles.faqBulletItem}>
                        <strong>Argon2id Cryptographic Hashing:</strong> Passwords are never stored in plain text. They are hashed and salted using Argon2id (the modern password hashing standard resistant to GPU/ASIC brute-force attacks).
                      </li>
                      <li className={styles.faqBulletItem}>
                        <strong>Stateless JWT Bearer Tokens:</strong> Successful login issues an encrypted JSON Web Token (HS256) valid for 8 hours, protecting every API transaction without server session memory leaks.
                      </li>
                      <li className={styles.faqBulletItem}>
                        <strong>Isolated Credential Store:</strong> User profiles and assigned roles (<code>admin</code>, <code>developer</code>, <code>qa_lead</code>) persist in <code>backend/users.json</code> for complete local isolation.
                      </li>
                      <li className={styles.faqBulletItem}>
                        <strong>Dynamic Registration &amp; Role Switching:</strong> Create new user accounts on-the-fly and seamlessly switch between profiles directly from the navigation bar.
                      </li>
                    </ul>
                  </>
                ),
              },
              {
                q: "How does the diagnostic pipeline work under the hood?",
                a: (
                  <>
                    <p className={styles.faqLead}>
                      The workflow operates in four synchronized stages combining deterministic local static analysis with cloud AI reasoning:
                    </p>
                    <ul className={styles.faqBulletList}>
                      <li className={styles.faqBulletItem}>
                        <strong>Stage 1 &middot; Recursive Folder Ingestion:</strong> Discovers and indexes all <code>.py</code> modules across your project hierarchy while safely bypassing virtualenvs (<code>.venv</code>, <code>node_modules</code>, <code>.git</code>).
                      </li>
                      <li className={styles.faqBulletItem}>
                        <strong>Stage 2 &middot; AST Static Verification:</strong> Python&apos;s built-in <code>py_compile</code> and <code>ast.NodeVisitor</code> flag syntax breakages, mutable defaults (e.g. <code>def fn(x=[])</code>), bare <code>except:</code> traps, <code>None</code> identity comparisons, and unreferenced imports with zero latency.
                      </li>
                      <li className={styles.faqBulletItem}>
                        <strong>Stage 3 &middot; AI Neural Diagnosis:</strong> Feeds detected error context and source code into GPT-4o to formulate a clear root-cause diagnosis, numbered step-by-step reasoning, and complete replacement code.
                      </li>
                      <li className={styles.faqBulletItem}>
                        <strong>Stage 4 &middot; Executive Certified Reporting:</strong> Aggregates metrics, categorized issue distributions, and AI insights into the official Mindora Intelligence Report letterhead ready for PDF export.
                      </li>
                    </ul>
                  </>
                ),
              },
              {
                q: "How do I use the application step-by-step?",
                a: (
                  <>
                    <p className={styles.faqLead}>
                      Get from initial code inspection to a verified, certified debugging report in 5 simple steps:
                    </p>
                    <ol className={styles.faqStepList}>
                      <li className={styles.faqStepItem}>
                        <span className={styles.faqStepNum}>1</span>
                        <div className={styles.faqStepText}>
                          <strong>Sign In or Register:</strong> Click <strong>Sign In</strong> at the top right using default credentials (<code>admin</code> / <code>admin123</code>) or click <strong>Register</strong> to create your own profile.
                        </div>
                      </li>
                      <li className={styles.faqStepItem}>
                        <span className={styles.faqStepNum}>2</span>
                        <div className={styles.faqStepText}>
                          <strong>Select Target Directory:</strong> In the dashboard search bar, enter your project path or click the <strong>Browse</strong> button to visually navigate your folders.
                        </div>
                      </li>
                      <li className={styles.faqStepItem}>
                        <span className={styles.faqStepNum}>3</span>
                        <div className={styles.faqStepText}>
                          <strong>Run Instant Scan:</strong> Click <strong>Run scan</strong> to execute AST static analysis and view instant aggregate metrics (Files Scanned, Errors, Warnings, Info).
                        </div>
                      </li>
                      <li className={styles.faqStepItem}>
                        <span className={styles.faqStepNum}>4</span>
                        <div className={styles.faqStepText}>
                          <strong>Inspect &amp; Auto-Diagnose with AI:</strong> Filter issues by severity or file. Click <strong>Analyze with AI</strong> on any file (or <strong>Auto-Diagnose All Files with AI</strong>) for deep root-cause explanations and corrected code.
                        </div>
                      </li>
                      <li className={styles.faqStepItem}>
                        <span className={styles.faqStepNum}>5</span>
                        <div className={styles.faqStepText}>
                          <strong>Review &amp; Export Certified Report:</strong> Switch to the <strong>Report</strong> tab to examine the official Mindora Intelligence Report and click <strong>Print / Save PDF</strong> for executive signoff.
                        </div>
                      </li>
                    </ol>
                  </>
                ),
              },
            ].map((faq, idx) => {
              const isOpen = !!openFaq[idx];
              return (
                <div key={idx} className={`${styles.faqCard} ${isOpen ? styles.faqCardOpen : ""}`}>
                  <button
                    type="button"
                    className={styles.faqToggleBtn}
                    onClick={() => toggleFaq(idx)}
                    aria-expanded={isOpen}
                  >
                    <div className={styles.faqQ}>
                      <span className={styles.qIndicator}>Q</span>
                      <span className={styles.faqQuestionText}>{faq.q}</span>
                    </div>
                    <motion.span
                      className={styles.faqChevron}
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        className={styles.faqAnswerWrapper}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className={styles.faqA}>
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── End-to-End Developer Section ── */}
        <section id="developer" className={styles.devSection}>
          <div className={styles.sectionBadge}>
            <span className={styles.badgeDot} />
            Lead Architect
          </div>
          <h2 className={styles.sectionHeading}>End-to-End Developed by Vignesh Pandiya G</h2>
          <p className={styles.sectionSub}>AI Engineer specializing in automation, multi-agent AI systems, and scalable full-stack applications.</p>

          <div className={`${styles.devCard} ${devExpanded ? styles.devCardOpen : ""}`}>
            <button
              type="button"
              className={styles.devHeaderBtn}
              onClick={() => setDevExpanded(!devExpanded)}
              aria-expanded={devExpanded}
            >
              <div className={styles.devHeader}>
                <div className={styles.devAvatar}>VP</div>
                <div className={styles.devInfo}>
                  <h3 className={styles.devName}>Vignesh Pandiya G</h3>
                  <span className={styles.devRole}>AI Engineer &amp; Full Stack Architect</span>
                  <span className={styles.devLocation}>Chennai, Tamil Nadu &middot; B.Tech in AI &amp; Data Science</span>
                </div>
              </div>

              <div className={styles.devActionGroup}>
                <div className={styles.devTogglePill}>
                  <span>{devExpanded ? "Collapse Profile" : "View Full Profile & Tech Stack"}</span>
                  <motion.span
                    className={styles.devChevron}
                    animate={{ rotate: devExpanded ? 180 : 0 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </motion.span>
                </div>
                <span className={styles.devHintText}>
                  {devExpanded ? "Click to collapse details" : "Click to view full architecture & skills"}
                </span>
              </div>
            </button>

            <AnimatePresence initial={false}>
              {devExpanded && (
                <motion.div
                  className={styles.devBodyWrapper}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <p className={styles.devBio}>
                    Architected and implemented the entire <strong>Python Debug Assistant</strong> end-to-end — from the recursive AST static analysis engine and FastAPI authentication backend with Argon2id credential persistence to the Next.js 16 + React 19 Mindora glassmorphic frontend with custom syntax highlighting and Framer Motion spring physics.
                  </p>

                  <div className={styles.devSkillsGrid}>
                    <div className={styles.devSkillCategory}>
                      <span className={styles.skillLabel}>Core Specializations</span>
                      <div className={styles.skillPills}>
                        <span>Autonomous AI Agents</span>
                        <span>RAG &amp; LLM Engineering</span>
                        <span>AST Code Analysis</span>
                        <span>Full-Stack Architecture</span>
                      </div>
                    </div>
                    <div className={styles.devSkillCategory}>
                      <span className={styles.skillLabel}>Technical Stack</span>
                      <div className={styles.skillPills}>
                        <span>Python / FastAPI</span>
                        <span>Next.js 16 / TypeScript</span>
                        <span>GPT-4o / LangChain</span>
                        <span>Argon2id &amp; JWT Auth</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.devFooter}>
                    <div className={styles.contactItem}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      <span>vigneshpandiya21@gmail.com</span>
                    </div>
                    <div className={styles.contactItem}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      <span>+91 8428984290</span>
                    </div>
                    <div className={styles.contactItem}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      <span>Chennai, India</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* ── Glassmorphic Sign In / Registration Modal ── */}
      <AnimatePresence>
        {showAuthModal && (
          <div className={styles.modalOverlay} onClick={() => setShowAuthModal(false)}>
            <motion.div
              className={styles.authModalCard}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowAuthModal(false)}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>

              <div className={styles.modalHeader}>
                <div className={styles.modalLogo}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <h2 className={styles.modalTitle}>
                  {authMode === "login" ? "Sign in to Console" : "Register New Account"}
                </h2>
                <p className={styles.modalSubtitle}>
                  {authMode === "login"
                    ? "Enter credentials to access the debugging workspace"
                    : "Create a new user account saved to the server"}
                </p>

                {/* Modal Auth Switcher */}
                <div className={styles.authSwitchGroup}>
                  <button
                    type="button"
                    className={`${styles.authSwitchBtn} ${authMode === "login" ? styles.authSwitchActive : ""}`}
                    onClick={() => { setAuthMode("login"); setError(""); setSuccess(""); }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className={`${styles.authSwitchBtn} ${authMode === "register" ? styles.authSwitchActive : ""}`}
                    onClick={() => { setAuthMode("register"); setError(""); setSuccess(""); }}
                  >
                    Register
                  </button>
                </div>
              </div>

              <form className={styles.form} onSubmit={handleAuthSubmit}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="username">Username</label>
                  <input
                    id="username"
                    className={styles.input}
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. dev_engineer"
                    autoComplete="username"
                    autoFocus
                    disabled={loading}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="password">Password</label>
                  <input
                    id="password"
                    className={styles.input}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    disabled={loading}
                  />
                </div>

                {authMode === "register" && (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="role">Role</label>
                    <select
                      id="role"
                      className={styles.input}
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      disabled={loading}
                    >
                      <option value="developer">Developer</option>
                      <option value="qa_tester">QA Engineer</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                )}

                {error && <div className={styles.error}>{error}</div>}
                {success && <div className={styles.successMsg}>{success}</div>}

                <button
                  type="submit"
                  className={styles.modalSubmitBtn}
                  disabled={loading}
                >
                  {loading
                    ? (authMode === "login" ? "Authorizing…" : "Registering…")
                    : (authMode === "login" ? "Open Workspace" : "Create Account & Sign In")
                  }
                </button>

                <div className={styles.modalFooterPrompt}>
                  {authMode === "login" ? (
                    <p>
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        className={styles.promptLink}
                        onClick={() => { setAuthMode("register"); setError(""); setSuccess(""); }}
                      >
                        Create your account
                      </button>
                    </p>
                  ) : (
                    <p>
                      Already have an account?{" "}
                      <button
                        type="button"
                        className={styles.promptLink}
                        onClick={() => { setAuthMode("login"); setError(""); setSuccess(""); }}
                      >
                        Sign in here
                      </button>
                    </p>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className={styles.landingFooter}>
        <span>Python Debug Assistant &middot; Mindora Architecture</span>
        <span>Secure Local Execution &middot; AI Diagnostics</span>
      </footer>
    </div>
  );
}
