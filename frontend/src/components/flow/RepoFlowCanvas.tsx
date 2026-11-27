import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type XYPosition,
} from "@xyflow/react";
import { BranchSelector } from "../BranchSelector";
import { HistoryControls } from "../HistoryControls";
import { UtilityMenu } from "../UtilityMenu";
import { ZoomControls } from "../ZoomControls";
import type { GraphNode, GraphResponse } from "../../types/graph";
import { RepoEdge } from "./edges/RepoEdge";
import { exportDiagramImage } from "./export/exportDiagram";
import { GraphLegend } from "./GraphLegend";
import { BranchNode } from "./nodes/BranchNode";
import { CommitNode } from "./nodes/CommitNode";
import { buildHistoryEvents, visibleHistorySets } from "./history/flowHistory";
import {
  branchNodeHeight,
  branchNodeWidth,
  buildFlowElements,
  colorForBranch,
  commitNodeSize,
  initialVisibleBranches,
} from "./layout/flowLayout";
import type {
  ConnectionStyle,
  EdgeAnchorSide,
  EdgeEditState,
  FlowOrientation,
  RepoFlowEdge,
  RepoFlowNode,
} from "./types";
import { Button } from "primereact/button";
import { BranchSettingsPanel } from "./BranchSettingsPanel";
import {
  createDefaultBranchSettings,
  type BranchSettings
} from "./layout/branchSettings";

const nodeTypes: NodeTypes = {
  branch: BranchNode,
  commit: CommitNode,
};

const edgeTypes: EdgeTypes = {
  "repo-edge": RepoEdge,
};

interface RepoFlowCanvasProps {
  graph: GraphResponse | null;
  onNodeSelect?: (node: GraphNode) => void;
  onBranchesRequest?: (branches: string[]) => Promise<void>;
  onRefresh?: (branches: string[]) => void;
  refreshing?: boolean;
}

type NodePositionMap = Record<string, XYPosition>;
type FitBounds = { x: number; y: number; width: number; height: number };
type HistoryRenderSets = {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  fadingNodeIds: Set<string>;
  fadingEdgeIds: Set<string>;
};

const commitNodeWidth = 136;
const commitNodeHeight = 70;

function samePosition(left: XYPosition, right: XYPosition): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameFlowNode(left: RepoFlowNode, right: RepoFlowNode): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.className === right.className &&
    left.draggable === right.draggable &&
    samePosition(left.position, right.position) &&
    left.data.graphNode === right.data.graphNode &&
    left.data.label === right.data.label &&
