import { applyEdits, type Edit, type LayoutSpec, type MenuDocument, type OverflowReport, type OverflowStep, type PageCountPreference } from "@menu-studio/shared";
import { useCallback, useRef, useState } from "react";
import { MenuRenderer } from "./MenuRenderer.tsx";
import { planFit, type PageMeasure } from "./overflow/plan.ts";

export interface AutoFitResult {
  spec: LayoutSpec;
  /** Edits that turn the input spec into the fitted spec, in order. */
  edits: Edit[];
  steps: string[];
  report: OverflowReport;
}

export interface AutoFitRunnerProps {
  document: MenuDocument;
  spec: LayoutSpec;
  pageCountPreference: PageCountPreference;
  maxIterations?: number;
  onDone: (result: AutoFitResult) => void;
}

/**
 * Renders the menu offscreen, measures, applies one fitting step, and repeats until the
 * layout fits or the engine is stuck. Deterministic for a given set of loaded fonts.
 */
export function AutoFitRunner({ document, spec, pageCountPreference, maxIterations = 16, onDone }: AutoFitRunnerProps) {
  const [current, setCurrent] = useState(spec);
  const edits = useRef<Edit[]>([]);
  const steps = useRef<string[]>([]);
  const applied = useRef<OverflowStep[]>([]);
  const done = useRef(false);

  const handleReport = useCallback(
    (report: OverflowReport, measures: PageMeasure[]) => {
      if (done.current) return;
      const finish = (message?: string) => {
        done.current = true;
        const final: OverflowReport = { ...report, appliedSteps: applied.current };
        if (message) final.message = message;
        onDone({ spec: current, edits: edits.current, steps: steps.current, report: final });
      };
      if (!report.fontsLoaded) return finish("Fonts did not load, so the layout could not be measured reliably.");
      const plan = planFit(current, measures, { pageCountPreference });
      if (plan.kind === "fits") return finish();
      if (plan.kind === "stuck") return finish(plan.message);
      if (edits.current.length >= maxIterations) return finish("Stopped after the maximum number of fitting steps.");
      const result = applyEdits({ document, spec: current }, [plan.edit]);
      if (!result.ok || !result.docs.spec) return finish(result.ok ? "Fitting produced no layout." : result.error.message);
      edits.current.push(plan.edit);
      steps.current.push(plan.description);
      applied.current.push(plan.step);
      setCurrent(result.docs.spec);
    },
    [current, document, maxIterations, onDone, pageCountPreference],
  );

  return (
    <div className="ms-offscreen" aria-hidden>
      <MenuRenderer document={document} spec={current} mode="print" onReport={handleReport} />
    </div>
  );
}
