export type RootTabParamList = {
  Home: undefined;
  Explore: undefined;
  // One tab per mini-app in miniapps.json, keyed by its name.
  [miniApp: string]: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}
