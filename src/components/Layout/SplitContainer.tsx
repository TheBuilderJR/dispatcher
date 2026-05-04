import type { LayoutNode } from "../../types/layout";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { SplitDivider } from "./SplitDivider";
import { TerminalPane } from "../Terminal/TerminalPane";

function findFirstLeafTerminalId(node: LayoutNode): string | null {
  if (node.type === "terminal") return node.terminalId;
  return findFirstLeafTerminalId(node.first);
}

interface SplitContainerProps {
  node: LayoutNode;
  layoutId: string;
  onSplit?: (terminalId: string, direction: "horizontal" | "vertical") => void;
  onClose?: (terminalId: string) => void;
  onTmuxPaneDragEnd?: (terminalId: string, direction: "horizontal" | "vertical", ratio: number, oldRatio: number) => void;
}

export function SplitContainer({
  node,
  layoutId,
  onSplit,
  onClose,
  onTmuxPaneDragEnd,
}: SplitContainerProps) {
  const setRatio = useLayoutStore((s) => s.setRatio);

  if (node.type === "terminal") {
    return (
      <TerminalPane
        key={node.terminalId}
        terminalId={node.terminalId}
        layoutId={layoutId}
        onSplit={onSplit}
        onClose={onClose}
      />
    );
  }

  const { direction, ratio, first, second } = node;
  const isHorizontal = direction === "horizontal";

  const handleDragEnd = onTmuxPaneDragEnd
    ? (finalRatio: number) => {
      const terminalId = findFirstLeafTerminalId(first);
      if (terminalId) {
        onTmuxPaneDragEnd(terminalId, direction, finalRatio, ratio);
      }
    }
    : undefined;

  return (
    <div
      className="split-container"
      style={{
        flexDirection: isHorizontal ? "row" : "column",
      }}
    >
      <div
        className="split-pane"
        style={
          isHorizontal
            ? { width: `${ratio * 100}%` }
            : { height: `${ratio * 100}%` }
        }
      >
        <SplitContainer
          node={first}
          layoutId={layoutId}
          onSplit={onSplit}
          onClose={onClose}
          onTmuxPaneDragEnd={onTmuxPaneDragEnd}
        />
      </div>
      <SplitDivider
        direction={direction}
        onResize={(r) => setRatio(layoutId, node.id, r)}
        onDragEnd={handleDragEnd}
      />
      <div
        className="split-pane"
        style={
          isHorizontal
            ? { width: `${(1 - ratio) * 100}%` }
            : { height: `${(1 - ratio) * 100}%` }
        }
      >
        <SplitContainer
          node={second}
          layoutId={layoutId}
          onSplit={onSplit}
          onClose={onClose}
          onTmuxPaneDragEnd={onTmuxPaneDragEnd}
        />
      </div>
    </div>
  );
}
