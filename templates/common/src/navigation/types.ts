export type RootTabParamList = {
  Home: undefined;
  Explore: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}
