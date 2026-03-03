import { ExpoUpContextVariables } from "./types";

export interface ConfigureExpoUpBindings<TBindings extends object = object> {
  Bindings: TBindings;
  Variables: ExpoUpContextVariables;
}

export interface CreateExpoUpServerBindings {
  Variables: ExpoUpContextVariables;
}

export interface AppBindings extends CreateExpoUpServerBindings {}
