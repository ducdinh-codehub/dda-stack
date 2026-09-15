export type RootTabParamList = {
  Home: undefined;
  Explore: undefined;
  MiniApp: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}
