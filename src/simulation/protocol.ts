// What the screen and the simulation thread say to each other.
import type { Layout, SimulationFrame } from '../engine/simulate';
import type { Plan } from '../model/plan';
import type { SimulationInput } from '../model/types';

export interface SimulationRequest {
  input: SimulationInput;
  years: number;
}

export interface SimulationUpdate extends SimulationFrame {
  layout: Layout;
}

export interface PlanRequest {
  input: SimulationInput;
}

export type PlanUpdate = Plan;
