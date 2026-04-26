import { useEffect, useState } from "react";

const PLACEHOLDERS = [
  "Describe your startup idea...",
  "What is your next feature?",
  "What would you like to A/B test?",
  "What problem are you solving?",
  "What's your go-to-market hypothesis?",
];

export function useTypewriterPlaceholder() {
  const [displayed, setDisplayed] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [typing, setTyping] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const phrase = PLACEHOLDERS[phraseIdx];

    if (paused) {
      const id = window.setTimeout(() => {
        setPaused(false);
        setTyping(false);
      }, 1600);
      return () => window.clearTimeout(id);
    }

    if (typing) {
      if (displayed.length < phrase.length) {
        const id = window.setTimeout(() => {
          setDisplayed(phrase.slice(0, displayed.length + 1));
        }, 55);
        return () => window.clearTimeout(id);
      }
      setPaused(true);
      return;
    }

    if (displayed.length > 0) {
      const id = window.setTimeout(() => {
        setDisplayed((value) => value.slice(0, -1));
      }, 30);
      return () => window.clearTimeout(id);
    }

    setPhraseIdx((index) => (index + 1) % PLACEHOLDERS.length);
    setTyping(true);
  }, [displayed, typing, paused, phraseIdx]);

  return displayed;
}
