export interface TmuxWindowSizeFromPaneViewportArgs {
  viewportWidthPx: number;
  viewportHeightPx: number;
  cellWidthPx: number;
  cellHeightPx: number;
  activePaneCols: number;
  activePaneRows: number;
  totalWindowCols: number;
  totalWindowRows: number;
}

export function computeTmuxWindowSizeFromPaneViewport(
  args: TmuxWindowSizeFromPaneViewportArgs
): { cols: number; rows: number } | null {
  if (
    !Number.isFinite(args.viewportWidthPx)
    || !Number.isFinite(args.viewportHeightPx)
    || !Number.isFinite(args.cellWidthPx)
    || !Number.isFinite(args.cellHeightPx)
    || !Number.isFinite(args.activePaneCols)
    || !Number.isFinite(args.activePaneRows)
    || !Number.isFinite(args.totalWindowCols)
    || !Number.isFinite(args.totalWindowRows)
    || args.viewportWidthPx <= 0
    || args.viewportHeightPx <= 0
    || args.cellWidthPx <= 0
    || args.cellHeightPx <= 0
    || args.activePaneCols <= 0
    || args.activePaneRows <= 0
    || args.totalWindowCols <= 0
    || args.totalWindowRows <= 0
  ) {
    return null;
  }

  const inferredWindowWidthPx = args.viewportWidthPx * (args.totalWindowCols / args.activePaneCols);
  const inferredWindowHeightPx = args.viewportHeightPx * (args.totalWindowRows / args.activePaneRows);
  const cols = Math.max(2, Math.floor(inferredWindowWidthPx / args.cellWidthPx));
  const rows = Math.max(1, Math.floor(inferredWindowHeightPx / args.cellHeightPx));

  if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
    return null;
  }

  return { cols, rows };
}
