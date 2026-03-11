import { useState, useRef, useEffect } from "react";

interface NameDialogProps {
  title: string;
  placeholder: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function NameDialog({ title, placeholder, onConfirm, onCancel }: NameDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        <input
          ref={inputRef}
          className="dialog-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dialog-btn dialog-btn-confirm"
            onClick={handleSubmit}
            disabled={!value.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
