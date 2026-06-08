import { LandingPage } from "../pages/landing";
import { withLandingProviders } from "./providers";

const LandingApp = function LandingApp() {
  return <LandingPage />;
};

export const App = withLandingProviders(LandingApp);
