import { ArrowRight } from "lucide-react";
import { useState } from "react";

interface IdeaPromptBarProps {
  idea: string;
  isOrchestrating: boolean;
  onIdeaChange: (value: string) => void;
  onRerun: () => void;
}

export function IdeaPromptBar({
  idea,
  isOrchestrating,
  onIdeaChange,
  onRerun,
}: IdeaPromptBarProps) {
  const [committed, setCommitted] = useState(idea);
  const [focused, setFocused] = useState(false);
  const changed = idea !== committed;

  const handleRerun = () => {
    setCommitted(idea);
    onRerun();
  };

  return (
    <div className={`idea-bar${focused ? " focused" : ""}${changed ? " changed" : ""}`}>
      <div style={{ flex: 1 }}>
        <div className="idea-bar-label">Your Idea</div>
        <textarea
          value={idea}
          onChange={(event) => onIdeaChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={2}
          className="idea-bar-textarea"
        />
      </div>
      <button
        className="btn-primary"
        onClick={handleRerun}
        disabled={isOrchestrating || !idea.trim() || !changed}
        style={{
          opacity: !changed ? 0.35 : 1,
          transition: "opacity 0.2s",
          flexShrink: 0,
          alignSelf: "center",
        }}
      >
        {isOrchestrating ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <ArrowRight size={15} />}
        {isOrchestrating ? "Running..." : "Modify"}
      </button>
    </div>
  );
}
