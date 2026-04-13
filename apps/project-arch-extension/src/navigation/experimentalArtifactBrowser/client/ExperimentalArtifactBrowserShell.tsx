import {
  ShellLayout,
  ShellNavigationFrame,
  ShellRegion,
  type ShellGuidancePayload,
  type ShellSurfaceSlot,
} from "../../preact";
import { artifactBrowserShellNavigationItems } from "./artifactBrowserShellConfig";

interface ExperimentalArtifactBrowserShellProps {
  readonly activeSurfaceId?: string;
  readonly activeGuidance?: ShellGuidancePayload;
  readonly isGuidanceRailOpen: boolean;
  readonly onSelectSurface: (surfaceId: string) => void;
  readonly onOpenGuidance: () => void;
  readonly onCloseGuidance: () => void;
  readonly slots: readonly ShellSurfaceSlot[];
}

export function ExperimentalArtifactBrowserShell(props: ExperimentalArtifactBrowserShellProps) {
  return (
    <ShellLayout>
      <ShellRegion slot="main">
        <ShellNavigationFrame
          items={artifactBrowserShellNavigationItems}
          activeSurfaceId={props.activeSurfaceId}
          onSelectSurface={props.onSelectSurface}
          activeGuidance={props.activeGuidance}
          isGuidanceRailOpen={props.isGuidanceRailOpen}
          onOpenGuidance={props.onOpenGuidance}
          onCloseGuidance={props.onCloseGuidance}
          slots={props.slots}
        />
      </ShellRegion>
    </ShellLayout>
  );
}
