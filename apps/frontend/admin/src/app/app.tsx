import { useEffect, useState } from "react";
import {
  FrontendQueryProvider,
  FrontendStateProvider,
  UiErrorBoundary,
} from "@app/frontend-ui";
import { getInitialBearerToken, scrubLegacyAuthTokenParams } from "./bootstrap";
import { AdminRootPage } from "../pages/root";

const App = () => {
  const [initialBearerToken] = useState(getInitialBearerToken);

  useEffect(() => {
    scrubLegacyAuthTokenParams();
  }, []);

  return (
    <FrontendStateProvider initialBearerToken={initialBearerToken ?? ""}>
      <FrontendQueryProvider>
        <UiErrorBoundary>
          <AdminRootPage initialBearerToken={initialBearerToken} />
        </UiErrorBoundary>
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
};

export default App;
